import { HopScene } from '../scenes/HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError, logError } from '../../../engine/utils/errors.js';
import { createMachine } from '../../../engine/utils/stateMachine.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { Vector3, Quaternion } from '../../../engine/three/three.js';
import { createViewToggle } from '../../../engine/three/ViewToggle.js';
import { LEVELS, MIN_STOPS_BEFORE_MYSTERY } from '../logic/levels.js';
import { parseWeight, feltWeight, explainWeight, formatKg } from '../logic/weight.js';
import { createSizer, dialMax } from '../logic/scale.js';
import { questionStars, questionScore } from '../logic/scoring.js';
import { easeInOut } from '../../../engine/three/motionMath.js';
import { hopArc, flightSeconds, arcLift } from '../logic/motion3d.js';
import { FIGURE_HEIGHT, bodyRadius, figureScale, focusFraming } from '../logic/space3d.js';
import { jumpHeight, jumpNote, jumpOffset, jumpTotalSeconds } from '../logic/gravityJump.js';
import { ROCKET_TRIP_MACHINE } from '../logic/rocketTrip.machine.js';
import { createPlanetArt } from '../ui/PlanetArt.js';
import { createSizeToggle } from '../ui/SizeToggle.js';
import { createWeightSetup } from '../ui/WeightSetup.js';
import { createMissionCheck } from '../ui/MissionCheck.js';
import { SpaceStage } from './SpaceStage.js';
import { createRocket, createAstronaut } from './figures.js';

/** The rocket starts at home, which is the place in the data with this id. */
const HOME_ID = 'earth';
/** With motion turned down the astronaut does not jump: they are held at the top of the jump for this long instead. */
const STILL_POSE_SECONDS = 1.2;
const UP = new Vector3(0, 1, 0);

/**
 * "Weigh-in" in 3D: the child says how much they weigh (or picks a toy), then hops a rocket from planet to planet
 * through the solar system. On each landing an astronaut steps out and jumps with the same push everywhere, so the
 * child *sees* gravity: a high, slow jump on the Moon, a short hop on Jupiter. The scale shows the felt weight, and
 * the same five mystery questions as the 2D game give the round its stars.
 *
 * Setup and the mission check are the same screens the 2D scene uses (`ui/WeightSetup.js`, `ui/MissionCheck.js`);
 * only the hopping view is 3D. The weight stays in this scene: it is never saved and never leaves the device.
 */
export class Weigh3DScene extends HopScene {
  #levelId = 'easy';
  #config = null;
  #kg = 0;
  #who = '';
  #home = null;
  #current = null;
  #visited = new Set();
  #real = false;
  #hud = null;
  #main = null;
  #mission = null;
  #off = null;

  // Everything below exists only while the hopping view is on screen (see #closeStage).
  #space = null;
  #trip = null;
  #flight = null;
  #jumpElapsed = 0;
  #rocket = null;
  #astronaut = null;
  #focused = false;
  #cardEl = null;
  #jumpEl = null;
  #card = null;
  #stopButtons = new Map();
  #checkSlot = null;
  #disposed = false;

  /** @param {{ levelId: 'easy'|'medium'|'hard', resume?: { kg: number, who: string } }} params `resume` skips the weight question (see `PlayChoice`). */
  enter({ levelId, resume }) {
    const { services, data } = this;
    if (!LEVELS[levelId]) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
    this.#levelId = levelId;
    this.#config = LEVELS[levelId].weigh;
    this.#home = data.stops.find((b) => b.id === HOME_ID) ?? data.stops[0];

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'mission', label: 'Mission' }],
      onSettings: () => services.openSettings(),
    });
    this.#showHops();
    this.#main = el('main', { class: 'weigh' });
    this.ui.append(this.#hud.el, this.#main);
    this.#off = services.input.on('key', (event) => this.#mission?.handleKey(event));
    if (resume) this.#start(parseWeight(resume.kg), String(resume.who));
    else this.#showSetup();
  }

  exit() {
    this.#disposed = true;
    this.#off?.();
    this.#closeStage();
  }

  update(dt) {
    if (this.#disposed || !this.#space) return;
    this.#space.update(dt);
    this.#moveFigures(dt, this.#space.reducedMotion);
  }

  render() {
    if (!this.#disposed) this.#space?.render();
  }

  resize() {
    // Nothing to do: the stage watches its own container, and the DOM controls reflow with CSS.
  }

  // -------------------------------------------------------------- 1. the weight

  #showSetup() {
    this.#closeStage();
    this.#mission = null;
    this.#main.className = 'weigh';
    const setup = createWeightSetup({
      ownWeight: this.#config.ownWeight, presets: this.data.presets, onStart: (kg, who) => this.#start(kg, who),
    });
    this.#main.replaceChildren(setup.el);
    setup.focus();
  }

  #start(kg, who) {
    this.#kg = kg;
    this.#who = who;
    this.#visited = new Set();
    this.#showHops();
    this.#showHop();
  }

  // ------------------------------------------------------------------ 2. hopping

  /** The weight on every stop, to the whole scale's width: the child's weight on the strongest pull is the top. */
  #dial() {
    return dialMax(Math.max(...this.data.stops.map((b) => feltWeight(this.#kg, b.gravity))));
  }

  /** Builds the 3D view and the controls beside it, with the rocket standing on Earth. */
  #showHop() {
    this.#closeStage();
    const { stops } = this.data;
    const stageEl = el('div', { class: 'scene3d__stage' });
    // The card's parts are made once and only their text changes, so the scale bar can slide to its new reading.
    this.#card = {
      name: el('h2', { class: 'weigh__name' }), felt: el('p', { class: 'weigh__felt' }),
      fill: el('span', { class: 'meter__fill' }), why: el('p', { class: 'weigh__why' }), fact: el('p', { class: 'weigh__fact' }),
    };
    // The place and the felt weight come first and the long sentences after the buttons: on a phone the child sees what
    // they need to hop without scrolling the controls.
    this.#cardEl = el('section', { class: 'weigh3d__card', attrs: { 'aria-label': 'Where you are' } },
      // A live region: each hop reads out the place and the felt weight together.
      el('div', { class: 'weigh3d__headline', attrs: { role: 'status' } }, this.#card.name, this.#card.felt),
      el('div', { class: 'meter', attrs: { 'aria-hidden': 'true' } }, this.#card.fill));
    this.#jumpEl = el('p', { class: 'weigh3d__jump', attrs: { role: 'status' } });
    this.#checkSlot = el('div', { class: 'weigh__check' });
    this.#stopButtons = new Map();

    const stopsEl = el('div', { class: 'stops3d', attrs: { role: 'group', 'aria-label': 'Places to hop to' } }, ...stops.map((body) => {
      const button = el('button', { class: 'stop3d', attrs: { type: 'button' }, on: { click: () => this.#hopTo(body) } },
        createPlanetArt(body, { diameter: 28 }), el('span', { class: 'stop3d__name', text: body.name }));
      this.#stopButtons.set(body.id, button);
      return button;
    }));

    this.#main.className = 'scene3d weigh3d';
    this.#main.replaceChildren(stageEl, el('div', { class: 'scene3d__panel' },
      el('header', { class: 'weigh__who' },
        el('p', {}, el('strong', { text: this.#who }), ` ${this.#who === 'You' ? 'weigh' : 'weighs'} ${formatKg(this.#kg)} on Earth.`),
        createButton({ label: 'Change weight', icon: '✏️', onClick: () => this.#showSetup() })),
      this.#cardEl,
      el('div', { class: 'weigh3d__jumprow' }, this.#jumpEl, createButton({ icon: '🦘', ariaLabel: 'Jump again', onClick: () => this.#startJump() })),
      stopsEl,
      el('div', { class: 'weigh3d__more' }, this.#card.why, this.#card.fact),
      el('div', { class: 'lineup__extras' },
        createSizeToggle({ onChange: (real) => this.#setReal(real) }),
        createButton({ label: 'Whole system', icon: '🔭', onClick: () => { this.#focused = false; this.#space.showWholeSystem(); } }),
        createViewToggle({ mode: '3d', onChange: (next) => this.#switchView(next) })),
      this.#checkSlot));

    try {
      this.#space = new SpaceStage({
        container: stageEl, planets: this.data.planets, real: this.#real,
        onContextLost: () => this.#lost(), onTap: (point) => this.#onTap(point),
        label: '3D solar system with a rocket. Use the buttons beside it to hop from place to place.',
      });
    } catch (error) {
      // No 3D on this device after all: log why, then carry on in 2D. The child never sees an error screen.
      logError(error, 'planet-hop:weigh3d');
      this.#lost();
      return;
    }
    this.#current = this.#home;
    this.#buildWorld();
    this.#markStops();
    this.#describe(this.#home, { announce: false });
    this.#syncCheck();
    this.#startJump();
  }

  #buildWorld() {
    const { system } = this.#space;
    for (const planet of this.data.planets) system.addOrbit(planet.order);
    // Planets first, then the Moon: it is placed next to the planet it orbits, which must already exist.
    for (const body of this.data.stops) system.addBody(body);
    this.#rocket = createRocket(this.#space.stage.quality);
    this.#astronaut = createAstronaut(this.#space.stage.quality);
    this.#astronaut.visible = false;
    system.group.add(this.#rocket, this.#astronaut);
    this.#trip = createMachine(ROCKET_TRIP_MACHINE);
    this.#flight = null;
    this.#focused = false;
    this.#moveFigures(0, this.#space.reducedMotion);
  }

  #closeStage() {
    this.#space?.dispose();
    this.#space = null;
    this.#trip = null;
    this.#flight = null;
    this.#rocket = null;
    this.#astronaut = null;
  }

  #setReal(real) {
    this.#real = real;
    this.#space.system.setSizer(real, createSizer(this.data.planets, { real }), this.#space.reducedMotion);
    // Looking at a body: follow its new size, so a shrunken Mercury is still framed instead of left far away.
    if (this.#focused) this.#focusOn(this.#current);
  }

  /** @param {{ id: string, radiusKm: number }} body @returns {number} The radius it has, or is growing to, in this view. */
  #goalRadius(body) {
    return bodyRadius(createSizer(this.data.planets, { real: this.#real })(body));
  }

  #focusOn(body) {
    const entry = this.#space.system.entry(body.id);
    const radius = this.#goalRadius(body);
    const at = entry.holder.position;
    // Aim above the surface and stand back far enough for the whole jump, so the astronaut is never cut off.
    const { distance, lift } = focusFraming({ radius, gravity: body.gravity });
    this.#space.glideTo({ distance, target: { x: at.x, y: at.y + lift, z: at.z } });
    this.#focused = true;
  }

  /** A tap on a planet in the picture hops there, the same as its button. */
  #onTap({ clientX, clientY }) {
    const hit = this.#space.stage.pick(clientX, clientY, this.#space.system.bodyPickTargets())[0];
    const body = hit && this.data.stops.find((b) => b.id === hit.object.userData.bodyId);
    if (body) this.#hopTo(body);
  }

  #hopTo(body) {
    const { services } = this;
    if (!this.#space || body.id === this.#current.id) return;
    services.audio.play('whoosh');
    this.#trip.must('HOP');
    this.#current = body;
    this.#startFlight(body);
    if (body.id !== this.#home.id) this.#visited.add(body.id);
    this.#markStops();
    this.#showHops();
    this.#describe(body, { announce: true });
    this.#syncCheck();
    this.#focusOn(body);
  }

  /** The header counter while hopping: one small pill is all a phone's header has room for. */
  #showHops() {
    const hops = this.#visited.size;
    this.#hud.setStat('mission', `${hops} ${hops === 1 ? 'hop' : 'hops'}`);
  }

  /** Marks the place the rocket is at, and ticks off each place it has been to (home is where it starts, not a hop). */
  #markStops() {
    for (const body of this.data.stops) {
      const button = this.#stopButtons.get(body.id);
      const done = this.#visited.has(body.id);
      const here = body.id === this.#current.id;
      button.classList.toggle('is-visited', done);
      button.classList.toggle('is-here', here);
      button.setAttribute('aria-label', `Hop to ${body.name}${done ? ', visited' : ''}${here ? ', you are here' : ''}`);
      if (here) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
      button.querySelector('.stop3d__done')?.remove();
      if (done) button.append(el('span', { class: 'stop3d__done', html: ICONS.check, attrs: { 'aria-hidden': 'true' } }));
    }
  }

  /** Shows the felt weight and what to know about the place. */
  #describe(body, { announce }) {
    const { services } = this;
    const felt = feltWeight(this.#kg, body.gravity);
    const card = this.#card;
    card.name.textContent = body.name;
    card.felt.textContent = `${formatKg(this.#kg)} × ${body.gravity} = ${formatKg(felt)}`;
    card.fill.style.width = `${Math.min(100, Math.max(0, (felt / this.#dial()) * 100))}%`;
    card.why.textContent = explainWeight(body);
    card.fact.textContent = body.fact;
    if (announce) services.speech.speak(`${body.name}. ${formatKg(felt)}. ${explainWeight(body)}`);
  }

  #syncCheck() {
    const need = MIN_STOPS_BEFORE_MYSTERY - this.#visited.size;
    const button = createButton({
      label: need > 0 ? 'Mission check' : 'Start the mission check', icon: '🎯', variant: 'primary', big: true,
      disabled: need > 0, onClick: () => this.#startMystery(),
    });
    this.#checkSlot.replaceChildren(button, need > 0
      ? el('p', { class: 'weigh__note', text: `Hop to ${need} more ${need === 1 ? 'place' : 'places'} first, then the mission check opens.` })
      : null);
  }

  // ------------------------------------------------------------------ the rocket and the astronaut

  /** @returns {Vector3} The world point on top of a body, where the rocket stands. */
  #topOf(id) {
    const entry = this.#space.system.entry(id);
    return new Vector3(entry.holder.position.x, entry.holder.position.y + entry.radius, entry.holder.position.z);
  }

  #startFlight(body) {
    const from = this.#rocket.position;
    const start = { x: from.x, y: from.y, z: from.z };
    const end = this.#topOf(body.id);
    if (this.#space.reducedMotion) {
      // A cut instead of a fly-through: the rocket is simply there.
      this.#flight = null;
      this.#rocket.position.copy(end);
      this.#trip.must('LAND');
      this.#beginJump();
      return;
    }
    this.#flight = { toId: body.id, from: start, elapsed: 0, seconds: flightSeconds(start, end), lift: arcLift(start, end), scaleFrom: this.#rocket.scale.x };
  }

  /** Moves the rocket along its flight, or rests it on its planet, and keeps the astronaut beside it. */
  #moveFigures(dt, reduced) {
    if (this.#trip.is('flying') && this.#flight) {
      const flight = this.#flight;
      flight.elapsed += dt;
      const t = Math.min(1, flight.elapsed / flight.seconds);
      const end = this.#topOf(flight.toId);
      const point = hopArc(flight.from, end, t, flight.lift);
      this.#rocket.position.set(point.x, point.y, point.z);
      const scaleNow = flight.scaleFrom + (figureScale(this.#space.system.radiusOf(flight.toId)) - flight.scaleFrom) * easeInOut(t);
      this.#rocket.scale.setScalar(scaleNow);
      this.#pointRocket(flight, end, t);
      this.#astronaut.visible = false;
      if (t >= 1) {
        this.#flight = null;
        this.#rocket.quaternion.identity();
        this.#trip.must('LAND');
        this.#beginJump();
      }
      return;
    }
    const id = this.#current?.id;
    if (!id) return;
    const radius = this.#space.system.radiusOf(id);
    const scale = figureScale(radius);
    this.#rocket.position.copy(this.#topOf(id));
    this.#rocket.scale.setScalar(scale);
    this.#rocket.quaternion.identity();
    this.#placeAstronaut(id, radius, scale, dt, reduced);
  }

  /** Tips the rocket's nose along the way it is going, so it flies rather than slides. */
  #pointRocket(flight, end, t) {
    const ahead = Math.min(1, t + 0.04);
    if (ahead === t) return;
    const next = hopArc(flight.from, end, ahead, flight.lift);
    const heading = new Vector3(next.x - this.#rocket.position.x, next.y - this.#rocket.position.y, next.z - this.#rocket.position.z);
    if (heading.lengthSq() > 1e-10) this.#rocket.quaternion.copy(new Quaternion().setFromUnitVectors(UP, heading.normalize()));
  }

  /** The astronaut stands beside the rocket and, after a landing, jumps as high as this body's gravity allows. */
  #placeAstronaut(id, radius, scale, dt, reduced) {
    const jumping = this.#trip.is('jumping');
    this.#astronaut.visible = true;
    const { gravity } = this.#current;
    const figure = FIGURE_HEIGHT * scale;
    let lift = 0;
    if (jumping) {
      this.#jumpElapsed += dt;
      const total = reduced ? STILL_POSE_SECONDS : jumpTotalSeconds(gravity);
      if (this.#jumpElapsed >= total) this.#trip.must('SETTLE');
      else lift = reduced ? jumpHeight(gravity, figure) : jumpOffset(gravity, figure, this.#jumpElapsed);
    }
    // Standing on a ball: a little way round from the top, where the rocket is, and a little lower there.
    const turn = Math.min(0.9, (figure * 0.8) / Math.max(radius, 1e-6));
    const at = this.#space.system.entry(id).holder.position;
    this.#astronaut.position.set(at.x + Math.sin(turn) * radius, at.y + Math.cos(turn) * radius + lift, at.z);
    this.#astronaut.scale.setScalar(scale);
  }

  /** Starts the astronaut's jump on the body the rocket is on (the "Jump again" button, and each landing). */
  #startJump() {
    if (!this.#trip?.send('JUMP')) return;
    this.#beginJump(false);
  }

  #beginJump(alreadyJumping = true) {
    this.#jumpElapsed = 0;
    this.#jumpEl.textContent = jumpNote(this.#current);
    if (alreadyJumping) this.services.audio.play('click');
  }

  // ------------------------------------------------------------------ 3. mission check

  #startMystery() {
    const { services, data } = this;
    // The picture is no longer needed: free the graphics memory before the questions.
    this.#closeStage();
    this.#main.className = 'weigh';
    this.#mission = createMissionCheck({
      services, stops: data.stops, kg: this.#kg, who: this.#who, optionCount: this.#config.options,
      onProgress: (done, total) => this.#hud.setStat('mission', `${done}/${total}`),
      onFinish: (result) => this.#finish(result),
    });
    this.#main.replaceChildren(this.#mission.el);
  }

  #finish({ correct, total }) {
    this.routes.results({
      mode: 'weigh', levelId: this.#levelId, stars: questionStars(correct, total), score: questionScore(correct),
      lines: [`${correct} of ${total} mystery places found.`, `You hopped to ${this.#visited.size} ${this.#visited.size === 1 ? 'place' : 'places'}.`],
    });
  }

  // ------------------------------------------------------------------ leaving 3D

  /** The weight goes with the child to the other view, so they do not have to type it again (it is still never saved). */
  #resume() {
    return this.#kg > 0 ? { kg: this.#kg, who: this.#who } : undefined;
  }

  #switchView(next) {
    this.routes.view.choose(next);
    this.routes.play({ mode: 'weigh', levelId: this.#levelId, resume: this.#resume() });
  }

  /** The graphics were lost or never started: carry on in 2D, with no error screen. */
  #lost() {
    this.routes.fallBack({ mode: 'weigh', levelId: this.#levelId, resume: this.#resume() });
  }
}
