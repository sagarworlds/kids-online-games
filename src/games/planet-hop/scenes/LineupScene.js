import { HopScene } from './HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { makeDraggable } from '../../../engine/ui/DragDrop.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { LEVELS } from '../logic/levels.js';
import { createLineup, place, allPlaced, lineupStars, lineupScore } from '../logic/lineup.js';
import { createSizer } from '../logic/scale.js';
import { createPlanetArt, createSunArt } from '../ui/PlanetArt.js';
import { createSizeToggle } from '../ui/SizeToggle.js';

/** How long a slot stays marked after a wrong drop. */
const WRONG_FLASH_MS = 600;

/**
 * "Line them up": the eight planets float in a mixed-up order and the child puts each one into its orbit, starting
 * next to the Sun. A drag works, and so does tapping (or pressing Enter on) a planet and then its orbit, which is the
 * keyboard way. A wrong orbit sends the planet back with a hint such as "Mars is the 4th planet, the red one."
 */
export class LineupScene extends HopScene {
  #levelId = 'easy';
  #config = null;
  #state = null;
  #selected = null;
  #real = false;
  #hud = null;
  #poolEl = null;
  #slotsEl = null;
  #statusEl = null;
  #scoreEl = null;
  #actionsEl = null;
  #handles = [];
  #flashTimers = new Set();

  /** @param {{ levelId: 'easy'|'medium'|'hard' }} params */
  enter({ levelId }) {
    const { services, data } = this;
    if (!LEVELS[levelId]) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
    this.#levelId = levelId;
    this.#config = LEVELS[levelId].lineup;
    this.#state = createLineup(data.planets, services.rng);

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      onSettings: () => services.openSettings(),
    });
    this.#poolEl = el('div', { class: 'pool', attrs: { role: 'group', 'aria-label': 'Planets waiting' } });
    this.#slotsEl = el('div', { class: 'slots', attrs: { role: 'group', 'aria-label': 'Orbits, from the Sun outwards' } });
    this.#statusEl = el('p', { class: 'lineup__status', attrs: { role: 'status' } });
    this.#scoreEl = el('p', { class: 'lineup__score' });
    this.#actionsEl = el('div', { class: 'lineup__actions' });

    this.ui.append(this.#hud.el, el('main', { class: 'lineup' },
      el('p', { class: 'lineup__help', text: 'Put the planets in order from the Sun. Drag each one to its orbit, or tap it and then tap its orbit.' }),
      el('div', { class: 'orbits' }, el('div', { class: 'orbits__sun' }, createSunArt(72), el('span', { text: 'Sun' })), this.#slotsEl),
      this.#statusEl,
      this.#poolEl,
      el('div', { class: 'lineup__extras' }, createSizeToggle({ onChange: (real) => { this.#real = real; this.#render(); } }), this.#scoreEl),
      this.#actionsEl));
    this.#render();
  }

  exit() {
    this.#destroyHandles();
    for (const timer of this.#flashTimers) clearTimeout(timer);
    this.#flashTimers.clear();
  }

  #destroyHandles() {
    for (const handle of this.#handles) handle.destroy();
    this.#handles = [];
  }

  /** What the child sees for a planet: its name at Easy and Medium, only a description of its look at Hard. */
  #label(planet) {
    return this.#config.showNames ? planet.name : `Planet, ${planet.look}`;
  }

  // ------------------------------------------------------------------ drawing

  #render() {
    const { planets } = this.data;
    const lookup = new Map(planets.map((p) => [p.id, p]));
    const size = createSizer(planets, { real: this.#real });
    this.#destroyHandles();

    this.#poolEl.replaceChildren(...this.#state.pool.map((id) => this.#tile(lookup.get(id), size)));
    this.#slotsEl.replaceChildren(...this.#state.placed.map((id, i) => this.#slot(i, id ? lookup.get(id) : null, size)));
    this.#showScore();
  }

  /** How many planets are in orbit and how many wrong drops so far; no "Game Over", just a gentle count. */
  #showScore() {
    const total = this.data.planets.length;
    this.#scoreEl.textContent = `In orbit: ${total - this.#state.pool.length}/${total} · Wrong drops: ${this.#state.wrongDrops}`;
  }

  #tile(planet, size) {
    const tile = el('button', {
      class: `tile${this.#selected === planet.id ? ' is-selected' : ''}`,
      attrs: { type: 'button', 'aria-label': this.#label(planet), 'aria-pressed': this.#selected === planet.id },
      data: { id: planet.id },
    }, el('span', { class: 'tile__art' }, createPlanetArt(planet, { diameter: size(planet) })),
    this.#config.showNames ? el('span', { class: 'tile__name', text: planet.name }) : null);
    this.#handles.push(makeDraggable(tile, {
      getZones: () => [...this.#slotsEl.querySelectorAll('.slot:not(.is-filled)')],
      onDrop: (zone) => this.#tryPlace(planet.id, Number(zone.dataset.index), zone),
      onActivate: () => this.#select(planet.id),
    }));
    return tile;
  }

  #slot(index, planet, size) {
    const filled = planet !== null;
    const label = filled ? `Orbit ${index + 1}: ${planet.name}` : `Orbit ${index + 1}${index === 0 ? ', next to the Sun' : ''}, empty`;
    const slot = el('button', {
      class: `slot${filled ? ' is-filled' : ''}`, attrs: { type: 'button', 'aria-label': label }, data: { index: String(index) },
      on: { click: () => this.#onSlot(index) },
    },
    this.#config.showNumbers ? el('span', { class: 'slot__number', text: String(index + 1), attrs: { 'aria-hidden': 'true' } }) : null,
    el('span', { class: 'slot__orbit' }, filled ? el('span', { class: 'orbiter' }, createPlanetArt(planet, { diameter: Math.min(size(planet), 48) })) : null),
    filled ? el('span', { class: 'slot__name', text: planet.name }) : null);
    // A planet that is already in orbit cannot take another, so it is not a target for a drop or a tap.
    if (filled) slot.setAttribute('aria-disabled', 'true');
    return slot;
  }

  // ------------------------------------------------------------------ playing

  #select(planetId) {
    this.#selected = this.#selected === planetId ? null : planetId;
    this.services.audio.play('click');
    const planet = this.data.planets.find((p) => p.id === planetId);
    this.#say(this.#selected ? `${this.#config.showNames ? planet.name : 'That planet'} is picked. Now tap its orbit.` : '', 'info');
    this.#render();
    if (this.#selected) this.#poolEl.querySelector(`[data-id="${planetId}"]`)?.focus();
  }

  #onSlot(index) {
    if (this.#state.placed[index] !== null) return;
    if (!this.#selected) {
      this.#say('Pick a planet first, then tap the orbit where it goes.', 'info');
      return;
    }
    this.#tryPlace(this.#selected, index, this.#slotsEl.children[index]);
  }

  /**
   * Tries one planet in one orbit.
   * @returns {boolean} False when it was the wrong orbit (a drag then slides back to where it started).
   */
  #tryPlace(planetId, index, slotEl) {
    const { services, data } = this;
    const planet = data.planets.find((p) => p.id === planetId);
    const result = place(this.#state, planetId, index);
    this.#state = result.state;
    this.#selected = null;

    if (!result.correct) {
      services.audio.play('boop');
      this.#say(result.hint, 'bad');
      services.speech.speak(result.hint);
      this.#showScore();
      this.#flash(slotEl);
      // No redraw here: a dragged planet slides back to its tile, which must still be on the screen to slide to.
      this.#poolEl.querySelector('.is-selected')?.classList.remove('is-selected');
      return false;
    }
    services.audio.play('ding');
    this.#say(`${planet.name} is in orbit ${index + 1}! ${planet.fact}`, 'good');
    services.speech.speak(`${planet.name}. ${planet.fact}`);
    this.#render();
    if (allPlaced(this.#state)) this.#finish();
    return true;
  }

  /** Marks the orbit that was tried, so a wrong drop is seen (a dashed outline and a ✖), not only heard. */
  #flash(slotEl) {
    if (!slotEl) return;
    slotEl.classList.add('is-wrong');
    const timer = setTimeout(() => { this.#flashTimers.delete(timer); slotEl.classList.remove('is-wrong'); }, WRONG_FLASH_MS);
    this.#flashTimers.add(timer);
  }

  #say(text, tone) {
    this.#statusEl.className = `lineup__status lineup__status--${tone}`;
    const icon = tone === 'good' ? ICONS.check : tone === 'bad' ? ICONS.cross : '';
    this.#statusEl.replaceChildren(icon ? el('span', { html: icon, attrs: { 'aria-hidden': 'true' } }) : '', icon ? ` ${text}` : text);
  }

  #finish() {
    const { services } = this;
    services.audio.play('cheer');
    launchConfetti({ rng: services.rng, count: 50 });
    this.#actionsEl.replaceChildren(createButton({
      label: 'See my results', icon: '🚀', variant: 'primary', big: true,
      onClick: () => this.routes.results({
        mode: 'lineup', levelId: this.#levelId, stars: lineupStars(this.#state.wrongDrops), score: lineupScore(this.#state.wrongDrops),
        lines: [`All 8 planets in orbit, with ${this.#state.wrongDrops === 0 ? 'no wrong drops' : `${this.#state.wrongDrops} wrong ${this.#state.wrongDrops === 1 ? 'drop' : 'drops'}`}.`],
      }),
    }));
    this.#actionsEl.firstChild.focus();
    this.#say(`Every planet is in orbit! ${this.#state.planets.at(-1).name} is the farthest from the Sun.`, 'good');
  }
}
