import { HopScene } from './HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, MIN_STOPS_BEFORE_MYSTERY } from '../logic/levels.js';
import { parseWeight, feltWeight, explainWeight, formatKg } from '../logic/weight.js';
import { createSizer, dialMax } from '../logic/scale.js';
import { questionStars, questionScore } from '../logic/scoring.js';
import { createPlanetArt } from '../ui/PlanetArt.js';
import { createScaleView } from '../ui/ScaleView.js';
import { createSizeToggle } from '../ui/SizeToggle.js';
import { createWeightSetup } from '../ui/WeightSetup.js';
import { createMissionCheck } from '../ui/MissionCheck.js';

/** The rocket starts at home, which is the place in the data with this id. */
const HOME_ID = 'earth';
/** How long the "whoosh" streak plays on the planet card after a hop. */
const HOP_MS = 600;

/**
 * "Weigh-in": say how much you weigh (or pick a toy), hop to each planet in a rocket and watch the cartoon scale show
 * how heavy you would feel. After a few hops come five "which place is it?" questions about the weights, which give the
 * round its stars.
 *
 * The weight lives only in this scene (a plain field): it is never written to storage or sent anywhere.
 */
export class WeighScene extends HopScene {
  #levelId = 'easy';
  #config = null;
  #kg = 0;
  #who = '';
  #home = null;
  #current = null;
  #visited = new Set();
  #real = false;
  #hud = null;
  #host = null;
  #scale = null;
  #cardEl = null;
  #rocket = null;
  #checkSlot = null;
  #stopButtons = new Map();
  #hopTimer = 0;
  #panel = null;
  #off = null;

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
    this.#host = el('div', { class: 'weigh' });
    this.ui.append(this.#hud.el, this.#host);
    this.#off = services.input.on('key', (event) => this.#panel?.handleKey(event));
    if (resume) this.#start(parseWeight(resume.kg), String(resume.who));
    else this.#showSetup();
  }

  exit() {
    this.#off?.();
    clearTimeout(this.#hopTimer);
  }

  // -------------------------------------------------------------- 1. the weight

  #showSetup() {
    this.#panel = null;
    const setup = createWeightSetup({
      ownWeight: this.#config.ownWeight, presets: this.data.presets, onStart: (kg, who) => this.#start(kg, who),
    });
    this.#host.replaceChildren(setup.el);
    setup.focus();
  }

  #start(kg, who) {
    this.#kg = kg;
    this.#who = who;
    this.#visited = new Set();
    this.#showHops();
    this.#showHop(this.#home);
  }

  // ------------------------------------------------------------------ 2. hopping

  /** The weight on every stop, to the whole scale's width: the child's weight on the strongest pull is the top. */
  #dial() {
    return dialMax(Math.max(...this.data.stops.map((b) => feltWeight(this.#kg, b.gravity))));
  }

  #showHop(current) {
    const { stops, planets } = this.data;
    const size = createSizer(planets, { real: this.#real });
    this.#scale = createScaleView({ max: this.#dial() });
    this.#cardEl = el('section', { class: 'weigh__card', attrs: { 'aria-label': 'Where you are' } });
    this.#rocket = el('span', { class: 'rocket', text: '🚀', attrs: { 'aria-hidden': 'true' } });
    this.#stopButtons = new Map();

    const stopsEl = el('div', { class: 'stops', attrs: { role: 'group', 'aria-label': 'Places to hop to' } }, ...stops.map((body) => {
      const done = this.#visited.has(body.id);
      const button = el('button', {
        class: `stop${done ? ' is-visited' : ''}`, attrs: { type: 'button', 'aria-label': `Hop to ${body.name}${done ? ', visited' : ''}` },
        on: { click: () => this.#hopTo(body) },
      }, createPlanetArt(body, { diameter: Math.min(size(body), 44) }), el('span', { class: 'stop__name', text: body.name }),
      done ? el('span', { class: 'stop__done', html: ICONS.check, attrs: { 'aria-hidden': 'true' } }) : null);
      this.#stopButtons.set(body.id, button);
      return button;
    }));

    this.#checkSlot = el('div', { class: 'weigh__check' });
    this.#host.replaceChildren(
      el('header', { class: 'weigh__who' },
        el('p', {}, el('strong', { text: this.#who === 'You' ? 'You' : this.#who }), ` ${this.#who === 'You' ? 'weigh' : 'weighs'} ${formatKg(this.#kg)} on Earth.`),
        createButton({ label: 'Change weight', icon: '✏️', onClick: () => this.#showSetup() })),
      el('div', { class: 'weigh__stage' }, this.#scale.el, this.#cardEl),
      el('h2', { class: 'weigh__heading', text: 'Hop to a place' }), stopsEl,
      createSizeToggle({ onChange: (real) => { this.#real = real; this.#showHop(this.#current); } }),
      this.#checkSlot);
    this.#current = current;
    this.#stopButtons.get(current.id)?.append(this.#rocket);
    this.#describe(current, { announce: false });
    this.#syncCheck();
  }

  #hopTo(body) {
    const { services } = this;
    if (body.id === this.#current.id) return;
    services.audio.play('whoosh');
    this.#moveRocket(this.#stopButtons.get(body.id));
    this.#current = body;
    if (body.id !== this.#home.id) this.#visited.add(body.id);
    this.#markVisited(body);
    this.#showHops();
    this.#describe(body, { announce: true });
    this.#syncCheck();
  }

  /** The header counter while hopping: one small pill is all a phone's header has room for. */
  #showHops() {
    const hops = this.#visited.size;
    this.#hud.setStat('mission', `${hops} ${hops === 1 ? 'hop' : 'hops'}`);
  }

  /** Ticks a place off the list the first time the rocket lands there (home is where it starts, so it is not a hop). */
  #markVisited(body) {
    const button = this.#stopButtons.get(body.id);
    if (body.id === this.#home.id || button.classList.contains('is-visited')) return;
    button.classList.add('is-visited');
    button.setAttribute('aria-label', `Hop to ${body.name}, visited`);
    button.append(el('span', { class: 'stop__done', html: ICONS.check, attrs: { 'aria-hidden': 'true' } }));
  }

  /** Shows the scale reading and what to know about the place. */
  #describe(body, { announce }) {
    const { services } = this;
    const felt = feltWeight(this.#kg, body.gravity);
    this.#scale.set(felt);
    const size = createSizer(this.data.planets, { real: this.#real });
    this.#cardEl.replaceChildren(
      el('div', { class: 'weigh__art' }, createPlanetArt(body, { diameter: Math.max(6, Math.round(size(body) * 1.5)) })),
      el('h2', { class: 'weigh__name', text: body.name }),
      el('p', { class: 'weigh__felt', text: `${formatKg(this.#kg)} × ${body.gravity} = ${formatKg(felt)}` }),
      el('p', { class: 'weigh__why', text: explainWeight(body) }),
      el('p', { class: 'weigh__fact', text: body.fact }));
    if (announce) {
      this.#cardEl.classList.remove('is-hopping');
      void this.#cardEl.offsetWidth; // restart the whoosh even if it just played
      this.#cardEl.classList.add('is-hopping');
      clearTimeout(this.#hopTimer);
      this.#hopTimer = setTimeout(() => this.#cardEl.classList.remove('is-hopping'), HOP_MS);
      services.speech.speak(`${body.name}. ${formatKg(felt)}. ${explainWeight(body)}`);
    }
  }

  /** Slides the rocket from the old place to the new one (it just appears there if motion is turned down). */
  #moveRocket(toButton) {
    const first = this.#rocket.getBoundingClientRect();
    toButton.append(this.#rocket);
    if (prefersReducedMotion()) return;
    const last = this.#rocket.getBoundingClientRect();
    this.#rocket.style.transition = 'none';
    this.#rocket.style.transform = `translate(${first.left - last.left}px, ${first.top - last.top}px)`;
    void this.#rocket.offsetWidth;
    this.#rocket.style.transition = `transform ${HOP_MS}ms cubic-bezier(0.5, 0, 0.2, 1)`;
    this.#rocket.style.transform = '';
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

  // ------------------------------------------------------------------ 3. mission check

  #startMystery() {
    const { services, data } = this;
    this.#panel = createMissionCheck({
      services, stops: data.stops, kg: this.#kg, who: this.#who, optionCount: this.#config.options,
      onProgress: (done, total) => this.#hud.setStat('mission', `${done}/${total}`),
      onFinish: (result) => this.#finish(result),
    });
    this.#host.replaceChildren(this.#panel.el);
  }

  #finish({ correct, total }) {
    this.routes.results({
      mode: 'weigh', levelId: this.#levelId, stars: questionStars(correct, total), score: questionScore(correct),
      lines: [`${correct} of ${total} mystery places found.`, `You hopped to ${this.#visited.size} ${this.#visited.size === 1 ? 'place' : 'places'}.`],
    });
  }
}
