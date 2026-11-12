import { SimonScene } from './SimonScene.js';
import { el } from '../../../engine/utils/dom.js';
import { sleep } from '../../../engine/utils/timer.js';
import { createMachine } from '../../../engine/utils/stateMachine.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createProgressBar } from '../../../engine/ui/ProgressBar.js';
import { getLevel } from '../logic/levels.js';
import { padsFor } from '../logic/pads.js';
import { SimonGame } from '../logic/simonGame.js';
import { SIMON_PLAY_FLOW } from '../logic/playFlow.machine.js';
import { playbackTimings } from '../logic/timings.js';
import { playSequence } from '../logic/sequencePlayer.js';

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
  /** What the screen is doing now. The legal moves are in `playFlow.machine.js`. */
  #flow = createMachine(SIMON_PLAY_FLOW);
  #remaining = 0;
  #flash = new Map();
  #offs = [];

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
    this.#pads = this.createPads({ pads: padsFor(this.#level.pads), onPress: (id) => this.#press(id) });
    this.#lengthEl = el('p', { class: 'simon__length', attrs: { 'aria-live': 'off' } });
    this.#statusEl = el('p', { class: 'simon__status', attrs: { role: 'status' } });
    this.#timer = createProgressBar({ label: 'Time to answer', max: 100, value: 0 });
    this.#timer.el.classList.add('simon__timer');
    this.#replayButton = createButton({ label: 'Replay', icon: '🔁', onClick: () => this.#replay() });

    this.ui.append(this.#hud.el, this.layout({
      display: el('div', { class: 'simon__display' }, this.#lengthEl, this.#statusEl),
      pads: this.#pads, timer: this.#timer.el,
      controls: el('div', { class: 'simon__controls' }, this.#replayButton),
      note: el('p', { class: 'simon__note', text: this.mode === 'reverse' ? 'Reverse: play it BACKWARDS. Keys 1-6 work too.' : 'Keys 1-6 play the pads too.' }),
    }));

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
    this.#flow.send('LEAVE');
    this.#abort.abort(); // stops the sequence player and every pending pause
    for (const off of this.#offs) off();
    this.#offs = [];
    this.#pads?.dispose?.();
  }

  /**
   * Puts the screen's parts together. The default is the flat game: the length and the status, the pads, the answer clock, Replay and a note. The 3D
   * game overrides this to put the picture of the pads on top and everything else in a panel.
   * @param {{ display: HTMLElement, pads: { el: HTMLElement }, timer: HTMLElement, controls: HTMLElement, note: HTMLElement }} parts
   * @returns {HTMLElement} The `main` element.
   */
  layout({ display, pads, timer, controls, note }) {
    return el('main', { class: 'simon' }, display, pads.el, timer, controls, note);
  }

  // ----------------------------------------------------------- sequence

  /** Plays the current sequence, then opens the input window. */
  async #run(message, delayMs = 0) {
    const { audio } = this.services;
    // The caller has already moved the flow to `listening`.
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
      // Cancelled (tab hidden or child left): the flow already knows why, and showing the tab resumes it.
      if (!played) return;
    } catch (error) {
      if (error?.code === 'ABORTED') return;
      throw error;
    }
    // Refused if the flow moved on (hidden or left) while the last note was finishing.
    if (!this.#flow.send('PLAYED')) return;
    this.#game.beginInput();
    this.#openInput();
  }

  #openInput() {
    this.#pads.setEnabled(true);
    this.#remaining = this.#level.timeoutSeconds;
    this.#status(this.mode === 'reverse' ? 'Your turn: play it backwards!' : 'Your turn!');
    setDisabled(this.#replayButton, !this.#game.replayAvailable);
  }

  async #replay() {
    if (!this.#flow.is('answering') || !this.#game.useReplay()) return;
    this.#flow.must('REPLAY');
    await this.#run('Listen…');
    // The sequence replays without penalty; #run reopens input when it ends.
  }

  #onVisibility(hidden) {
    if (hidden) {
      // Only a sequence or a pause is cancelled; while the child is answering, the (frame-driven) clock freezes by itself.
      if (this.#flow.send('HIDE')) {
        this.#abort.abort();
        this.#abort = new AbortController();
        this.#pads.light(-1, false);
      }
    } else if (this.#flow.send('SHOW')) {
      if (this.#flow.is('between')) this.#nextRound();
      else this.#run('Welcome back. Listen again!', 400);
    }
  }

  // -------------------------------------------------------------- input

  #press(padId) {
    // Taps while the sequence plays are ignored, not queued (the pads look disabled, too).
    if (!this.#flow.is('answering') || this.#game.phase !== 'input') return;
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
      this.#flow.must('ROUND_DONE');
      this.#pads.setEnabled(false);
      this.#timer.set(0);
      audio.play('arpeggio');
      this.#status(`Great! ${this.#game.best} in a row.`);
      this.#hud.setStat('best', this.#game.best);
      this.#nextRound();
    } else if (result === 'retry') {
      this.#flow.must('RETRY');
      audio.play('hmm');
      this.#run(timedOut ? "Time's up! Listen again!" : 'Listen again!', 600);
    } else if (result === 'gameOver') {
      this.#flow.must('GAME_OVER');
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
    if (!this.#flow.send('NEXT')) return;
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
    this.#pads.tick?.(dt);
    for (const [padId, left] of this.#flash) {
      if (left - dt <= 0) { this.#flash.delete(padId); this.#pads.light(padId, false); } else this.#flash.set(padId, left - dt);
    }
    if (!this.#flow.is('answering')) return;
    // The answer clock only runs while the child may answer; after it runs out it counts as a wrong tap.
    this.#remaining -= dt;
    this.#timer.set(Math.max(0, (this.#remaining / this.#level.timeoutSeconds) * 100));
    if (this.#remaining <= 0) this.#handle(this.#game.timeout(), true);
  }

  render() {
    this.#pads?.draw?.();
  }

  // ------------------------------------------------------------ display

  #showLength() {
    this.#lengthEl.textContent = `Length ${this.#game.sequence.length}`;
  }

  #status(text) {
    this.#statusEl.textContent = text;
  }
}
