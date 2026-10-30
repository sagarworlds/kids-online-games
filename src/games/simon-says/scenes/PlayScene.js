import { SimonScene } from './SimonScene.js';
import { el } from '../../../engine/utils/dom.js';
import { sleep } from '../../../engine/utils/timer.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createProgressBar } from '../../../engine/ui/ProgressBar.js';
import { getLevel } from '../logic/levels.js';
import { padsFor } from '../logic/pads.js';
import { SimonGame } from '../logic/simonGame.js';
import { playbackTimings } from '../logic/timings.js';
import { playSequence } from '../logic/sequencePlayer.js';
import { createPadBoard } from '../ui/PadBoard.js';

/** A pad the child taps stays lit this long. */
const TAP_FLASH_SECONDS = 0.22;
/** Pauses between the steps of a round, so it never feels rushed. */
const READY_MS = 700;
const NEXT_ROUND_MS = 900;
const GAME_OVER_MS = 1200;

/**
 * Gameplay for Classic and Reverse: watch the sequence, play it back; every round adds a step.
 * The rules live in {@link SimonGame}; this scene plays the sound and light show, runs the answer clock, and blocks
 * input while the sequence plays. Everything it starts can be cancelled (AbortController), so nothing lights or
 * sounds after the child leaves.
 */
export class PlayScene extends SimonScene {
  #level = null;
  #game = null;
  #pads = null;
  #hud = null;
  #statusEl = null;
  #lengthEl = null;
  #timer = null;
  #replayButton = null;
  #abort = new AbortController();
  #accepting = false;
  #remaining = 0;
  #flash = new Map();
  #offs = [];
  #leftEarly = false;
  #needsReplay = false;

  /** @param {{ levelId: 'easy'|'medium'|'hard', mode: 'classic'|'reverse' }} params */
  enter({ levelId, mode }) {
    const { services } = this;
    this.#level = getLevel(levelId);
    this.mode = mode;
    this.levelId = levelId;
    this.#game = new SimonGame({ pads: this.#level.pads, startLength: this.#level.startLength, reverse: mode === 'reverse', rng: services.rng });

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'best', label: 'Best' }],
      onSettings: () => services.openSettings(),
    });
    this.#pads = createPadBoard({ pads: padsFor(this.#level.pads), onPress: (id) => this.#press(id) });
    this.#lengthEl = el('p', { class: 'simon__length', attrs: { 'aria-live': 'off' } });
    this.#statusEl = el('p', { class: 'simon__status', attrs: { role: 'status' } });
    this.#timer = createProgressBar({ label: 'Time to answer', max: 100, value: 0 });
    this.#timer.el.classList.add('simon__timer');
    this.#replayButton = createButton({ label: 'Replay', icon: '🔁', onClick: () => this.#replay() });

    this.ui.append(this.#hud.el, el('main', { class: 'simon' },
      el('div', { class: 'simon__display' }, this.#lengthEl, this.#statusEl),
      this.#pads.el, this.#timer.el,
      el('div', { class: 'simon__controls' }, this.#replayButton),
      el('p', { class: 'simon__note', text: this.mode === 'reverse' ? 'Reverse: play it BACKWARDS. Keys 1-6 work too.' : 'Keys 1-6 play the pads too.' })));

    this.#offs.push(
      services.input.on('key', (event) => {
        const pad = padsFor(this.#level.pads).find((p) => p.key === event.key);
        if (pad) this.#press(pad.id);
      }),
      // A hidden tab would carry on playing to nobody: stop, and play it again when the child is back.
      services.input.on('visibility', ({ hidden }) => this.#onVisibility(hidden)),
    );

    this.#game.start();
    this.#showLength();
    this.#run('Get ready…', READY_MS);
  }

  exit() {
    this.#leftEarly = true;
    this.#abort.abort(); // stops the sequence player and every pending pause
    for (const off of this.#offs) off();
    this.#offs = [];
  }

  // ----------------------------------------------------------- sequence

  /** Plays the current sequence, then opens the input window. */
  async #run(message, delayMs = 0) {
    const { audio } = this.services;
    this.#accepting = false;
    this.#pads.setEnabled(false);
    this.#timer.set(0);
    setDisabled(this.#replayButton, true);
    this.#status(message);
    try {
      if (delayMs) await sleep(delayMs, this.#abort.signal);
      const { noteMs, gapMs } = playbackTimings(this.#level.noteMs, this.#game.roundsCompleted);
      this.#status(this.#game.phase === 'retry' ? 'Listen again!' : 'Watch and listen…'); // after the pause, so the reason above stays readable first
      const played = await playSequence({
        sequence: this.#game.sequence, noteMs, gapMs, signal: this.#abort.signal, sleep,
        light: (id, on) => this.#pads.light(id, on),
        tone: (id, ms) => audio.playTone(padsFor(6)[id].freqHz, ms),
      });
      if (!played) {
        this.#needsReplay = !this.#leftEarly; // cancelled by a hidden tab, not by leaving
        return;
      }
    } catch (error) {
      if (error?.code === 'ABORTED') return;
      throw error;
    }
    this.#game.beginInput();
    this.#openInput();
  }

  #openInput() {
    this.#accepting = true;
    this.#pads.setEnabled(true);
    this.#remaining = this.#level.timeoutSeconds;
    this.#status(this.mode === 'reverse' ? 'Your turn: play it backwards!' : 'Your turn!');
    setDisabled(this.#replayButton, !this.#game.replayAvailable);
  }

  async #replay() {
    if (!this.#accepting || !this.#game.useReplay()) return;
    await this.#run('Listen…');
    // The sequence replays without penalty; #run reopens input when it ends.
  }

  #onVisibility(hidden) {
    if (hidden) {
      if (!this.#accepting && this.#game.phase !== 'over') {
        this.#abort.abort();
        this.#abort = new AbortController();
        this.#pads.light(-1, false);
      }
    } else if (this.#needsReplay) {
      this.#needsReplay = false;
      this.#run('Welcome back. Listen again!', 400);
    }
  }

  // -------------------------------------------------------------- input

  #press(padId) {
    // Taps while the sequence plays are ignored, not queued (the pads look disabled, too).
    if (!this.#accepting || this.#game.phase !== 'input') return;
    const { audio } = this.services;
    const pad = padsFor(this.#level.pads).find((p) => p.id === padId);
    audio.playTone(pad.freqHz, 260);
    this.#pads.light(padId, true);
    this.#flash.set(padId, TAP_FLASH_SECONDS);

    this.#handle(this.#game.press(padId));
  }

  /** @param {import('../logic/simonGame.js').PressResult} result @param {boolean} [timedOut] Say why: "Time's up!" must not be overwritten. */
  #handle(result, timedOut = false) {
    const { audio } = this.services;
    if (result === 'ok') {
      this.#remaining = this.#level.timeoutSeconds;
    } else if (result === 'roundComplete') {
      this.#accepting = false;
      this.#pads.setEnabled(false);
      this.#timer.set(0);
      audio.play('arpeggio');
      this.#status(`Great! ${this.#game.best} in a row.`);
      this.#hud.setStat('best', this.#game.best);
      this.#nextRound();
    } else if (result === 'retry') {
      this.#accepting = false;
      audio.play('hmm');
      this.#run(timedOut ? "Time's up! Listen again!" : 'Listen again!', 600);
    } else if (result === 'gameOver') {
      this.#accepting = false;
      this.#pads.setEnabled(false);
      audio.play('hmm');
      this.#status(timedOut ? "Time's up! Let us see how you did…" : 'Good try! Let us see how you did…');
      this.#finish();
    }
  }

  async #nextRound() {
    try {
      await sleep(NEXT_ROUND_MS, this.#abort.signal);
    } catch (error) {
      if (error?.code === 'ABORTED') return;
      throw error;
    }
    this.#game.addStep();
    this.#showLength();
    this.#run('Watch and listen…');
  }

  async #finish() {
    try {
      await sleep(GAME_OVER_MS, this.#abort.signal);
    } catch (error) {
      if (error?.code === 'ABORTED') return;
      throw error;
    }
    this.routes.results({ levelId: this.levelId, mode: this.mode, longest: this.#game.best });
  }

  // --------------------------------------------------------------- loop

  update(dt) {
    for (const [padId, left] of this.#flash) {
      if (left - dt <= 0) { this.#flash.delete(padId); this.#pads.light(padId, false); } else this.#flash.set(padId, left - dt);
    }
    if (!this.#accepting) return;
    // The answer clock only runs while the child may answer; after it runs out it counts as a wrong tap.
    this.#remaining -= dt;
    this.#timer.set(Math.max(0, (this.#remaining / this.#level.timeoutSeconds) * 100));
    if (this.#remaining <= 0) this.#handle(this.#game.timeout(), true);
  }

  // ------------------------------------------------------------ display

  #showLength() {
    this.#lengthEl.textContent = `Length ${this.#game.sequence.length}`;
  }

  #status(text) {
    this.#statusEl.textContent = text;
  }
}
