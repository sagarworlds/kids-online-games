import { TraceBase } from './TraceBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { createMachine } from '../../../engine/utils/stateMachine.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { LEVELS, pickGlyphs, glyphStars, effectiveTolerance } from '../logic/levels.js';
import { SETS } from '../logic/glyphs/index.js';
import { GlyphTracer, demoTimeline, demoState } from '../logic/trace.js';
import { GLYPH_FLOW } from '../logic/glyphFlow.machine.js';
import { createTraceBoard } from '../ui/TraceBoard.js';

const TONE_ICON = { good: '✔', bad: '✖', info: 'ℹ' };
/** After the last stroke the finished glyph is shown for this long before the Next button is the only thing left to do. */
const MOVE_ON_STARS = 1;

/**
 * Tracing: a round of letters, numbers or words. For each glyph a pencil first shows how to write it (the strokes in order, each
 * from its numbered dot), then the child traces it. The snail only moves while the pencil is on the path.
 */
export class TraceScene extends TraceBase {
  #level = null;
  #set = null;
  #glyphs = [];
  #index = 0;
  #results = [];
  #board = null;
  #tracer = null;
  #glyph = null;
  #ink = [];
  #off = false;
  #timeline = null;
  #demoTime = 0;
  /** Where the screen is for the current glyph; the legal moves are in `glyphFlow.machine.js`. */
  #flow = createMachine(GLYPH_FLOW);
  #mistakes = 0;

  #hud = null;
  #stage = null;
  #noteEl = null;
  #watch = null;
  #skip = null;
  #next = null;

  /** @param {{ setId: string, levelId: 'easy'|'medium'|'hard' }} params */
  enter({ setId, levelId }) {
    const { services } = this;
    this.#level = LEVELS[levelId];
    if (!this.#level) throw new GameError('UNKNOWN_LEVEL', `There is no level "${levelId}"`, { levelId });
    this.#set = SETS[setId];
    if (!this.#set || !this.#level.setIds.includes(setId)) throw new GameError('UNKNOWN_SET', `The ${levelId} level has no set "${setId}"`, { setId, levelId });
    this.#glyphs = pickGlyphs(setId, this.#level.perRound, services.rng);

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: this.#set.label,
      stats: [{ id: 'glyph', label: 'Round' }],
      onSettings: () => services.openSettings(),
    });
    this.#stage = el('div', { class: 'stage' });
    this.#noteEl = el('p', { class: 'trace__note', attrs: { role: 'status' } });
    this.#watch = createButton({ label: 'Watch', icon: '✏️', onClick: () => { if (this.#flow.send('WATCH')) this.#beginDemo(); } });
    this.#skip = createButton({ label: 'Skip', icon: '⏭', ariaLabel: 'Skip this one', onClick: () => this.#finish(true) });
    this.#next = createButton({ label: 'Next', icon: '▶', variant: 'primary', big: true, onClick: () => this.#advance() });
    this.#next.hidden = true;
    if (prefersReducedMotion()) this.#watch.hidden = true;

    this.ui.classList.add('trace-scene');
    this.ui.append(this.#hud.el, el('main', { class: 'trace' }, this.#stage, this.#noteEl,
      el('div', { class: 'trace__actions' }, this.#watch, this.#skip, this.#next)));
    this.#show();
  }

  // ----------------------------------------------------------------- a glyph

  #show() {
    const glyph = this.#glyphs[this.#index];
    this.#glyph = glyph;
    this.#mistakes = 0;
    this.#ink = [];
    this.#off = false;
    this.#next.hidden = true;
    this.#watch.disabled = false;
    this.#skip.hidden = false;
    this.#board = createTraceBoard({
      glyph,
      onDown: (point) => this.#down(point),
      onMove: (point) => this.#move(point),
      onUp: () => this.#up(),
    });
    this.#stage.replaceChildren(el('div', { class: 'stage__label', text: glyph.char, attrs: { lang: this.#set.guide === 'headline' ? 'hi' : 'en' } }), this.#board.el);
    this.#hud.setStat('glyph', `${this.#index + 1}/${this.#glyphs.length}`);
    this.#tracer = null;
    // The tolerance depends on how big the page is on this screen, which is only known once it is in the document.
    requestAnimationFrame(() => this.#begin());
  }

  /** Starts a glyph: the tracing rules (sized for this screen) and, unless motion is reduced, the demonstration first. */
  #begin() {
    // Refused if the glyph was skipped before this frame arrived.
    if (!this.#board || !this.#flow.is('starting')) return;
    this.#tracer = new GlyphTracer(this.#glyph.strokes, { tolerance: effectiveTolerance(this.#level, this.#board.scale()) });
    this.#board.setCurrent(0);
    this.#timeline = demoTimeline(this.#glyph.strokes);
    if (prefersReducedMotion()) {
      this.#flow.must('BEGIN_TURN');
      this.#yourTurn();
    } else {
      this.#flow.must('SHOW_DEMO');
      this.#beginDemo();
    }
  }

  /** Starts showing the demonstration (the flow is already `demoing`). */
  #beginDemo() {
    this.#demoTime = 0;
    this.#board.lock(true);
    this.#board.setSnail(null);
    this.#say('Watch the pencil. It starts at each numbered dot.', 'info');
  }

  /** Hands over to the child (the flow is already `tracing`). */
  #yourTurn() {
    this.#board.setDemo(null);
    this.#board.lock(false);
    this.#board.setCurrent(this.#tracer.current);
    this.#showSnail();
    this.#say(`Your turn! Start at dot ${this.#tracer.current + 1} and follow the dots.`, 'info');
  }

  #showSnail() {
    const tracker = this.#tracer.tracker(this.#tracer.current);
    this.#board.setSnail(tracker.position);
  }

  // ------------------------------------------------------------ the pencil

  #down(point) {
    if (!this.#flow.is('tracing')) return;
    const event = this.#tracer.pointerDown(point);
    if (event.type === 'started') {
      this.#ink = [point];
      this.#off = false;
      this.#board.setInk(this.#ink, false);
      this.services.audio.play('click');
      this.#say('Follow the dots slowly. The snail goes only when you are on the path.', 'info');
    } else if (event.type === 'wrong-order') {
      this.#mistakes += 1;
      this.services.audio.play('boop');
      this.#say(`That is stroke ${event.stroke + 1}. Start with stroke ${this.#tracer.current + 1}.`, 'bad');
    } else if (event.type === 'wrong-direction') {
      this.#mistakes += 1;
      this.services.audio.play('boop');
      this.#say(`Start at dot ${this.#tracer.current + 1} and write this way.`, 'bad');
    } else if (event.type === 'far') {
      this.#say(`Put your pencil on dot ${this.#tracer.current + 1}.`, 'info');
    }
  }

  #move(point) {
    if (!this.#flow.is('tracing') || this.#ink.length === 0) return;
    const index = this.#tracer.current;
    const event = this.#tracer.pointerMove(point);
    if (!event) return;
    this.#ink.push(point);
    if (event.type === 'progress') {
      const stray = !event.onPath;
      if (stray !== this.#off) {
        this.#off = stray;
        this.#say(stray ? 'Back to the path! The snail is waiting.' : 'Good, keep going!', stray ? 'bad' : 'good');
      }
      this.#board.setInk(this.#ink, this.#off);
      const tracker = this.#tracer.tracker(index);
      this.#board.setProgress(index, Math.round(tracker.fraction * (tracker.path.length - 1)));
      this.#board.setSnail(tracker.position);
      return;
    }
    // A stroke or the whole glyph was finished.
    this.#ink = [];
    this.#board.setInk([], false);
    this.#board.markDone(index);
    if (event.type === 'glyph-done') {
      this.#board.setSnail(null);
      this.#finish(false);
    } else {
      this.services.audio.play('ding');
      this.#board.setCurrent(this.#tracer.current);
      this.#showSnail();
      this.#say(`Stroke ${index + 1} done! Now dot ${this.#tracer.current + 1}.`, 'good');
    }
  }

  #up() {
    if (!this.#flow.is('tracing') || this.#ink.length === 0) return;
    const event = this.#tracer.pointerUp();
    this.#ink = [];
    this.#board.setInk([], false);
    if (event.type === 'gave-up') {
      this.#board.setProgress(event.stroke, 0);
      this.#showSnail();
      this.services.audio.play('boop');
      this.#say('Keep your pencil down until the end of the stroke. Try again from the dot.', 'info');
    }
  }

  // -------------------------------------------------------------- finishing

  /** @param {boolean} skipped */
  #finish(skipped) {
    if (!this.#flow.send('FINISH')) return;
    this.#board.setDemo(null);
    this.#board.lock(true);
    const { services } = this;
    const score = skipped ? 0 : this.#tracer.results().score;
    const stars = skipped ? MOVE_ON_STARS : glyphStars(score);
    this.#results.push({ id: this.#glyph.id, char: this.#glyph.char, stars, score, mistakes: skipped ? 0 : this.#tracer.results().orderMistakes + this.#tracer.results().directionMistakes });
    this.#skip.hidden = true;
    this.#watch.disabled = true;
    if (skipped) {
      this.#say('Skipped. Watch it once more, then try again next time.', 'info');
    } else {
      services.audio.play(stars === 3 ? 'cheer' : 'chime');
      if (stars === 3) launchConfetti({ rng: services.rng, count: 50 });
      this.#say(`${this.#glyph.char.length > 1 ? 'Well written!' : `${this.#glyph.char} done!`} ${stars} ${stars === 1 ? 'star' : 'stars'}`, 'good');
    }
    this.#next.querySelector('span:last-child').textContent = this.#index + 1 === this.#glyphs.length ? 'See my stars' : 'Next';
    this.#next.hidden = false;
    this.#next.focus({ preventScroll: true });
  }

  #advance() {
    if (!this.#flow.is('done')) return;
    this.#index += 1;
    if (this.#index >= this.#glyphs.length) {
      this.#flow.must('LEAVE'); // a second press of Next must not ask for the results twice
      this.routes.results({ setId: this.#set.id, levelId: this.#level.id, results: this.#results });
    } else {
      this.#flow.must('NEXT');
      this.#show();
    }
  }

  #say(text, tone) {
    this.#noteEl.className = `trace__note trace__note--${tone}`;
    this.#noteEl.replaceChildren(
      el('span', { class: 'trace__note-icon', text: TONE_ICON[tone], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text }));
  }

  update(dt) {
    if (!this.#flow.is('demoing') || !this.#timeline) return;
    this.#demoTime += dt;
    const state = demoState(this.#timeline, this.#demoTime);
    this.#board.setDemo(state);
    if (state.finished) {
      this.#flow.must('DEMO_ENDED');
      this.#yourTurn();
    }
  }
}

