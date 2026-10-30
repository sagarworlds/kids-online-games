import { HopScene } from './HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, MODES, levelKey } from '../logic/levels.js';
import { rankFor, RANKS } from '../logic/scoring.js';

/** Results: stars, how the round went, and your space rank (a new rank earns a badge). Every mode ends here. */
export class ResultScene extends HopScene {
  /** @param {import('./HopScene.js').RoundResult} result */
  enter(result) {
    const { services } = this;
    const slug = services.game.slug;
    const { improvedStars, improvedScore } = services.rewards.recordRound(slug, levelKey(result.mode, result.levelId), { stars: result.stars, score: result.score });
    const { rank, next, starsToNext } = rankFor(services.rewards.starsFor(slug));
    const newRank = rank !== RANKS[0] && services.rewards.awardBadge(slug, rank.id);
    const name = services.profile.getProfile().name;
    const praise = praiseFor(result.stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: result.stars >= 2 ? `Great flying, ${name}!` : `Nice flying, ${name}!` }),
      el('p', { class: 'result__mode', text: `${MODES[result.mode].label} · ${LEVELS[result.levelId].label}` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${result.stars} out of 3 stars` }, html: ICONS.star.repeat(result.stars) + ICONS.starEmpty.repeat(3 - result.stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('ul', { class: 'result__lines' }, ...result.lines.map((line) => el('li', { text: line }))),
      el('section', { class: 'rank', attrs: { 'aria-label': 'Your space rank' } },
        el('p', { class: 'rank__badge' }, el('span', { text: '🧑‍🚀', attrs: { 'aria-hidden': 'true' } }), el('strong', { text: ` ${rank.label}` })),
        el('p', { class: 'rank__next', text: newRank ? `New rank! You are now ${rank.label}.` : next ? `${starsToNext} more ${starsToNext === 1 ? 'star' : 'stars'} to become ${next.label}.` : 'You are a Commander: the top rank!' })),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({ mode: result.mode, levelId: result.levelId }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (result.stars === 3 || newRank) launchConfetti({ rng: services.rng });
    services.audio.play(result.stars === 3 ? 'cheer' : 'chime');
  }
}
