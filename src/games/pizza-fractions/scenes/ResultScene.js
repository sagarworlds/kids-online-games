import { PizzaScene } from './PizzaScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { roundStars } from '../logic/scoring.js';
import { generateRound } from '../logic/orderGenerator.js';
import { CUSTOMERS_PER_ROUND } from '../logic/levels.js';

const STATUS_NOTE = { first: 'first try', retry: 'after a retry', failed: 'not served' };

/** Results: stars, coins earned, and every order with a tick or a cross. */
export class ResultScene extends PizzaScene {
  /** @param {import('./PizzaScene.js').Round} round */
  enter(round) {
    const { services } = this;
    const stars = roundStars(round.results.map((r) => r.status));
    const coins = round.results.reduce((sum, r) => sum + r.coins, 0);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, round.levelId, { stars, score: coins });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const rows = round.results.map((r) => {
      const ok = r.status !== 'failed';
      return el('tr', { class: ok ? 'is-ok' : 'is-bad' },
        el('th', { text: r.customer, attrs: { scope: 'row' } }),
        el('td', { text: r.summary }),
        el('td', { class: 'results__mark' },
          el('span', { html: ok ? ICONS.check : ICONS.cross, attrs: { 'aria-hidden': 'true' } }),
          el('span', { text: ` ${STATUS_NOTE[r.status]}` })),
        el('td', { text: `${r.coins} coins${r.bonus === true ? ' (with bonus)' : ''}` }));
    });

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__coins', text: `🪙 ${coins} coins earned` }),
      el('table', { class: 'results' }, el('tbody', {}, ...rows)),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({
          levelId: round.levelId, orders: generateRound(round.levelId, CUSTOMERS_PER_ROUND, services.rng), index: 0, results: [] }) }),
        createButton({ label: 'Change level', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
