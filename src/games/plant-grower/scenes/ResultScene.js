import { PlantScene } from './PlantScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, roundKey } from '../logic/levels.js';
import { starsForHealth, roundScore, GROW_AT } from '../logic/simulation.js';
import { WEATHER } from '../logic/weather.js';
import { explainDay, NEED_LABELS } from '../logic/messages.js';
import { createPlantArt } from '../ui/PlantArt.js';

/** Results: stars, the grown plant, and the plant journal: one entry for each day, with a drawing and the reason. */
export class ResultScene extends PlantScene {
  /** @param {import('./PlantScene.js').RoundResult} result */
  enter({ plant, levelId, state }) {
    const { services } = this;
    const stars = starsForHealth(state.health);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, roundKey(plant.id, levelId), { stars, score: roundScore(state) });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const art = createPlantArt(plant, { size: 180, label: `Your ${plant.name.toLowerCase()} at the end: ${plant.stages[state.stage].toLowerCase()}` });
    const last = state.history.at(-1);
    art.update({ stage: state.stage, mood: state.health < 30 ? 'wilting' : state.health >= GROW_AT ? 'happy' : 'ok' });

    const journal = state.history.map((log) => {
      const picture = createPlantArt(plant, { size: 80 });
      picture.update({ stage: log.stage, mood: log.wilting ? 'wilting' : log.health >= GROW_AT ? 'happy' : 'ok' }, { animate: false });
      const change = log.healthChange;
      const sign = change > 0 ? `▲ +${change}` : change < 0 ? `▼ ${change}` : '＝ 0';
      return el('li', { class: 'entry' },
        el('div', { class: 'entry__art' }, picture.el),
        el('div', { class: 'entry__text' },
          el('h3', { class: 'entry__title', text: `Day ${log.day} · ${WEATHER[log.weather].icon} ${WEATHER[log.weather].label}` }),
          el('p', { class: 'entry__inputs', text: `You set: ${['water', 'sun', 'food'].map((n) => `${NEED_LABELS[n].toLowerCase()} ${log.inputs[n]}`).join(', ')}` }),
          el('p', { class: 'entry__change', text: `Health ${sign} to ${log.health}. ${plant.stages[log.stage]}${log.advanced ? ' (it grew)' : ''}.` }),
          el('ul', { class: 'entry__why' }, ...explainDay(log, plant).map((line) => el('li', { text: line })))));
    });

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars === 1 ? `Let's try again, ${name}!` : `Lovely gardening, ${name}!` }),
      el('p', { class: 'result__mode', text: `${plant.name} · ${LEVELS[levelId].label}` }),
      art.el,
      el('p', { class: 'result__plant', text: `Your ${plant.name.toLowerCase()} ended as: ${plant.stages[state.stage]}, with ${state.health} health.` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      stars === 1 ? el('p', { class: 'result__tip', text: `Read the journal to see what ${last ? 'it needed' : 'your plant needs'}, then try again with a new week.` }) : null,
      el('div', { class: 'result__actions' },
        createButton({ label: 'Grow again', icon: '🌱', variant: 'primary', big: true, onClick: () => this.routes.play({ plantId: plant.id, levelId }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref })),
      el('section', { class: 'journal', attrs: { 'aria-label': 'Plant journal' } },
        el('h2', { text: 'Plant journal' }),
        el('ol', { class: 'journal__list' }, ...journal))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
