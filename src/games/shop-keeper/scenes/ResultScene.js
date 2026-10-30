import { ShopKeeperScene } from './ShopKeeperScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { formatMoney } from '../logic/currency.js';
import { roundStars } from '../logic/scoring.js';
import { generateRound } from '../logic/saleGenerator.js';
import { CUSTOMERS_PER_ROUND } from '../logic/levels.js';

const STATUS_NOTE = { first: 'first try', retry: 'after a retry', failed: 'not right' };

/** Results: stars, "Perfect change" and "Smart change" counts, and every customer with a tick or a cross. */
export class ResultScene extends ShopKeeperScene {
  /** @param {import('./ShopKeeperScene.js').Round} round */
  enter(round) {
    const { services, data } = this;
    const { currency } = data;
    const money = (n) => formatMoney(n, currency);
    const perfect = round.results.filter((r) => r.status === 'first').length;
    const smart = round.results.filter((r) => r.smart).length;
    const score = round.results.reduce((total, r) => total + r.score, 0);
    const stars = roundStars(round.results.map((r) => r.status), smart);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, round.levelId, { stars, score });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const rows = round.results.map((r) => {
      const ok = r.status !== 'failed';
      return el('tr', { class: ok ? 'is-ok' : 'is-bad' },
        el('th', { text: r.customer, attrs: { scope: 'row' } }),
        el('td', { text: `${money(r.bill)} bill, paid ${money(r.paid)}` }),
        el('td', { text: r.changeDue > 0 ? `change ${money(r.changeDue)}` : 'no change' }),
        el('td', { class: 'results__mark' },
          el('span', { html: ok ? ICONS.check : ICONS.cross, attrs: { 'aria-hidden': 'true' } }),
          el('span', { text: ` ${STATUS_NOTE[r.status]}` })),
        el('td', { text: r.smart ? '★ Smart change' : r.fewest ? `${r.pieces} pieces (fewest ${r.fewest})` : '' }));
    });

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('ul', { class: 'result__counts' },
        el('li', { text: `Perfect change: ${perfect} of ${round.results.length}` }),
        el('li', { text: `Smart change: ${smart} of ${round.results.length}` }),
        el('li', { text: `Score: ${score}` })),
      el('table', { class: 'results' }, el('tbody', {}, ...rows)),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({
          levelId: round.levelId, sales: generateRound(round.levelId, CUSTOMERS_PER_ROUND, services.rng, data), index: 0, results: [] }) }),
        createButton({ label: 'Change level', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
