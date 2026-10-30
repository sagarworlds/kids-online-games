import { LightsScene } from './LightsScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { roundStars } from '../logic/scoring.js';

/** Results after five puzzles: stars for the round, and moves against par for each puzzle. */
export class ResultScene extends LightsScene {
  /** @param {import('./LightsScene.js').Round} round */
  enter(round) {
    const { services } = this;
    const stars = roundStars(round.results.map((r) => r.stars));
    const score = round.results.reduce((sum, r) => sum + r.stars, 0);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, round.levelId, { stars, score });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const rows = round.results.map((r, i) => el('tr', {},
      el('th', { text: `Puzzle ${i + 1}`, attrs: { scope: 'row' } }),
      el('td', { text: `${r.moves} moves` }),
      el('td', { text: `par ${r.par}` }),
      el('td', { class: 'results__stars', html: ICONS.star.repeat(r.stars) + ICONS.starEmpty.repeat(3 - r.stars), attrs: { 'aria-label': `${r.stars} stars` } })));

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('table', { class: 'results' }, el('tbody', {}, ...rows)),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({ levelId: round.levelId, index: 0, results: [] }) }),
        createButton({ label: 'Change size', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
