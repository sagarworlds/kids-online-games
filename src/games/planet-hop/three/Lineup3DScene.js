import { HopScene } from '../scenes/HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { createViewToggle } from '../../../engine/three/ViewToggle.js';
import { LEVELS } from '../logic/levels.js';
import { createLineup, place, allPlaced, lineupStars, lineupScore, lineupLabel } from '../logic/lineup.js';
import { createSizer } from '../logic/scale.js';
import { easeInOut, lerpPoint } from '../../../engine/three/motionMath.js';
import { orbitPoint } from '../logic/space3d.js';
import { createPlanetArt } from '../ui/PlanetArt.js';
import { createSizeToggle } from '../ui/SizeToggle.js';
import { createStatusLine } from '../ui/StatusLine.js';
import { SpaceStage } from './SpaceStage.js';

/** Where the planet the child picked waits, above the Sun, until they choose its orbit. */
const HOVER = Object.freeze({ x: 0, y: 3.9, z: 0 });
const SLIDE_SECONDS = 0.7;
const WRONG_FLASH_SECONDS = 0.6;
const SHAKE_SECONDS = 0.45;
/** What the status line says before anything has happened (and again when the planet in hand is put back). */
const INTRO = 'Tap a planet, then tap its orbit. Drag the picture to turn it.';

/**
 * "Line them up" in 3D: the solar system floats in front of the child with eight empty orbits. They pick a planet (it
 * rises above the Sun), then tap the orbit it belongs in, either on the picture or on the numbered buttons. Turn and
 * zoom with a finger, the mouse or the arrow keys to look at it from any side.
 *
 * The rules, hints, stars and score are the same functions the 2D scene uses (`logic/lineup.js`), so the same play
 * earns the same stars. This scene only changes how it looks and how a planet is picked up and put down.
 */
export class Lineup3DScene extends HopScene {
  #levelId = 'easy';
  #config = null;
  #state = null;
  #selected = null;
  #real = false;
  #space = null;
  #hud = null;
  #panelEl = null;
  #poolEl = null;
  #slotsEl = null;
  #scoreEl = null;
  #actionsEl = null;
  #status = createStatusLine({ className: 'lineup__status' });
  #numberLabels = new Map();
  #nameLabels = new Map();
  /** Planets moving from the Sun to their orbit: `{ id, from, to, elapsed }`. */
  #slides = [];
  #flash = null;
  #shake = null;
  #clock = 0;
  #disposed = false;

  /** @param {{ levelId: 'easy'|'medium'|'hard' }} params */
  enter({ levelId }) {
    const { services, data } = this;
    if (!LEVELS[levelId]) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
    this.#levelId = levelId;
    this.#config = LEVELS[levelId].lineup;
    this.#state = createLineup(data.planets, services.rng);

    this.#hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const stageEl = el('div', { class: 'scene3d__stage' });
    this.#panelEl = el('div', { class: 'scene3d__panel' });
    this.#poolEl = el('div', { class: 'pool', attrs: { role: 'group', 'aria-label': 'Planets waiting' } });
    this.#slotsEl = el('div', { class: 'slots', attrs: { role: 'group', 'aria-label': 'Orbits, from the Sun outwards' } });
    this.#scoreEl = el('p', { class: 'lineup__score' });
    this.#actionsEl = el('div', { class: 'lineup__actions' });
    this.ui.append(this.#hud.el, el('main', { class: 'scene3d lineup3d' }, stageEl,
      this.#panelEl));
    this.#panelEl.append(
      this.#status.el,
      this.#poolEl,
      el('div', { class: 'orbits3d' }, el('p', { class: 'orbits3d__sun', text: '☀️ Sun, then outwards' }), this.#slotsEl),
      el('div', { class: 'lineup__extras' },
        createSizeToggle({ onChange: (real) => this.#setReal(real) }),
        createButton({ label: 'Whole system', icon: '🔭', onClick: () => this.#space.showWholeSystem() }),
        createViewToggle({ mode: '3d', onChange: (next) => this.#switchView(next) })),
      this.#scoreEl,
      this.#actionsEl);

    // Built after the page is laid out, because the stage measures its container. It throws 'WEBGL_UNAVAILABLE' when the
    // device cannot do 3D; `main.js` catches that and opens the 2D line-up instead.
    this.#space = new SpaceStage({
      container: stageEl, planets: data.planets, onContextLost: () => this.#lost(), onTap: (point) => this.#onTap(point),
      label: '3D solar system with eight orbits. Use the buttons below to put the planets in order from the Sun.',
    });
    this.#buildWorld();
    this.#render();
    this.#status.say(INTRO);
  }

  exit() {
    this.#disposed = true;
    this.#space?.dispose();
  }

  update(dt) {
    if (this.#disposed || !this.#space) return;
    const reduced = this.#space.reducedMotion;
    this.#clock += dt;
    this.#space.update(dt);
    this.#moveSlides(dt);
    this.#moveHover(reduced);
    this.#tickEffects(dt);
    this.#placeLabels();
  }

  render() {
    if (!this.#disposed) this.#space?.render();
  }

  resize() {
    // Nothing to do: the stage watches its own container, and the DOM controls reflow with CSS.
  }

  // ------------------------------------------------------------------ the 3D picture

  #buildWorld() {
    const { system } = this.#space;
    const { planets } = this.data;
    for (const planet of planets) {
      system.addOrbit(planet.order);
      system.addBody(planet).holder.visible = false;
      if (this.#config.showNumbers) {
        const label = makeLabel(String(planet.order), { background: '#ffd23f', worldHeight: 1.3 });
        const at = orbitPoint(planet.order);
        label.position.set(at.x, 0.3, at.z);
        system.group.add(label);
        this.#numberLabels.set(planet.order, label);
      }
      if (this.#config.showNames) {
        const label = makeLabel(planet.name, { worldHeight: 0.9, fontSize: 56 });
        label.visible = false;
        system.group.add(label);
        this.#nameLabels.set(planet.id, label);
      }
    }
    this.#syncWorld();
  }

  /** Shows the planets that are in orbit or in hand, and colours each orbit by what it is waiting for. */
  #syncWorld() {
    const { system } = this.#space;
    const sliding = new Set(this.#slides.map((s) => s.id));
    for (const planet of this.data.planets) {
      const placed = this.#state.placed.includes(planet.id);
      const shown = placed || planet.id === this.#selected || planet.id === this.#shake?.id || sliding.has(planet.id);
      const entry = system.entry(planet.id);
      entry.holder.visible = shown;
      // Hidden, not removed: the scene frees everything still in it when it ends.
      if (placed) this.#numberLabels.get(planet.order).visible = false;
      this.#orbitState(planet.order);
    }
  }

  #orbitState(order) {
    const filled = this.#state.placed[order - 1] !== null;
    const flashing = this.#flash?.order === order;
    this.#space.system.setOrbitState(order, flashing ? 'wrong' : filled ? 'filled' : this.#selected ? 'target' : 'idle');
  }

  #setReal(real) {
    this.#real = real;
    this.#space.system.setSizer(real, createSizer(this.data.planets, { real }), this.#space.reducedMotion);
    this.#render();
  }

  /** The planet in the child's hand bobs gently above the Sun (still when motion is turned down). */
  #moveHover(reduced) {
    const id = this.#selected;
    if (!id || this.#shake?.id === id) return;
    const entry = this.#space.system.entry(id);
    entry.holder.position.set(HOVER.x, HOVER.y + (reduced ? 0 : Math.sin(this.#clock * 2.2) * 0.15), HOVER.z);
  }

  #moveSlides(dt) {
    const { system } = this.#space;
    const finished = [];
    for (const slide of this.#slides) {
      slide.elapsed += dt;
      const t = Math.min(1, slide.elapsed / SLIDE_SECONDS);
      const point = lerpPoint(slide.from, slide.to, easeInOut(t));
      system.entry(slide.id).holder.position.set(point.x, point.y, point.z);
      if (t >= 1) finished.push(slide);
    }
    this.#slides = this.#slides.filter((s) => !finished.includes(s));
  }

  /** The two short effects after a try: the orbit that was tried glows red, and a wrong planet shakes and goes back. */
  #tickEffects(dt) {
    if (this.#flash) {
      this.#flash.left -= dt;
      if (this.#flash.left <= 0) {
        const { order } = this.#flash;
        this.#flash = null;
        this.#orbitState(order);
      }
    }
    if (this.#shake) {
      this.#shake.left -= dt;
      const entry = this.#space.system.entry(this.#shake.id);
      if (this.#shake.left <= 0) {
        this.#shake = null;
        this.#syncWorld();
      } else {
        entry.holder.position.set(HOVER.x + Math.sin(this.#shake.left * 45) * 0.35 * (this.#shake.left / SHAKE_SECONDS), HOVER.y, HOVER.z);
      }
    }
  }

  /** Names float above the planets that are in orbit or in hand (Easy and Medium only: Hard shows pictures alone). */
  #placeLabels() {
    const { system } = this.#space;
    for (const [id, label] of this.#nameLabels) {
      const entry = system.entry(id);
      const show = entry.holder.visible;
      label.visible = show;
      if (show) label.position.set(entry.holder.position.x, entry.holder.position.y + entry.radius + 0.8, entry.holder.position.z);
    }
  }

  /** A tap on the picture: an orbit ring is a place to put the planet in hand. */
  #onTap({ clientX, clientY }) {
    const hit = this.#space.stage.pick(clientX, clientY, this.#space.system.orbitPickTargets())[0];
    if (hit) this.#onSlot(hit.object.userData.orbit - 1);
  }

  // ------------------------------------------------------------------ the controls

  #render() {
    const { planets } = this.data;
    const lookup = new Map(planets.map((p) => [p.id, p]));
    const size = createSizer(planets, { real: this.#real });
    this.#poolEl.replaceChildren(...this.#state.pool.map((id) => this.#tile(lookup.get(id), size)));
    this.#slotsEl.replaceChildren(...this.#state.placed.map((id, i) => this.#slot(i, id ? lookup.get(id) : null)));
    // On a narrow phone only the planet in hand stays in the list (see style.css), so the orbit buttons are in view.
    this.#panelEl.classList.toggle('has-pick', this.#selected !== null);
    const total = planets.length;
    this.#scoreEl.textContent = `In orbit: ${total - this.#state.pool.length}/${total} · Wrong drops: ${this.#state.wrongDrops}`;
  }

  #tile(planet, size) {
    const selected = this.#selected === planet.id;
    return el('button', {
      class: `tile${selected ? ' is-selected' : ''}`,
      attrs: { type: 'button', 'aria-label': lineupLabel(planet, this.#config.showNames), 'aria-pressed': String(selected) },
      data: { id: planet.id }, on: { click: () => this.#select(planet.id) },
    }, el('span', { class: 'tile__art' }, createPlanetArt(planet, { diameter: Math.min(size(planet), 36) })),
    this.#config.showNames ? el('span', { class: 'tile__name', text: planet.name }) : null);
  }

  #slot(index, planet) {
    const filled = planet !== null;
    const label = filled ? `Orbit ${index + 1}: ${planet.name}` : `Orbit ${index + 1}${index === 0 ? ', next to the Sun' : ''}, empty`;
    const slot = el('button', {
      class: `slot${filled ? ' is-filled' : ''}`, attrs: { type: 'button', 'aria-label': label }, data: { index: String(index) },
      on: { click: () => this.#onSlot(index) },
    },
    this.#config.showNumbers ? el('span', { class: 'slot__number', text: String(index + 1), attrs: { 'aria-hidden': 'true' } }) : null,
    el('span', { class: 'slot__orbit' }, filled ? createPlanetArt(planet, { diameter: 32 }) : null),
    filled && this.#config.showNames ? el('span', { class: 'slot__name', text: planet.name }) : null);
    // A planet that is already in orbit cannot take another, so it is not a target for a tap.
    if (filled) slot.setAttribute('aria-disabled', 'true');
    return slot;
  }

  #select(planetId) {
    this.#selected = this.#selected === planetId ? null : planetId;
    this.services.audio.play('click');
    const planet = this.data.planets.find((p) => p.id === planetId);
    this.#status.say(this.#selected ? `${this.#config.showNames ? planet.name : 'That planet'} is picked. Now tap its orbit.` : INTRO, 'info');
    this.#shake = null;
    this.#syncWorld();
    this.#render();
    if (this.#selected) this.#poolEl.querySelector(`[data-id="${planetId}"]`)?.focus();
  }

  #onSlot(index) {
    if (this.#state.placed[index] !== null || this.#disposed) return;
    if (!this.#selected) {
      this.#status.say('Pick a planet first, then tap the orbit where it goes.', 'info');
      return;
    }
    this.#tryPlace(this.#selected, index);
  }

  /** Tries the planet in hand in one orbit, using the same rule and hint as the 2D line-up. */
  #tryPlace(planetId, index) {
    const { services, data } = this;
    const planet = data.planets.find((p) => p.id === planetId);
    const result = place(this.#state, planetId, index);
    this.#state = result.state;
    this.#selected = null;
    const reduced = this.#space.reducedMotion;

    if (!result.correct) {
      services.audio.play('boop');
      this.#status.say(result.hint, 'bad');
      services.speech.speak(result.hint);
      this.#flash = { order: index + 1, left: WRONG_FLASH_SECONDS };
      // The planet that was tried shakes in place and then goes back to waiting (no shake when motion is turned down).
      this.#shake = reduced ? null : { id: planetId, left: SHAKE_SECONDS };
      this.#syncWorld();
      this.#render();
      return;
    }
    services.audio.play('ding');
    this.#status.say(`${planet.name} is in orbit ${index + 1}! ${planet.fact}`, 'good');
    services.speech.speak(`${planet.name}. ${planet.fact}`);
    const to = orbitPoint(planet.order);
    if (reduced) this.#space.system.entry(planetId).holder.position.set(to.x, to.y, to.z);
    else this.#slides.push({ id: planetId, from: { ...HOVER }, to, elapsed: 0 });
    this.#syncWorld();
    this.#render();
    if (allPlaced(this.#state)) this.#finish();
  }

  #finish() {
    const { services } = this;
    services.audio.play('cheer');
    launchConfetti({ rng: services.rng, count: 50 });
    const { wrongDrops } = this.#state;
    this.#actionsEl.replaceChildren(createButton({
      label: 'See my results', icon: '🚀', variant: 'primary', big: true,
      onClick: () => this.routes.results({
        mode: 'lineup', levelId: this.#levelId, stars: lineupStars(wrongDrops), score: lineupScore(wrongDrops),
        lines: [`All 8 planets in orbit, with ${wrongDrops === 0 ? 'no wrong drops' : `${wrongDrops} wrong ${wrongDrops === 1 ? 'drop' : 'drops'}`}.`],
      }),
    }));
    this.#actionsEl.firstChild.focus();
    this.#status.say(`Every planet is in orbit! ${this.#state.planets.at(-1).name} is the farthest from the Sun.`, 'good');
    this.#space.showWholeSystem();
  }

  // ------------------------------------------------------------------ leaving 3D

  #switchView(next) {
    this.routes.view.choose(next);
    this.routes.play({ mode: 'lineup', levelId: this.#levelId });
  }

  /** The graphics context was lost (a phone reclaimed the GPU): carry on in 2D, with no error screen. */
  #lost() {
    this.routes.fallBack({ mode: 'lineup', levelId: this.#levelId });
  }
}
