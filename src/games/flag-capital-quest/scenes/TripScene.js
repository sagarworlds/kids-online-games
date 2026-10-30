import { QuestScene } from './QuestScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { buildTrip } from '../logic/questionFactory.js';
import { reachesView, viewFor } from '../logic/continents.js';
import { TRIP_LENGTH } from '../logic/levels.js';
import { exploredCodes, recordCorrect } from '../logic/progress.js';
import { createWorldMap } from '../ui/WorldMap.js';
import { createFlag } from '../ui/FlagImage.js';
import { createStampCard } from '../ui/StampCard.js';

/** How long a new Next button ignores clicks (see `#offerNext`). */
const NEXT_GUARD_MS = 450;

/** One question of a trip: a flag, a capital or a tap on the map, and what you learn from the answer. */
export class TripScene extends QuestScene {
  #trip = null;
  #question = null;
  #country = null;
  #progress = null;
  #answered = false;
  #map = null;
  #optionEls = [];
  #hud = null;
  #statusEl = null;
  #afterEl = null;
  #optionsEl = null;
  #fallbackEl = null;
  #announcer = null;
  #offs = [];

  /** @param {import('./QuestScene.js').Trip|{ levelId: string, continent: string }} params A new trip, or a trip in progress. */
  enter(params) {
    const { services, data } = this;
    this.#progress = data.progress.load();
    this.#trip = params.questions ? params : this.#startTrip(params);
    const { index, questions } = this.#trip;
    this.#question = questions[index];
    if (!this.#question) throw new GameError('NO_QUESTION', `Trip has no question number ${index}`, { index });
    this.#country = this.index.get(this.#question.code);
    this.#build();
    this.#offs.push(services.input.on('key', (event) => this.#onKey(event)));
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
    this.#map?.destroy();
  }

  /** The questions for a new trip. Map questions only go to countries that can be seen on their continent's map. */
  #startTrip({ levelId, continent }) {
    const { services, data } = this;
    const anchors = new Map(data.world.countries.map((c) => [c.code, c]));
    const countries = data.countries.filter((c) => !data.brokenFlags.has(c.code));
    const canTap = (code) => {
      const country = this.index.get(code);
      return Boolean(country && anchors.has(code) && reachesView(viewFor(country.continent), anchors.get(code)));
    };
    const questions = buildTrip({ countries, continent, levelId, progress: this.#progress, rng: services.rng, canTap });
    return { levelId, continent, questions, index: 0, results: [], startProgress: this.#progress };
  }

  // ------------------------------------------------------------------ DOM

  #build() {
    const { services, data } = this;
    const q = this.#question;
    const isMap = q.type === 'map';
    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'question', label: 'Question' }, { id: 'correct', label: 'Right' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('question', `${this.#trip.index + 1}/${TRIP_LENGTH}`);
    this.#hud.setStat('correct', this.#trip.results.filter((r) => r.correct).length);

    this.#map = createWorldMap({
      world: data.world,
      label: isMap ? `Map of ${this.#country.continent}. Tap ${this.#country.name}.` : `Map of ${this.#country.continent}. Countries you have explored are coloured in.`,
      onTap: isMap ? (code) => this.#onMapTap(code) : undefined,
    });
    this.#statusEl = el('p', { class: 'trip__status', attrs: { role: 'status' } });
    this.#afterEl = el('div', { class: 'trip__after' });
    this.#announcer = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });

    this.#optionsEl = el('div', { class: 'trip__options', attrs: { role: 'group', 'aria-label': 'Answers. Keys 1 to 4' } });
    this.#renderOptions();
    // On a map question the buttons are a fallback: hidden until asked for (a keyboard or screen reader cannot tap a map).
    let fallback = null;
    if (isMap) {
      this.#optionsEl.hidden = true;
      fallback = createButton({ label: 'Choose from a list instead', icon: '📋', onClick: () => { this.#optionsEl.hidden = false; fallback.hidden = true; this.#optionEls[0]?.focus(); } });
    }

    // The question, the map and the answers are separate blocks so the stylesheet can put the question above the map on a
    // phone (a child must read what to tap before looking for it) and the answers right under a flag question.
    this.#fallbackEl = fallback;
    this.ui.append(this.#hud.el, el('main', { class: `trip${isMap ? ' trip--map' : ''}` },
      el('section', { class: 'trip__ask' }, ...this.#promptNodes()),
      el('div', { class: 'trip__map' }, this.#map.el),
      el('section', { class: 'trip__answer' }, fallback, this.#optionsEl, this.#statusEl, this.#afterEl),
      this.#announcer));
    this.#map.setHome(viewFor(this.#country.continent));
    this.#map.setExplored(exploredCodes(this.#progress));
  }

  /** What the question says, and shows. */
  #promptNodes() {
    const { data } = this;
    const country = this.#country;
    switch (this.#question.type) {
      case 'flag':
        return [el('h2', { class: 'trip__prompt', text: 'Which country has this flag?' }),
          createFlag(country, { broken: data.brokenFlags, alt: 'The flag to identify', className: 'trip__flag' })];
      case 'capital':
        return [el('h2', { class: 'trip__prompt', text: `What is the capital of ${country.name}?` })];
      case 'capital-country': {
        const capital = country.capital[0];
        return [el('h2', { class: 'trip__prompt', text: `${capital} is the capital of which country?` })];
      }
      case 'map':
        return [el('h2', { class: 'trip__prompt', text: `Tap ${country.name} on the map.` }),
          el('p', { class: 'trip__help', text: 'Drag to move the map, pinch or use + and − to zoom.' })];
      default:
        throw new GameError('BAD_QUESTION', `Unknown question type "${this.#question.type}"`, { type: this.#question.type });
    }
  }

  #renderOptions() {
    this.#optionEls = this.#question.options.map((option, i) => el('button', {
      class: 'option', attrs: { type: 'button', 'aria-label': `${option.label}. Key ${i + 1}` },
      on: { click: (event) => { this.#pick(option.code); if (event.detail > 0) event.currentTarget.blur(); } },
    }, el('span', { class: 'option__key', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }), el('span', { class: 'option__label', text: option.label })));
    this.#optionsEl.replaceChildren(...this.#optionEls);
  }

  #announce(text) {
    this.#announcer.textContent = text;
  }

  // ----------------------------------------------------------------- input

  #onKey(event) {
    if (this.#answered || event.repeat || this.#optionsEl.hidden) return;
    if (/^[1-4]$/.test(event.key)) {
      const option = this.#question.options[Number(event.key) - 1];
      if (option) this.#pick(option.code);
    }
  }

  /** A tap on the map: only a country counts, so a tap on the sea or a drag that ended there costs nothing. */
  #onMapTap(code) {
    if (this.#answered) return;
    if (code === null) {
      this.#statusEl.textContent = 'That is not a country. Tap a country on the map.';
      return;
    }
    this.#pick(code);
  }

  #pick(code) {
    if (this.#answered) return;
    this.#answered = true;
    if (this.#fallbackEl) this.#fallbackEl.hidden = true;
    const correct = code === this.#question.code;
    const chosen = this.index.get(code);
    for (const [i, option] of this.#question.options.entries()) {
      const button = this.#optionEls[i];
      button.disabled = true;
      if (option.code === this.#question.code) button.classList.add('is-right');
      else if (option.code === code) button.classList.add('is-wrong');
    }
    if (correct) this.#onCorrect();
    else this.#onWrong(chosen);
    this.#offerNext(correct);
  }

  #onCorrect() {
    const { services, data } = this;
    const country = this.#country;
    this.#progress = recordCorrect(this.#progress, country.code);
    data.progress.save(this.#progress);
    services.audio.play('thunk');
    this.#hud.setStat('correct', this.#trip.results.filter((r) => r.correct).length + 1);
    this.#map.setExplored(exploredCodes(this.#progress));
    this.#map.highlight(country.code, country.name);
    this.#map.flyPlaneTo(country.code);
    const explored = this.#progress[country.code].explored;
    this.#statusEl.replaceChildren(
      el('p', { class: 'trip__right', html: `${ICONS.check} Correct! That is ${country.name}.` }),
      el('p', { class: 'trip__explored', text: explored ? `You have explored ${country.name}! A stamp is in your passport.` : `Answer once more about ${country.name} to explore it.` }));
    this.#afterEl.append(createStampCard(country, { broken: data.brokenFlags }));
    this.#announce(`Correct! ${country.name}. ${country.fact}`);
  }

  #onWrong(chosen) {
    const country = this.#country;
    this.services.audio.play('boop');
    this.#map.highlight(country.code, country.name);
    const said = this.#question.type === 'map' && chosen ? `That is ${chosen.name}. ` : '';
    const answer = this.#question.type === 'capital' ? `The capital of ${country.name} is ${country.capital.join(' or ')}.` : `The answer is ${country.name}.`;
    this.#statusEl.replaceChildren(el('p', { class: 'trip__wrong', html: `${ICONS.cross} ${said}${answer} It is on the map.` }));
    this.#announce(`Not quite. ${answer}`);
  }

  #offerNext(correct) {
    const { index, questions } = this.#trip;
    const last = index + 1 >= questions.length;
    const result = { code: this.#question.code, type: this.#question.type, correct };
    const shownAt = performance.now();
    const next = createButton({
      label: last ? 'See my trip' : 'Next question', icon: '▶', variant: 'primary', big: true,
      onClick: () => {
        // A map answer is given when the finger lifts, and the browser then delivers that same touch's click to whatever
        // is under the finger, which can now be this button. Ignoring clicks for a moment stops one tap answering and skipping.
        if (performance.now() - shownAt < NEXT_GUARD_MS) return;
        const trip = { ...this.#trip, index: index + 1, results: [...this.#trip.results, result] };
        if (last) this.routes.results(trip);
        else this.routes.next(trip);
      },
    });
    this.#afterEl.prepend(next);
    next.focus();
  }
}
