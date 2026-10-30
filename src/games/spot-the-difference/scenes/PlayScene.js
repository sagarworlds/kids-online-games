import { SpotBase, MIX } from './SpotBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { clamp } from '../../../engine/utils/geometry.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createProgressBar } from '../../../engine/ui/ProgressBar.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { LEVELS, SCENES_PER_ROUND, SCENE_WIDTH, SCENE_HEIGHT } from '../logic/levels.js';
import { generatePuzzle } from '../logic/puzzle.js';
import { MIN_TAP_PX } from '../logic/hitTest.js';
import { formatClock } from '../logic/labels.js';
import { createRound, createPlay, puzzleSeed, tap, foundCount, isComplete, useHint, sceneStars, sceneScore, isRoundOver } from '../logic/round.js';
import { createPicture } from '../ui/Picture.js';

/** The keyboard pointer moves this far (picture units) for an arrow key, and further with Shift held. */
const POINTER_STEP = 16;
const POINTER_STEP_BIG = 64;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const TONE_ICON = { good: '✔', bad: '✖', info: 'ℹ' };
const POSITION_NAMES = ['First', 'Second'];

/** Is the element focused the way a keyboard user focuses (not by a click)? Older browsers cannot say, so they say yes. */
function focusVisible(node) {
  try {
    return node.matches(':focus-visible');
  } catch (error) {
    if (error?.name === 'SyntaxError') return true;
    throw error;
  }
}

/**
 * The game: a round of five pictures. Each is a pair made from a seed; the player taps the differences in either
 * picture. The scene only draws and listens, and every rule (what counts as a hit, the miss pause, hints, stars) lives
 * in `logic/`.
 */
export class PlayScene extends SpotBase {
  #level = null;
  #themeChoice = MIX;
  #themeIds = [];
  #mixStart = 0;
  #round = null;
  #puzzle = null;
  #play = null;
  #phase = 'playing';
  /** Seconds spent on this picture, counting only while it is being played (not paused). */
  #elapsed = 0;
  /** Time since the scene began, in ms. Only used to time the pause after a miss. */
  #clockMs = 0;
  #shownSecond = -1;
  /** Why the clock is stopped, if it is: 'settings' (the grown-ups dialog) and/or 'hidden' (the tab is out of sight). */
  #pausedBy = new Set();
  #pictures = [];
  #pointer = { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 };
  #offs = [];

  #hud = null;
  #stageEl = null;
  #placeEl = null;
  #foundEl = null;
  #missEl = null;
  #progress = null;
  #barEl = null;
  #hintButton = null;
  #noteEl = null;
  #nextButton = null;

  /** @param {import('./SpotBase.js').Choice} choice */
  enter({ themeId, levelId }) {
    const { services, data } = this;
    this.#level = LEVELS[levelId];
    if (!this.#level) throw new GameError('UNKNOWN_LEVEL', `There is no level "${levelId}"`, { levelId });
    if (themeId !== MIX && !data.themes.has(themeId)) throw new GameError('UNKNOWN_THEME', `There is no theme "${themeId}"`, { themeId });
    this.#themeChoice = themeId;
    this.#themeIds = [...data.themes.keys()];
    const seed = Math.floor(services.rng() * 2 ** 32);
    this.#round = createRound(levelId, seed);
    this.#mixStart = seed % this.#themeIds.length;

    this.#buildDom();
    this.#offs.push(services.input.on('visibility', ({ hidden }) => this.#setPause('hidden', hidden)));
    this.#startPicture();
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
  }

  get #paused() {
    return this.#pausedBy.size > 0;
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services } = this;
    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'time', label: 'Time' }],
      onSettings: () => this.#openSettings(),
    });
    this.#placeEl = el('span', { class: 'spot__place' });
    this.#foundEl = el('span', { class: 'spot__found' });
    this.#missEl = el('span', { class: 'spot__misses' });
    this.#barEl = el('div', { class: 'spot__progress' });
    this.#hintButton = createButton({ label: 'Hint', icon: '🔦', onClick: () => this.#hint() });
    this.#noteEl = el('p', { class: 'spot__note', attrs: { role: 'status' } });
    this.#stageEl = el('div', { class: 'spot__pictures' });
    this.#nextButton = createButton({ label: 'Next picture', icon: '▶', variant: 'primary', big: true, onClick: () => this.#next() });
    this.#nextButton.hidden = true;

    this.ui.classList.add('spot');
    this.ui.append(
      this.#hud.el,
      el('main', { class: 'spot__main' },
        el('div', { class: 'spot__bar' }, this.#placeEl, this.#foundEl, this.#missEl),
        this.#barEl,
        this.#stageEl,
        this.#noteEl,
        el('div', { class: 'spot__actions' }, this.#hintButton, this.#nextButton)));
  }

  /** One picture and its frame: tapping it, and the arrow keys when it has the keyboard focus. */
  #buildFrame(picture, index) {
    const frame = el('div', {
      class: 'picture',
      attrs: {
        tabindex: 0, role: 'group',
        'aria-label': `${POSITION_NAMES[index]} picture. Press the arrow keys to move the pointer, and Enter to choose a spot.`,
      },
      on: {
        click: (event) => this.#onClick(event, index),
        keydown: (event) => this.#onKeyDown(event, index),
        focus: () => { if (focusVisible(frame)) this.#showPointerOn(index); },
        blur: () => picture.setPointer(null),
      },
    }, picture.el);
    return frame;
  }

  #say(text, tone = 'info') {
    this.#noteEl.className = `spot__note spot__note--${tone}`;
    this.#noteEl.replaceChildren(
      el('span', { class: 'spot__note-icon', text: TONE_ICON[tone], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text }));
  }

  #syncFound() {
    const total = this.#puzzle.differences.length;
    const found = foundCount(this.#play);
    this.#foundEl.textContent = `Found ${found} of ${total}`;
    this.#missEl.textContent = `Misses: ${this.#play.misses}`;
    this.#progress.set(found);
  }

  #syncHint() {
    const left = this.#round.hintsLeft;
    this.#hintButton.querySelector('span:last-child').textContent = `Hint (${left})`;
    setDisabled(this.#hintButton, left === 0);
    // Once the picture is done there is nothing left to hint at, and the Next button takes its place.
    this.#hintButton.hidden = this.#phase !== 'playing';
  }

  #syncTime() {
    this.#hud.setStat('time', `${formatClock(this.#elapsed)} / ${formatClock(this.#level.targetSeconds)}`);
  }

  // ------------------------------------------------------------- pictures

  /** Which theme the picture at this place in the round uses. */
  #themeFor(index) {
    return this.#themeChoice === MIX ? this.#themeIds[(this.#mixStart + index) % this.#themeIds.length] : this.#themeChoice;
  }

  #startPicture() {
    const { data } = this;
    const index = this.#round.results.length;
    const themeId = this.#themeFor(index);
    const theme = data.themes.get(themeId);
    // A failure here (GameError PUZZLE_FAILED after three tries) is not caught: it reaches the error screen with its context logged.
    this.#puzzle = generatePuzzle({ themeId, levelId: this.#level.id, seed: puzzleSeed(this.#round.seed, index), themes: data.themes, templates: data.templates });
    this.#play = createPlay(this.#puzzle.differences.length);
    this.#phase = 'playing';
    this.#elapsed = 0;
    this.#shownSecond = -1;

    this.#pictures = [this.#puzzle.left, this.#puzzle.right].map((objects, i) =>
      createPicture({ theme, templates: data.templates, objects, label: `${POSITION_NAMES[i]} picture of the ${theme.name.toLowerCase()}` }));
    this.#stageEl.classList.remove('is-cooling');
    this.#stageEl.replaceChildren(...this.#pictures.map((p, i) => this.#buildFrame(p, i)));

    this.#progress = createProgressBar({ label: 'Differences found', max: this.#puzzle.differences.length });
    this.#barEl.replaceChildren(this.#progress.el);
    // On a phone the name is hidden to keep the bar on one row (see style.css), so the label says it all.
    this.#placeEl.replaceChildren(`${theme.icon} `, el('span', { class: 'spot__place-name', text: `${theme.name} · ` }), `${index + 1}/${SCENES_PER_ROUND}`);
    this.#placeEl.setAttribute('aria-label', `${theme.name}, picture ${index + 1} of ${SCENES_PER_ROUND}`);
    this.#nextButton.hidden = true;
    this.#syncFound();
    this.#syncHint();
    this.#syncTime();
    this.#say(index === 0 ? 'Tap a difference in either picture.' : 'A new pair. Tap the differences!', 'info');
  }

  #next() {
    if (this.#phase !== 'done') return;
    if (isRoundOver(this.#round)) {
      this.routes.results({ themeId: this.#themeChoice, levelId: this.#level.id, results: this.#round.results });
      return;
    }
    this.#startPicture();
    this.#stageEl.firstElementChild?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- input

  #onClick(event, index) {
    const picture = this.#pictures[index];
    const rect = picture.el.getBoundingClientRect();
    if (rect.width === 0) return;
    const scale = rect.width / SCENE_WIDTH;
    const point = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    // A click made by a screen reader or a script has no real position; there is nothing to look up for it.
    if (point.x < 0 || point.y < 0 || point.x > SCENE_WIDTH || point.y > SCENE_HEIGHT) return;
    this.#pointer = point;
    this.#pictures.forEach((p) => p.setPointer(null));
    this.#tapAt(point, index, scale);
  }

  #onKeyDown(event, index) {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      if (this.#phase !== 'playing' || this.#paused) return;
      const step = event.shiftKey ? POINTER_STEP_BIG : POINTER_STEP;
      this.#pointer = { x: clamp(this.#pointer.x + arrow[0] * step, 0, SCENE_WIDTH), y: clamp(this.#pointer.y + arrow[1] * step, 0, SCENE_HEIGHT) };
      this.#showPointerOn(index);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.repeat) return;
      const rect = this.#pictures[index].el.getBoundingClientRect();
      if (rect.width === 0) return;
      this.#showPointerOn(index);
      this.#tapAt(this.#pointer, index, rect.width / SCENE_WIDTH);
    }
  }

  #showPointerOn(index) {
    this.#pictures.forEach((picture, i) => picture.setPointer(i === index ? this.#pointer : null));
  }

  /**
   * Handles a tap at a place in picture units.
   * @param {{ x: number, y: number }} point
   * @param {number} index Which picture was tapped (a miss is marked there).
   * @param {number} scale Screen pixels for each picture unit, so the area to tap is at least 48 px on this screen.
   */
  #tapAt(point, index, scale) {
    if (this.#phase !== 'playing' || this.#paused) return;
    const { services } = this;
    const result = tap(this.#play, this.#puzzle, point, { now: this.#clockMs, minSize: MIN_TAP_PX / scale });
    if (result.outcome === 'hit') {
      const difference = this.#puzzle.differences[result.index];
      for (const picture of this.#pictures) picture.markFound(difference.box);
      services.audio.play('ding');
      services.speech.speak(difference.label);
      this.#say(`${difference.label}!`, 'good');
      this.#syncFound();
      if (isComplete(this.#play)) this.#finishPicture();
    } else if (result.outcome === 'already') {
      this.#say('You found that one already.', 'info');
    } else if (result.outcome === 'miss') {
      this.#pictures[index].markMiss(point);
      services.audio.play('boop');
      this.#say('Not there. Look again!', 'bad');
      this.#missEl.textContent = `Misses: ${this.#play.misses}`;
      this.#stageEl.classList.add('is-cooling');
    }
    // 'cooldown' taps are ignored on purpose: the pictures are dimmed for that moment so it is clear why.
  }

  #hint() {
    if (this.#phase !== 'playing' || this.#paused) return;
    const index = useHint(this.#round, this.#play);
    if (index === -1) return;
    for (const picture of this.#pictures) picture.showHint(this.#puzzle.differences[index].box);
    this.services.audio.play('chime');
    this.#say('Look inside the glowing circle.', 'info');
    this.#syncHint();
  }

  // ------------------------------------------------------------- finishing

  #finishPicture() {
    const { services } = this;
    const total = this.#puzzle.differences.length;
    const timing = { misses: this.#play.misses, elapsed: this.#elapsed, target: this.#level.targetSeconds };
    const stars = sceneStars(timing);
    this.#round.results.push({
      stars, score: sceneScore(timing, total), misses: timing.misses, elapsed: timing.elapsed,
      themeId: this.#puzzle.themeId, types: this.#puzzle.differences.map((d) => d.type),
    });
    this.#phase = 'done';
    this.#pictures.forEach((p) => p.setPointer(null));
    for (const frame of this.#stageEl.children) frame.classList.add('is-done');
    this.#say(`All ${total} found! ${stars} ${stars === 1 ? 'star' : 'stars'}`, 'good');
    this.#syncHint();
    services.audio.play('cheer');
    launchConfetti({ rng: services.rng, count: 60 });
    this.#nextButton.querySelector('span:last-child').textContent = isRoundOver(this.#round) ? 'See my stars' : 'Next picture';
    this.#nextButton.hidden = false;
    this.#nextButton.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ loop

  async #openSettings() {
    this.#setPause('settings', true);
    try {
      await this.services.openSettings();
    } finally {
      this.#setPause('settings', false);
    }
  }

  #setPause(reason, on) {
    if (on) this.#pausedBy.add(reason);
    else this.#pausedBy.delete(reason);
  }

  update(dt) {
    this.#clockMs += dt * 1000;
    for (const picture of this.#pictures) picture.tick(dt);
    if (this.#play && this.#clockMs >= this.#play.cooldownUntil) this.#stageEl.classList.remove('is-cooling');
    if (this.#phase !== 'playing' || this.#paused) return;
    this.#elapsed += dt;
    const second = Math.floor(this.#elapsed);
    if (second !== this.#shownSecond) {
      this.#shownSecond = second;
      this.#syncTime();
    }
  }
}
