import { PlantScene } from './PlantScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createRng } from '../../../engine/utils/random.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createProgressBar } from '../../../engine/ui/ProgressBar.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS } from '../logic/levels.js';
import { createWeather, WEATHER } from '../logic/weather.js';
import { createPlant, nextDay, effectiveInputs, isFinished, DAYS, GROW_AT } from '../logic/simulation.js';
import { diagnose, worstNeed, problemFor, NEED_LABELS } from '../logic/messages.js';
import { createPlantArt } from '../ui/PlantArt.js';
import { createNeedSlider } from '../ui/NeedSlider.js';

const NEED_ICONS = Object.freeze({ water: '💧', sun: '☀️', food: '🌱' });
const NEEDS = Object.freeze(['water', 'sun', 'food']);
/** What a score looks like on the day card: a tick, a half circle and a cross, so it is not only a colour. */
const SCORE_MARKS = Object.freeze({ 1: { icon: ICONS.check, text: 'just right' }, 0.5: { icon: '◐', text: 'close' }, 0: { icon: ICONS.cross, text: 'off' } });

/**
 * The garden: one day at a time. In the morning the weather is shown and the child sets three sliders (they start where
 * yesterday's were left, so the child adjusts instead of starting again); "Next day" lives the day with the simulation,
 * grows the plant and shows a day card. How much the game says depends on the level: Easy marks the ideal ranges and
 * explains each day, Medium only lets the plant speak in a thought bubble, Hard says nothing until the journal.
 */
export class GardenScene extends PlantScene {
  #plant = null;
  #config = null;
  #levelId = 'easy';
  #seed = 0;
  #weather = [];
  #state = createPlant();
  #inputs = { water: 5, sun: 5, food: 5 };
  #sliders = {};
  #art = null;
  #meter = null;
  #hud = null;
  #bannerEl = null;
  #stageEl = null;
  #bubbleEl = null;
  #healthEl = null;
  #effectEl = null;
  #controlsEl = null;
  #summaryEl = null;
  #nextButton = null;

  /** @param {{ plantId: string, levelId: 'easy'|'medium'|'hard', seed?: number }} params */
  enter({ plantId, levelId, seed }) {
    const { services } = this;
    this.#plant = this.plant(plantId);
    if (!this.#plant) throw new GameError('UNKNOWN_PLANT', `There is no plant "${plantId}"`, { plantId });
    if (!LEVELS[levelId]) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
    this.#levelId = levelId;
    this.#config = LEVELS[levelId];
    // The week's weather is fixed by a seed before day 1, so a round can be replayed exactly.
    this.#seed = seed ?? Math.floor(services.rng() * 2 ** 31);
    this.#weather = createWeather(createRng(this.#seed), levelId);

    this.#hud = createHud({ homeHref: services.game.homeHref, title: this.#plant.name, stats: [{ id: 'day', label: 'Day' }], onSettings: () => services.openSettings() });
    this.#art = createPlantArt(this.#plant, { size: 210 });
    this.#meter = createProgressBar({ label: 'Plant health', max: 100, value: this.#state.health });
    this.#bannerEl = el('div', { class: 'weatherbar', attrs: { role: 'status' } });
    this.#bubbleEl = el('div', { class: 'bubble', attrs: { role: 'status' } });
    this.#bubbleEl.hidden = true;
    this.#healthEl = el('p', { class: 'garden__health' });
    // The plant and its health sit side by side on a phone (so the sliders still fit on the screen) and one above the other on a wide one.
    this.#stageEl = el('section', { class: 'garden__stage', attrs: { 'aria-label': 'Your plant' } }, this.#bubbleEl, el('div', { class: 'garden__plant' }, this.#art.el), el('div', { class: 'garden__vitals' }, this.#healthEl, this.#meter.el));
    this.#effectEl = el('p', { class: 'garden__effect', attrs: { 'aria-live': 'polite' } });

    for (const need of NEEDS) {
      this.#sliders[need] = createNeedSlider({
        need, label: NEED_LABELS[need], icon: NEED_ICONS[need], value: this.#inputs[need],
        range: this.#config.showRanges ? this.#plant.ideal[need] : null,
        onInput: (value) => { this.#inputs[need] = value; this.#syncEffect(); },
      });
    }
    this.#controlsEl = el('section', { class: 'garden__controls', attrs: { 'aria-label': 'Look after your plant' } },
      el('h2', { class: 'garden__heading garden__heading--prompt', text: 'What does it get today?' }), ...NEEDS.map((n) => this.#sliders[n].el), this.#effectEl);
    this.#summaryEl = el('section', { class: 'summary', attrs: { 'aria-label': 'How the day went' } });
    this.#summaryEl.hidden = true;
    this.#nextButton = createButton({ label: 'Next day', icon: '🌙', variant: 'primary', big: true, onClick: () => this.#liveDay() });

    this.ui.append(this.#hud.el, el('main', { class: 'garden' },
      this.#bannerEl,
      el('div', { class: 'garden__body' }, this.#stageEl, el('div', { class: 'garden__side' }, this.#controlsEl, this.#summaryEl, el('div', { class: 'garden__actions' }, this.#nextButton)))));
    this.#morning();
  }

  /** The state of the plant as the picture should show it: how it feels, and (if the level allows) what bothers it. */
  #look(log, showProblem) {
    const mood = log ? (log.wilting ? 'wilting' : log.health >= GROW_AT ? 'happy' : 'ok') : 'happy';
    const problem = log && showProblem ? problemFor(worstNeed(diagnose(log.effective, this.#plant, log.scores))) : null;
    return { stage: this.#state.stage, mood, problem: problem && problem.id !== 'happy' ? problem.id : null };
  }

  #showHealth() {
    this.#meter.set(this.#state.health);
    const face = this.#state.health >= GROW_AT ? '😀' : this.#state.health >= 30 ? '😐' : '😟';
    this.#healthEl.textContent = `${face} Health ${this.#state.health} out of 100`;
  }

  // ------------------------------------------------------------------ morning

  #morning() {
    const day = this.#state.day + 1;
    const weather = WEATHER[this.#weather[day - 1]];
    this.#hud.setStat('day', `${day}/${DAYS}`);
    // The weather comes first, before the sliders are touched, so the child can plan for it.
    this.#bannerEl.className = `weatherbar weatherbar--${this.#weather[day - 1]}`;
    this.#bannerEl.replaceChildren(
      el('span', { class: 'weatherbar__icon', text: weather.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', {}, el('strong', { text: `Day ${day} of ${DAYS}: ${weather.label}.` }), ` ${weather.effect}`));
    this.#stageEl.className = `garden__stage weather--${this.#weather[day - 1]}`;
    this.#summaryEl.hidden = true;
    this.#controlsEl.hidden = false;
    for (const need of NEEDS) { this.#sliders[need].setValue(this.#inputs[need]); this.#sliders[need].setDisabled(false); }
    this.#bubbleEl.hidden = true;
    this.#art.update(this.#look(this.#state.history.at(-1) ?? null, this.#config.hints !== 'none'));
    this.#showHealth();
    this.#syncEffect();
    this.#nextButton.replaceWith(this.#nextButton = createButton({ label: 'Next day', icon: '🌙', variant: 'primary', big: true, onClick: () => this.#liveDay() }));
    this.services.speech.speak(`Day ${day}. ${weather.label}. ${weather.effect}`);
  }

  /** Under the sliders: what the plant will really get once the weather has had its say. */
  #syncEffect() {
    const kind = this.#weather[this.#state.day];
    if (kind === undefined || kind === 'sunny') { this.#effectEl.textContent = ''; return; }
    const e = effectiveInputs(this.#inputs, kind);
    this.#effectEl.textContent = `Because ${WEATHER[kind].because}, your plant will get: water ${e.water}, sunlight ${e.sun}, fertiliser ${e.food}.`;
  }

  // ---------------------------------------------------------------- the day

  #liveDay() {
    const { services } = this;
    const { state, log } = nextDay(this.#state, this.#inputs, this.#plant, this.#weather[this.#state.day]);
    this.#state = state;
    for (const need of NEEDS) this.#sliders[need].setDisabled(true);

    const showProblem = this.#config.hints !== 'none';
    const problem = problemFor(worstNeed(diagnose(log.effective, this.#plant, log.scores)));
    this.#art.update(this.#look(log, showProblem));
    this.#showHealth();
    if (this.#config.hints !== 'none') {
      this.#bubbleEl.hidden = false;
      this.#bubbleEl.replaceChildren(el('span', { text: problem.icon, attrs: { 'aria-hidden': 'true' } }), ` ${problem.bubble}`);
      services.speech.speak(problem.bubble);
    }
    services.audio.play(log.advanced ? 'chime' : log.healthChange < 0 ? 'boop' : 'pop');
    this.#showSummary(log, problem);

    const last = isFinished(this.#state);
    this.#nextButton.replaceWith(this.#nextButton = createButton({
      label: last ? 'See my plant' : 'Next morning', icon: last ? '🌻' : '🌅', variant: 'primary', big: true,
      onClick: () => (last ? this.routes.results({ plant: this.#plant, levelId: this.#levelId, state: this.#state, seed: this.#seed }) : this.#morning()),
    }));
    this.#nextButton.focus();
  }

  /** The day card: what changed, and on Easy also why. */
  #showSummary(log, problem) {
    const change = log.healthChange;
    const before = log.health - change;
    const trend = change > 0 ? { icon: '▲', text: `Health went up ${change}: ${before} to ${log.health}.` }
      : change < 0 ? { icon: '▼', text: `Health went down ${-change}: ${before} to ${log.health}.` }
        : { icon: '＝', text: `Health stayed the same at ${log.health}.` };
    const lines = [
      el('p', { class: 'summary__health' }, el('span', { text: trend.icon, attrs: { 'aria-hidden': 'true' } }), ` ${trend.text}`),
      el('p', { class: 'summary__stage', text: log.wilting ? 'The plant is wilting, but it can get better!' : log.advanced ? `It grew! Now it is a ${this.#plant.stages[log.stage].toLowerCase()}.` : `It did not grow today. It is still a ${this.#plant.stages[log.stage].toLowerCase()}.` }),
    ];
    if (this.#config.hints === 'full') {
      lines.push(
        el('ul', { class: 'summary__needs' }, ...NEEDS.map((need) => {
          const mark = SCORE_MARKS[log.scores[need]];
          return el('li', {}, el('span', { text: NEED_ICONS[need], attrs: { 'aria-hidden': 'true' } }), ` ${NEED_LABELS[need]} ${log.effective[need]}: `, el('span', { class: `mark mark--${log.scores[need] === 1 ? 'ok' : log.scores[need] === 0.5 ? 'near' : 'off'}`, html: mark.icon, attrs: { 'aria-hidden': 'true' } }), ` ${mark.text}`);
        })),
        el('p', { class: 'summary__reason', text: problem.message }));
    }
    this.#summaryEl.replaceChildren(el('h2', { class: 'garden__heading', text: `Day ${log.day} went like this` }), ...lines);
    this.#summaryEl.hidden = false;
    this.#controlsEl.hidden = true;
  }
}
