import { RacingScene } from './RacingScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { GameError } from '../../../engine/utils/errors.js';
import { Race } from '../logic/race.js';
import { getLevel, RACE_LENGTH, WOBBLE_MS } from '../logic/levels.js';
import { ghostProgressAt } from '../logic/ghost.js';
import { loadGhost, readWeights, tablesKey } from '../logic/saveData.js';
import { formatTime } from '../logic/scoring.js';
import { createAnswerPanel } from '../ui/AnswerPanel.js';
import { drawTrack } from '../ui/TrackRenderer.js';

/** "Ready, set, go" lasts this long; the clock starts at "Go!". */
const COUNTDOWN_SECONDS = 2.2;
const FINISH_SECONDS = 1.5;
const BOOST_SECONDS = 0.5;
/** How quickly a car catches up with its target spot (larger is snappier). */
const EASE_PER_SECOND = 5;
const FEEDBACK_SECONDS = 0.7;

/** The race itself: the track on the canvas, and the question and answers below it. */
export class RaceScene extends RacingScene {
  #race = null;
  #level = null;
  #setup = null;
  #ghost = null;
  #reduced = false;
  #phase = 'countdown';
  #paused = false;
  #elapsedMs = 0;
  #countdown = COUNTDOWN_SECONDS;
  #finishTimer = 0;
  #lock = 0;
  #feedbackTtl = 0;
  #hudClock = 0;

  // drawing state
  #width = 0;
  #height = 0;
  #trackRect = { x: 0, y: 0, w: 0, h: 0 };
  #sinceMeasure = 0;
  #time = 0;
  #scroll = 0;
  #wheel = 0;
  #shownPlayer = 0;
  #shownGhost = 0;
  #wobble = 0;
  #boost = 0;

  // DOM
  #hud = null;
  #trackEl = null;
  #bannerEl = null;
  #panel = null;
  #pauseEl = null;
  #resumeButton = null;
  #announcer = null;
  #offs = [];

  /** @param {import('./RacingScene.js').RaceSetup} setup */
  enter(setup) {
    const { services } = this;
    this.#setup = setup;
    this.#level = getLevel(setup.levelId);
    this.#reduced = prefersReducedMotion();
    const { extra } = services.rewards.getSave(services.game.slug);
    this.#race = new Race({ levelId: setup.levelId, tables: setup.tables, rng: services.rng, weights: readWeights(extra) });
    this.#ghost = loadGhost(extra, setup.levelId, tablesKey(setup.tables, this.#level), this.#level.ghostPaceMs);

    // Engine and tyre sounds are synthesised like every other sound in the game.
    services.audio.registerSound('vroom', [
      { f: 110, ms: 55, type: 'sawtooth', volume: 0.1 }, { f: 170, ms: 55, type: 'sawtooth', volume: 0.1 }, { f: 260, ms: 90, type: 'sawtooth', volume: 0.1 },
    ]);
    services.audio.registerSound('squeak', [{ f: 1500, ms: 60, type: 'square', volume: 0.06 }, { f: 950, ms: 110, type: 'square', volume: 0.06 }]);

    this.ui.classList.add('race');
    this.#buildDom();
    this.#syncHud();

    this.#offs.push(
      services.input.on('key', (event) => this.#onKey(event)),
      services.input.on('visibility', ({ hidden }) => { if (hidden) this.#setPaused(true); }),
    );
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
  }

  resize(width, height) {
    this.#width = width;
    this.#height = height;
    this.#measure();
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services } = this;
    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'done', label: 'Done' }, { id: 'time', label: 'Time' }],
      onSettings: () => this.#openSettings(),
    });

    this.#bannerEl = el('div', { class: 'race__banner', attrs: { 'aria-hidden': 'true' } });
    this.#trackEl = el('div', { class: 'race__track', attrs: { role: 'img', 'aria-label': 'Race track: your car and the ghost car' } }, this.#bannerEl);

    this.#panel = createAnswerPanel({ mode: this.#level.mode, onAnswer: (value) => this.#onAnswer(value) });
    this.#panel.setQuestion(this.#race.question, this.#race.options);
    this.#panel.setDisabled(true); // until "Go!"

    this.#resumeButton = createButton({ label: 'Resume', icon: '▶', variant: 'primary', big: true, onClick: () => this.#setPaused(false) });
    this.#pauseEl = el('div', { class: 'race__pause', attrs: { role: 'dialog', 'aria-label': 'Race paused' } },
      el('h2', { text: 'Paused' }), el('p', { text: 'The clock has stopped.' }), this.#resumeButton);
    this.#pauseEl.hidden = true;

    this.#announcer = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
    this.ui.append(this.#hud.el, el('div', { class: 'race__stage' }, this.#trackEl, this.#panel.el, this.#pauseEl), this.#announcer);
  }

  #syncHud() {
    this.#hud.setStat('done', `${this.#race.correct}/${RACE_LENGTH}`);
    this.#hud.setStat('time', formatTime(this.#elapsedMs));
  }

  #announce(text) {
    this.#announcer.textContent = text;
  }

  // ----------------------------------------------------------------- input

  #onKey(event) {
    if (this.#phase === 'done') return;
    if (event.key === 'Escape') {
      this.#setPaused(!this.#paused);
      return;
    }
    if (this.#paused || this.#phase !== 'racing' || this.#lock > 0) return;
    // Keys 1 to 4 choose an answer button. (In typing mode the digits go into the box instead.)
    if (this.#level.mode === 'choice' && /^[1-4]$/.test(event.key) && !event.repeat) this.#panel.choose(Number(event.key) - 1);
  }

  async #openSettings() {
    this.#setPaused(true);
    await this.services.openSettings();
    // Stay paused: the Resume button is the clear way back, so the clock never runs under the dialog.
  }

  #setPaused(paused) {
    if (this.#phase === 'finishing' || this.#phase === 'done' || paused === this.#paused) return;
    this.#paused = paused;
    this.#pauseEl.hidden = !paused;
    this.#panel.setDisabled(paused || this.#phase !== 'racing' || this.#lock > 0);
    if (paused) this.#resumeButton.focus();
    else this.#panel.focus();
    this.#announce(paused ? 'Paused' : 'Back in the race');
  }

  /** @param {number|string} value */
  #onAnswer(value) {
    if (this.#phase !== 'racing' || this.#paused || this.#lock > 0) return;
    const { audio } = this.services;
    const result = this.#race.answer(value, this.#elapsedMs);
    const handlers = {
      invalid: () => this.#showFeedback('Type a number.', 'info'),
      correct: () => {
        audio.play('vroom');
        this.#boost = 1;
        this.#syncHud();
        this.#showFeedback('Vroom!', 'good');
        if (result.finished) this.#beginFinish();
        else this.#panel.setQuestion(this.#race.question, this.#race.options);
      },
      wrong: () => {
        audio.play('squeak');
        this.#wobble = 1;
        this.#lock = WOBBLE_MS / 1000;
        this.#panel.setDisabled(true);
        this.#panel.showReveal(result.equation);
        this.#showFeedback('Not quite. Here is the fact:', 'bad');
        this.#announce(`Not quite. ${result.equation}`);
      },
    };
    const handle = handlers[result.kind];
    if (!handle) throw new GameError('BAD_ANSWER_OUTCOME', `Unknown answer outcome "${result.kind}"`, { kind: result.kind });
    handle();
  }

  #showFeedback(text, tone) {
    this.#panel.setFeedback(text, tone);
    this.#feedbackTtl = FEEDBACK_SECONDS;
  }

  #beginFinish() {
    this.#phase = 'finishing';
    this.#finishTimer = FINISH_SECONDS;
    this.#panel.setDisabled(true);
    this.services.audio.play('cheer');
    this.#bannerEl.textContent = 'Finish!';
    this.#bannerEl.hidden = false;
    this.#announce('You crossed the finish line!');
  }

  // ------------------------------------------------------------------ loop

  update(dt) {
    if (this.#paused) return;
    this.#time += dt;
    this.#sinceMeasure += dt;
    if (this.#sinceMeasure > 0.5) this.#measure(); // fonts and wrapping can change the panel height

    if (this.#feedbackTtl > 0) {
      this.#feedbackTtl -= dt;
      if (this.#feedbackTtl <= 0 && this.#lock <= 0) this.#panel.setFeedback('', 'info');
    }
    this.#wobble = Math.max(0, this.#wobble - dt / (WOBBLE_MS / 1000));
    this.#boost = Math.max(0, this.#boost - dt / BOOST_SECONDS);

    if (this.#phase === 'countdown') {
      this.#countdown -= dt;
      this.#bannerEl.hidden = false;
      this.#bannerEl.textContent = this.#countdown > 1.2 ? 'Ready…' : this.#countdown > 0.4 ? 'Set…' : 'Go!';
      if (this.#countdown <= 0) {
        this.#phase = 'racing';
        this.#bannerEl.hidden = true;
        this.#panel.setDisabled(false);
        this.#panel.focus();
        this.#announce('Go!');
      }
    } else if (this.#phase === 'racing') {
      this.#elapsedMs += dt * 1000;
      if (this.#lock > 0) {
        this.#lock -= dt;
        if (this.#lock <= 0) {
          this.#panel.setQuestion(this.#race.question, this.#race.options);
          this.#panel.setDisabled(false);
          this.#panel.setFeedback('', 'info');
          this.#panel.focus();
        }
      }
      this.#hudClock += dt;
      if (this.#hudClock >= 0.1) {
        this.#hudClock = 0;
        this.#hud.setStat('time', formatTime(this.#elapsedMs));
      }
    } else if (this.#phase === 'finishing') {
      this.#finishTimer -= dt;
      if (this.#finishTimer <= 0) {
        this.#phase = 'done';
        this.routes.results({ ...this.#setup, summary: this.#race.summary(), ghost: this.#ghost });
        return;
      }
    }

    this.#animateCars(dt);
  }

  /** Cars glide to where they should be, and only ever forwards: the target never decreases, so neither does a car. */
  #animateCars(dt) {
    const ease = 1 - Math.exp(-EASE_PER_SECOND * dt);
    const ghostTarget = this.#phase === 'countdown' ? 0 : ghostProgressAt(this.#ghost.run, this.#elapsedMs);
    const nextPlayer = this.#shownPlayer + (this.#race.progress - this.#shownPlayer) * ease;
    const nextGhost = this.#shownGhost + (ghostTarget - this.#shownGhost) * ease;
    const moved = Math.max(0, nextPlayer - this.#shownPlayer);
    this.#shownPlayer = Math.max(this.#shownPlayer, nextPlayer);
    this.#shownGhost = Math.max(this.#shownGhost, nextGhost);
    // The scenery scrolls and the wheels turn faster the faster the player's car is moving.
    const speed = dt > 0 ? moved / dt : 0;
    if (!this.#reduced) {
      this.#scroll += (20 + speed * 2600) * dt;
      this.#wheel += (3 + speed * 220) * dt;
    }
  }

  #measure() {
    this.#sinceMeasure = 0;
    if (!this.#trackEl) return;
    const origin = this.ui.getBoundingClientRect();
    const box = this.#trackEl.getBoundingClientRect();
    this.#trackRect = { x: box.left - origin.left, y: box.top - origin.top, w: box.width, h: box.height };
  }

  render(ctx) {
    if (!ctx || !this.#width) return;
    drawTrack(ctx, this.#trackRect, {
      player: this.#shownPlayer, ghost: this.#shownGhost, scroll: this.#scroll, time: this.#time,
      wobble: this.#wobble, boost: this.#boost, wheel: this.#wheel, reduced: this.#reduced, count: RACE_LENGTH,
    });
  }
}
