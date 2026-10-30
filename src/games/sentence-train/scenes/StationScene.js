import { TrainScene } from './TrainScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { makeDraggable } from '../../../engine/ui/DragDrop.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { getLevel, MAX_RETRIES } from '../logic/levels.js';
import { sentenceText } from '../logic/sentences.js';
import { scramble } from '../logic/scrambler.js';
import { check } from '../logic/checker.js';
import { newBoard, place, remove, placeInFirstEmpty, nudge, hintNext, solved, sidingCarriages, slotWords, isFull } from '../logic/board.js';
import { createCarriage } from '../ui/Carriage.js';

const MISTAKE_HELP = {
  order: 'The words are not in the right order yet. Read your sentence out loud.',
  punctuation: 'Look for the capital letter at the start and the full stop or question mark at the end.',
  extra: 'One carriage does not belong in this sentence. Leave it on the siding.',
};
/** If the animation never reports it has finished (a hidden tab, say), carry on after this long. */
const LEAVE_FALLBACK_MS = 2600;

/** One sentence: drag the carriages behind the engine in the right order, then blow the whistle. */
export class StationScene extends TrainScene {
  #level = null;
  #entry = null;
  #board = null;
  #hintsLeft = 0;
  #wrongIndex = -1;
  #mistakes = { order: 0, punctuation: 0, extra: 0 };
  #wrongWhistles = 0;
  #finished = false;
  #focusId = null;
  #handles = [];
  #reduced = false;
  /** This sentence's result, handed to the next scene when the train has gone. */
  #pending = null;

  // DOM
  #hud = null;
  #trainEl = null;
  #slotEls = [];
  #sidingEl = null;
  #whistleButton = null;
  #hintButton = null;
  #statusEl = null;
  #noteEl = null;
  #afterEl = null;
  #announcer = null;

  /** @param {import('./TrainScene.js').Round} round */
  enter(round) {
    const { services } = this;
    this.round = round;
    this.#level = getLevel(round.levelId);
    this.#entry = round.entries[round.index];
    if (!this.#entry) throw new GameError('NO_SENTENCE', `Round has no sentence number ${round.index}`, { index: round.index });
    this.#board = newBoard(scramble(this.#entry, services.rng), this.#entry.words.length);
    this.#hintsLeft = round.hintsLeft;
    this.#reduced = prefersReducedMotion();

    services.audio.registerSound('whistle', [{ f: 1250, ms: 140, type: 'triangle', volume: 0.12 }, { f: 1600, ms: 360, type: 'triangle', volume: 0.12 }]);
    services.audio.registerSound('chug', [
      { f: 110, ms: 80, type: 'square', volume: 0.06 }, { f: 90, ms: 120, type: 'square', volume: 0.06 },
      { f: 110, ms: 80, type: 'square', volume: 0.06 }, { f: 90, ms: 120, type: 'square', volume: 0.06 },
    ]);
    this.#buildDom();
    this.#render();
  }

  exit() {
    this.#handles.forEach((h) => h.destroy());
    this.#handles = [];
    this.services.speech.cancel();
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services, round } = this;
    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'sentence', label: 'Sentence' }, { id: 'hints', label: 'Hints' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('sentence', `${round.index + 1}/${round.entries.length}`);
    this.#hud.setStat('hints', this.#hintsLeft);

    this.#slotEls = this.#entry.words.map((_, i) => el('div', { class: 'slot', data: { slot: String(i) }, attrs: { role: 'group', 'aria-label': `Slot ${i + 1} of ${this.#entry.words.length}` } }));
    const engine = el('div', { class: 'engine', attrs: { role: 'img', 'aria-label': 'The engine' } }, el('span', { text: '🚂', attrs: { 'aria-hidden': 'true' } }));
    this.#trainEl = el('div', { class: 'train' }, engine, ...this.#slotEls);
    this.#sidingEl = el('div', { class: 'siding', attrs: { role: 'group', 'aria-label': 'Siding: carriages waiting' } });

    this.#whistleButton = createButton({ label: 'Whistle', icon: '📣', variant: 'primary', big: true, onClick: () => this.#whistle() });
    this.#hintButton = createButton({ label: `Hint (${this.#hintsLeft})`, icon: '💡', onClick: () => this.#hint() });
    this.#statusEl = el('p', { class: 'station__status', attrs: { role: 'status' } });
    this.#noteEl = el('p', { class: 'station__note' });
    this.#afterEl = el('div', { class: 'station__after' });
    this.#announcer = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });

    const picture = this.#entry.emoji
      ? el('div', { class: 'station__picture', attrs: { role: 'img', 'aria-label': 'Picture hint' } }, el('span', { text: this.#entry.emoji, attrs: { 'aria-hidden': 'true' } }))
      : null;
    this.ui.append(this.#hud.el, el('main', { class: 'station' },
      el('div', { class: 'station__top' }, picture, el('p', { class: 'station__help', text: 'Drag the carriages behind the engine to make the sentence. You can also press Enter on a carriage.' })),
      el('div', { class: 'station__yard' }, this.#trainEl),
      el('section', { class: 'siding-wrap', attrs: { 'aria-label': 'Siding' } }, el('h2', { class: 'station__heading', text: 'Siding' }), this.#sidingEl),
      el('div', { class: 'station__actions' }, this.#whistleButton, this.#hintButton),
      this.#noteEl, this.#statusEl, this.#afterEl, this.#announcer));
  }

  #announce(text) {
    this.#announcer.textContent = text;
  }

  /** Redraws the track and the siding from the board, and wires up dragging for every carriage that can move. */
  #render() {
    this.#handles.forEach((h) => h.destroy());
    this.#handles = [];
    const zones = () => [...this.#slotEls, this.#sidingEl];

    this.#slotEls.forEach((slotEl, i) => {
      slotEl.replaceChildren();
      const id = this.#board.slots[i];
      slotEl.classList.toggle('is-empty', id === null);
      if (id === null) return;
      const carriage = this.#board.carriages.find((c) => c.id === id);
      const node = createCarriage(carriage, { where: 'track', position: i, locked: this.#board.locked[i], wrong: i === this.#wrongIndex });
      slotEl.append(node);
      if (!this.#board.locked[i] && !this.#finished) this.#wire(node, id, zones, 'track');
    });

    this.#sidingEl.replaceChildren(...sidingCarriages(this.#board).map((carriage) => {
      const node = createCarriage(carriage, { where: 'siding' });
      if (!this.#finished) this.#wire(node, carriage.id, zones, 'siding');
      return node;
    }));

    const full = isFull(this.#board);
    setDisabled(this.#whistleButton, !full || this.#finished);
    setDisabled(this.#hintButton, this.#hintsLeft === 0 || this.#finished);
    this.#noteEl.textContent = this.#finished || full ? '' : 'Fill every slot, then blow the whistle.';
    if (this.#focusId !== null) {
      this.ui.querySelector(`.carriage[data-id="${this.#focusId}"]`)?.focus();
      this.#focusId = null;
    }
  }

  /** Dragging, tapping and keyboard for one carriage. */
  #wire(node, id, zones, where) {
    this.#handles.push(makeDraggable(node, {
      getZones: zones,
      onDrop: (zone) => this.#dropOn(id, zone),
      onActivate: () => this.#change(where === 'siding' ? placeInFirstEmpty(this.#board, id) : remove(this.#board, id), id, where === 'siding' ? 'click' : 'pop'),
    }));
    if (where === 'track') {
      node.addEventListener('keydown', (event) => {
        const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (!direction) return;
        event.preventDefault();
        this.#change(nudge(this.#board, id, direction), id, 'click');
      });
    }
  }

  /** A carriage was dropped on a slot (place or swap) or back on the siding (remove). @returns {boolean} False to snap back. */
  #dropOn(id, zone) {
    const next = zone === this.#sidingEl ? remove(this.#board, id) : place(this.#board, id, Number(zone.dataset.slot));
    return this.#change(next, id, zone === this.#sidingEl ? 'pop' : 'click');
  }

  /** Applies a new board. @returns {boolean} False when the move was refused (nothing changed). */
  #change(next, id, sound) {
    if (next === this.#board || this.#finished) return false;
    this.#board = next;
    this.#wrongIndex = -1; // the old "this one is wrong" marker no longer applies
    this.#statusEl.textContent = '';
    this.#focusId = id;
    this.services.audio.play(sound);
    this.#render();
    return true;
  }

  // --------------------------------------------------------------- actions

  #hint() {
    if (this.#hintsLeft === 0 || this.#finished) return;
    const result = hintNext(this.#board, this.#entry);
    if (!result) {
      this.#statusEl.textContent = 'Every carriage is already in the right place. Blow the whistle!';
      return;
    }
    this.#hintsLeft -= 1;
    this.#applyHint(result);
  }

  #applyHint({ board, slot }) {
    this.#board = board;
    this.#wrongIndex = -1;
    this.#hud.setStat('hints', this.#hintsLeft);
    this.#hintButton.querySelector('span:last-child').textContent = `Hint (${this.#hintsLeft})`;
    this.services.audio.play('ding');
    this.#statusEl.textContent = `Hint: "${slotWords(board)[slot]}" is locked into slot ${slot + 1}.`;
    this.#announce(this.#statusEl.textContent);
    this.#render();
  }

  #whistle() {
    if (this.#finished) return;
    const result = check(slotWords(this.#board), this.#entry);
    if (result.ok) {
      this.#finish(this.#wrongWhistles === 0 ? 'first' : 'retry');
    } else if (result.reason === 'wrong') {
      this.#onWrong(result);
    }
  }

  #onWrong({ firstWrongIndex, type }) {
    const { audio } = this.services;
    this.#mistakes[type] += 1;
    this.#wrongWhistles += 1;
    audio.play('boop');
    if (this.#wrongWhistles > MAX_RETRIES) {
      this.#board = solved(this.#board, this.#entry);
      this.#statusEl.textContent = `Here is the sentence: ${sentenceText(this.#entry)}`;
      this.#finish('failed');
      return;
    }
    this.#wrongIndex = firstWrongIndex;
    const left = MAX_RETRIES - this.#wrongWhistles + 1;
    this.#statusEl.textContent = `Not yet. The carriage with the cross is in the wrong place. ${MISTAKE_HELP[type]} ${left === 1 ? '1 try' : `${left} tries`} left.`;
    this.#announce(`Not yet. Carriage ${firstWrongIndex + 1} is in the wrong place.`);
    this.#render();
  }

  /** The train leaves the station (right, or after the answer was shown) and the sentence is read out. */
  #finish(status) {
    const { services } = this;
    this.#finished = true;
    this.#wrongIndex = -1;
    this.#render();
    this.#pending = {
      id: this.#entry.id, text: sentenceText(this.#entry), status,
      mistakes: { ...this.#mistakes },
    };
    if (status !== 'failed') this.#statusEl.textContent = `${sentenceText(this.#entry)}`;
    services.audio.play('whistle');
    services.audio.play('chug');
    services.speech.speak(sentenceText(this.#entry));
    this.#announce(`${status === 'failed' ? 'The answer is' : 'All aboard!'} ${sentenceText(this.#entry)}`);

    let done = false;
    const afterLeave = () => {
      if (done) return;
      done = true;
      this.#offerNext();
    };
    if (this.#reduced) {
      afterLeave();
      return;
    }
    this.#trainEl.classList.add('is-leaving');
    this.#trainEl.addEventListener('animationend', afterLeave, { once: true });
    setTimeout(afterLeave, LEAVE_FALLBACK_MS);
  }

  #offerNext() {
    const last = this.round.index + 1 >= this.round.entries.length;
    const next = createButton({
      label: last ? 'See results' : 'Next sentence', icon: '▶', variant: 'primary', big: true,
      onClick: () => {
        const round = { ...this.round, index: this.round.index + 1, results: [...this.round.results, this.#pending], hintsLeft: this.#hintsLeft };
        if (last) this.routes.results(round);
        else this.routes.play(round);
      },
    });
    this.#afterEl.append(next);
    next.focus();
  }
}
