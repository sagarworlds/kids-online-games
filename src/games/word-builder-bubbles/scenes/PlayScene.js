import { BubblesScene } from './BubblesScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { getLevel, WORDS_PER_ROUND, HINT_SECONDS, RESPAWN_SECONDS } from '../logic/levels.js';
import { chooseDecoys } from '../logic/decoys.js';
import { createBubbles, respawn } from '../logic/bubbleFactory.js';
import { step, bubbleAt, fitToBounds } from '../logic/physics.js';
import { startWord, tryLetter, nextLetter, remainingLetters } from '../logic/spellingState.js';
import { nearestWithLetter } from '../logic/keyboard.js';
import { drawSea } from '../ui/SeaRenderer.js';

const FLY_MS = 450;
const DRIFT_SECONDS = 1;
const SPARKLE_SECONDS = 0.6;

/** One word: look at the picture and clue, then pop the bubbles in the right order. */
export class PlayScene extends BubblesScene {
  #level = null;
  #entry = null;
  #state = null;
  #hintsLeft = 0;
  #reduced = false;
  #paused = false;
  #complete = false;
  #done = false;

  // the sea
  #bounds = { width: 0, height: 0 };
  #seaRect = { x: 0, y: 0, w: 0, h: 0 };
  #bubbles = [];
  #nextId = 1;
  #time = 0;
  #sinceMeasure = 0;
  #glow = null;
  #respawns = [];
  #drifting = [];
  #sparkles = [];
  /** Letters that have flown into their slots so far (the slots fill when the flight ends). */
  #shown = 0;

  // DOM
  #hud = null;
  #pictureEl = null;
  #clueEl = null;
  #clueButton = null;
  #slotsEl = null;
  #slotEls = [];
  #seaEl = null;
  #statusEl = null;
  #hintButton = null;
  #nextHost = null;
  #pauseEl = null;
  #resumeButton = null;
  #srList = null;
  #announcer = null;
  #offs = [];

  /** @param {import('./BubblesScene.js').Round} round */
  enter(round) {
    const { services } = this;
    this.round = round;
    this.#level = getLevel(round.levelId);
    this.#entry = round.words[round.index];
    if (!this.#entry) throw new GameError('NO_WORD', `Round has no word number ${round.index}`, { index: round.index });
    this.#state = startWord(this.#entry.word, { prefillFirst: this.#level.prefillFirst });
    this.#shown = this.#state.filled;
    this.#hintsLeft = round.hintsLeft;
    this.#reduced = prefersReducedMotion();

    this.ui.classList.add('wb-scene');
    this.#buildDom();
    this.#offs.push(
      services.input.on('tap', (event) => this.#onTap(event)),
      services.input.on('key', (event) => this.#onKey(event)),
      services.input.on('visibility', ({ hidden }) => { if (hidden) this.#setPaused(true); }),
    );
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
    this.services.speech.cancel();
  }

  resize() {
    this.#measure();
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services } = this;
    const { round } = this;
    const level = this.#level;
    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'word', label: 'Word' }, { id: 'oops', label: 'Oops' }],
      onSettings: () => this.#openSettings(),
    });
    this.#hud.setStat('word', `${round.index + 1}/${round.words.length}`);
    this.#hud.setStat('oops', 0);

    // The picture is hidden on Hard (clue words only) until the word is spelled.
    this.#pictureEl = el('div', { class: 'wb__picture', attrs: { role: 'img', 'aria-label': level.picture ? 'Picture clue' : 'Picture is hidden until you spell the word' } },
      el('span', { text: level.picture ? this.#entry.emoji : '❓', attrs: { 'aria-hidden': 'true' } }));
    this.#clueEl = el('p', { class: 'wb__clue', text: this.#entry.clue });
    this.#clueEl.hidden = !level.showClue;
    const speaker = createButton({ icon: '🔊', ariaLabel: 'Hear the word', onClick: () => this.services.speech.speak(this.#entry.word, { force: true }) });
    this.#hintButton = createButton({ icon: '💡', label: `Hint (${this.#hintsLeft})`, onClick: () => this.#hint() });
    if (this.#hintsLeft === 0) setDisabled(this.#hintButton, true);
    const actions = el('div', { class: 'wb__actions' }, speaker, this.#hintButton);
    if (!level.showClue) {
      this.#clueButton = createButton({ label: 'Show clue', icon: '❔', onClick: () => { this.#clueEl.hidden = false; setDisabled(this.#clueButton, true); } });
      actions.append(this.#clueButton);
    }

    this.#slotEls = Array.from(this.#entry.word, (_, i) => el('span', { class: 'slot', attrs: { role: 'img' } }));
    this.#slotsEl = el('div', { class: 'wb__slots', attrs: { role: 'group', 'aria-label': `Spell the word, ${this.#entry.word.length} letters` } }, ...this.#slotEls);
    this.#renderSlots();

    this.#statusEl = el('p', { class: 'wb__status', attrs: { role: 'status' } });
    this.#seaEl = el('div', { class: 'wb__sea', attrs: { 'aria-hidden': 'true' } });
    this.#nextHost = el('div', { class: 'wb__next' });

    this.#resumeButton = createButton({ label: 'Resume', icon: '▶', variant: 'primary', big: true, onClick: () => this.#setPaused(false) });
    this.#pauseEl = el('div', { class: 'wb__pause', attrs: { role: 'dialog', 'aria-label': 'Game paused' } },
      el('h2', { text: 'Paused' }), el('p', { text: 'The bubbles are waiting.' }), this.#resumeButton);
    this.#pauseEl.hidden = true;

    // Text mirror of the bubbles for screen-reader users, since the canvas is hidden from them.
    this.#srList = el('div', { class: 'sr-only', attrs: { role: 'group', 'aria-label': 'Letter bubbles' } });
    this.#announcer = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });

    this.ui.append(this.#hud.el,
      el('div', { class: 'wb' },
        el('section', { class: 'wb__card' }, this.#pictureEl, el('div', { class: 'wb__text' }, this.#clueEl, actions)),
        this.#slotsEl, this.#statusEl, this.#seaEl, this.#nextHost),
      this.#pauseEl, this.#srList, this.#announcer);
  }

  #announce(text) {
    this.#announcer.textContent = text;
  }

  #renderSlots() {
    const word = this.#entry.word;
    const next = this.#shown;
    this.#slotEls.forEach((slot, i) => {
      const filled = i < this.#shown;
      slot.textContent = filled ? word[i].toUpperCase() : '';
      slot.classList.toggle('is-filled', filled);
      slot.classList.toggle('is-next', !this.#complete && i === next);
      slot.setAttribute('aria-label', `Letter ${i + 1}: ${filled ? word[i] : 'empty'}`);
    });
  }

  // --------------------------------------------------------------- measure

  /** Works out where the sea is on the canvas, and where each slot is. */
  #measure() {
    this.#sinceMeasure = 0;
    if (!this.#seaEl) return;
    const origin = this.ui.getBoundingClientRect();
    const box = this.#seaEl.getBoundingClientRect();
    this.#seaRect = { x: box.left - origin.left, y: box.top - origin.top, w: Math.round(box.width), h: Math.round(box.height) };
    // The window was resized or the tablet turned: keep every bubble inside the new sea.
    const size = { width: this.#seaRect.w, height: this.#seaRect.h };
    if (this.#bubbles.length && (size.width !== this.#bounds.width || size.height !== this.#bounds.height)) {
      this.#bubbles = fitToBounds(this.#bubbles, this.#bounds, size);
      this.#bounds = size;
    }
  }

  /** Centre of a slot in sea coordinates (it is above the sea, so y is negative). */
  #slotCentre(index) {
    const origin = this.ui.getBoundingClientRect();
    const box = this.#slotEls[index].getBoundingClientRect();
    return { x: box.left - origin.left + box.width / 2 - this.#seaRect.x, y: box.top - origin.top + box.height / 2 - this.#seaRect.y };
  }

  /** Makes the first bubbles once the sea has a size. */
  #ensureBubbles() {
    if (this.#bubbles.length || this.#complete || this.#seaRect.w < 120 || this.#seaRect.h < 120) return;
    const { services } = this;
    const letters = remainingLetters(this.#state);
    const decoys = chooseDecoys(this.#entry.word, this.#level.decoys, services.rng, { similar: this.#level.similarDecoys });
    this.#bounds = { width: this.#seaRect.w, height: this.#seaRect.h };
    this.#bubbles = createBubbles({ letters, decoys }, this.#bounds, services.rng, this.#level.speed);
    this.#nextId = this.#bubbles.length + 1;
    this.#syncSrList();
  }

  #syncSrList() {
    this.#srList.replaceChildren(...(this.#complete ? [] : this.#bubbles).map((b) => el('button', {
      class: 'sr-bubble', text: `Bubble ${b.letter}`, attrs: { type: 'button' },
      on: { click: () => this.#pop(b) },
    })));
  }

  // ----------------------------------------------------------------- input

  #onTap({ originalEvent, onInteractive }) {
    if (this.#paused || this.#complete || onInteractive) return;
    const box = this.#seaEl.getBoundingClientRect();
    const bubble = bubbleAt(this.#bubbles, originalEvent.clientX - box.left, originalEvent.clientY - box.top, this.#time);
    if (bubble) this.#pop(bubble);
  }

  #onKey(event) {
    if (this.#done) return;
    if (event.key === 'Escape') {
      this.#setPaused(!this.#paused);
      return;
    }
    if (this.#paused || this.#complete || event.repeat) return;
    const target = this.#slotCentre(Math.min(this.#state.filled, this.#entry.word.length - 1));
    const bubble = nearestWithLetter(this.#bubbles, event.key, target);
    if (bubble) this.#pop(bubble);
    else if (/^[a-zA-Z]$/.test(event.key)) this.#statusEl.textContent = `There is no "${event.key.toLowerCase()}" bubble right now.`;
  }

  async #openSettings() {
    this.#setPaused(true);
    await this.services.openSettings();
    // Stay paused: the Resume button is the clear way back.
  }

  #setPaused(paused) {
    if (this.#complete || this.#done || paused === this.#paused) return;
    this.#paused = paused;
    this.#pauseEl.hidden = !paused;
    if (paused) this.#resumeButton.focus();
    this.#announce(paused ? 'Paused' : 'Back in the game');
  }

  #hint() {
    if (this.#hintsLeft <= 0 || this.#complete || this.#paused) return;
    const target = this.#slotCentre(Math.min(this.#state.filled, this.#entry.word.length - 1));
    const bubble = nearestWithLetter(this.#bubbles.filter((b) => !b.isDecoy), nextLetter(this.#state), target);
    if (!bubble) {
      this.#statusEl.textContent = 'The bubble you need is on its way back. Try again in a moment.';
      return;
    }
    this.#hintsLeft -= 1;
    this.#glow = { id: bubble.id, ttl: HINT_SECONDS };
    this.#hintButton.querySelector('span:last-child').textContent = `Hint (${this.#hintsLeft})`;
    if (this.#hintsLeft === 0) setDisabled(this.#hintButton, true);
    this.#statusEl.textContent = 'The glowing bubble is the next letter.';
    this.#announce(`Hint: the next letter is ${bubble.letter}`);
  }

  // -------------------------------------------------------------- popping

  #pop(bubble) {
    if (this.#complete || this.#paused || !this.#bubbles.includes(bubble)) return;
    const { audio } = this.services;
    const slotIndex = this.#state.filled;
    const outcome = tryLetter(this.#state, bubble.letter);
    this.#state = outcome.state;
    this.#bubbles = this.#bubbles.filter((b) => b !== bubble);
    this.#addSparkles(bubble);
    this.#statusEl.textContent = '';

    const handlers = {
      correct: () => { audio.play('pop'); this.#flyToSlot(bubble, slotIndex); this.#announce(`${bubble.letter}`); },
      complete: () => { audio.play('pop'); this.#flyToSlot(bubble, slotIndex); this.#complete = true; this.#celebrate(); },
      wrong: () => this.#onWrong(bubble),
    };
    const handle = handlers[outcome.result];
    if (!handle) throw new GameError('BAD_SPELLING_OUTCOME', `Unknown outcome "${outcome.result}"`, { result: outcome.result });
    handle();
    this.#hud.setStat('oops', this.#state.mistakes);
    this.#syncSrList();
  }

  /** A wrong bubble wobbles and floats away; a new one with the same letter drifts back soon, so the word can always be finished. */
  #onWrong(bubble) {
    this.services.audio.play('boop');
    this.#drifting.push({ bubble, ttl: DRIFT_SECONDS });
    this.#respawns.push({ old: bubble, timer: RESPAWN_SECONDS });
    this.#slotsEl.classList.remove('shake');
    void this.#slotsEl.offsetWidth; // restart the animation if it is already running
    this.#slotsEl.classList.add('shake');
    this.#statusEl.textContent = 'Not that one. Look at the glowing slot for the next letter.';
    this.#announce('Not that one');
  }

  /** The popped letter flies up into its slot, and the slot fills when it arrives. */
  #flyToSlot(bubble, slotIndex) {
    const arrive = () => { this.#shown = Math.max(this.#shown, slotIndex + 1); this.#renderSlots(); };
    if (this.#reduced || !this.#slotEls[slotIndex].animate) { arrive(); return; }
    const from = { x: this.#seaRect.x + bubble.x, y: this.#seaRect.y + bubble.y };
    const slot = this.#slotCentre(slotIndex);
    const to = { x: this.#seaRect.x + slot.x, y: this.#seaRect.y + slot.y };
    const size = bubble.r * 2;
    const flier = el('div', { class: 'fly', text: bubble.letter.toUpperCase(), style: { width: `${size}px`, height: `${size}px`, left: `${-bubble.r}px`, top: `${-bubble.r}px` } });
    this.ui.append(flier);
    const move = flier.animate(
      [{ transform: `translate(${from.x}px, ${from.y}px) scale(1)` }, { transform: `translate(${to.x}px, ${to.y}px) scale(0.5)` }],
      { duration: FLY_MS, easing: 'ease-in', fill: 'forwards' });
    move.onfinish = () => { flier.remove(); arrive(); };
    move.oncancel = () => { flier.remove(); arrive(); };
  }

  #addSparkles(bubble) {
    if (this.#reduced) return;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + this.services.rng();
      this.#sparkles.push({ x: bubble.x, y: bubble.y, vx: Math.cos(angle) * 90, vy: Math.sin(angle) * 90, ttl: SPARKLE_SECONDS });
    }
  }

  #celebrate() {
    const { services } = this;
    services.audio.play('cheer');
    this.#pictureEl.firstChild.textContent = this.#entry.emoji;
    this.#pictureEl.setAttribute('aria-label', `Picture: ${this.#entry.word}`);
    this.#pictureEl.classList.add('is-celebrating');
    this.#slotsEl.classList.add('is-complete');
    this.#statusEl.textContent = `${this.#entry.word.toUpperCase()}! Well done!`;
    this.#announce(`Well done! ${this.#entry.word}`);
    services.speech.speak(this.#entry.word);
    this.#glow = null;

    const last = this.round.index + 1 >= this.round.words.length;
    const result = { word: this.#entry.word, emoji: this.#entry.emoji, mistakes: this.#state.mistakes };
    const next = createButton({
      label: last ? 'See results' : 'Next word', icon: '▶', variant: 'primary', big: true,
      onClick: () => {
        this.#done = true;
        const round = { ...this.round, index: this.round.index + 1, results: [...this.round.results, result], hintsLeft: this.#hintsLeft };
        if (last) this.routes.results(round);
        else this.routes.play(round);
      },
    });
    this.#nextHost.append(next);
    // A short pause so the flying letter lands first, then the button takes focus.
    setTimeout(() => next.isConnected && next.focus(), FLY_MS + 50);
  }

  // ------------------------------------------------------------------ loop

  update(dt) {
    if (this.#paused || this.#done) return;
    this.#time += dt;
    this.#sinceMeasure += dt;
    if (this.#sinceMeasure > 0.5 || !this.#seaRect.w) this.#measure();
    this.#ensureBubbles();

    const motion = this.#reduced ? 0.5 : 1;
    if (this.#bubbles.length) this.#bubbles = step(this.#bubbles, dt * motion, this.#bounds, { collide: this.#level.collide });

    if (this.#glow) {
      this.#glow.ttl -= dt;
      if (this.#glow.ttl <= 0) this.#glow = null;
    }
    for (const d of this.#drifting) d.ttl -= dt;
    this.#drifting = this.#drifting.filter((d) => d.ttl > 0);
    for (const s of this.#sparkles) {
      s.ttl -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.#sparkles = this.#sparkles.filter((s) => s.ttl > 0);

    if (this.#respawns.length) {
      for (const r of this.#respawns) r.timer -= dt;
      const due = this.#respawns.filter((r) => r.timer <= 0);
      if (due.length && !this.#complete) {
        for (const r of due) {
          this.#bubbles = [...this.#bubbles, respawn(r.old, this.#bubbles, this.#bounds, this.services.rng, this.#level.speed, this.#nextId++)];
        }
        this.#syncSrList();
      }
      this.#respawns = this.#respawns.filter((r) => r.timer > 0);
    }
  }

  render(ctx) {
    if (!ctx || this.#seaRect.w < 40) return;
    drawSea(ctx, this.#seaRect, {
      bubbles: this.#bubbles, time: this.#time, glowId: this.#glow?.id ?? null, drifting: this.#drifting,
      sparkles: this.#sparkles, reduced: this.#reduced, complete: this.#complete,
    });
  }
}
