import { SpotBase } from './SpotBase.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, roundKey } from '../logic/levels.js';
import { roundStars } from '../logic/round.js';
import { countTypes, formatClock } from '../logic/labels.js';

/** Results: stars for the round, the time, and which kinds of difference you found. */
export class ResultScene extends SpotBase {
  /** @param {import('./SpotBase.js').RoundResult} result */
  enter({ themeId, levelId, results }) {
    const { services } = this;
    const stars = roundStars(results);
    const score = results.reduce((sum, r) => sum + r.score, 0);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, roundKey(themeId, levelId), { stars, score });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);
    const totalTime = results.reduce((sum, r) => sum + r.elapsed, 0);
    const totalMisses = results.reduce((sum, r) => sum + r.misses, 0);
    const kinds = countTypes(results.flatMap((r) => r.types));

    const rows = results.map((r, i) => el('li', { class: 'pic' },
      el('span', { class: 'pic__name', text: `Picture ${i + 1}` }),
      el('span', { class: 'pic__time', text: formatClock(r.elapsed) }),
      el('span', { class: 'pic__misses', text: r.misses === 0 ? 'No misses' : `${r.misses} ${r.misses === 1 ? 'miss' : 'misses'}` }),
      el('span', { class: 'pic__stars', html: ICONS.star.repeat(r.stars) + ICONS.starEmpty.repeat(3 - r.stars), attrs: { role: 'img', 'aria-label': `${r.stars} out of 3 stars` } })));

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars === 1 ? `Good looking, ${name}!` : `Sharp eyes, ${name}!` }),
      el('p', { class: 'result__mode', text: `${this.themeName(themeId)} · ${LEVELS[levelId].label}` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__summary', text: `Total time ${formatClock(totalTime)} · ${totalMisses} ${totalMisses === 1 ? 'miss' : 'misses'} · ${score} points` }),
      stars === 1 ? el('p', { class: 'result__tip', text: 'Tip: look at one thing at a time, and compare it with the same place in the other picture. Tapping where nothing is makes you wait a moment.' }) : null,
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '🔍', variant: 'primary', big: true, onClick: () => this.routes.play({ themeId, levelId }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref })),
      el('section', { class: 'found', attrs: { 'aria-label': 'Kinds of difference you found' } },
        el('h2', { text: 'What you spotted' }),
        el('ul', { class: 'found__list' }, ...kinds.map((k) => el('li', { class: 'kind' },
          el('span', { class: 'kind__icon', text: k.icon, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'kind__name', text: k.name }),
          el('span', { class: 'kind__count', text: `× ${k.count}` }))))),
      el('section', { class: 'pics', attrs: { 'aria-label': 'Your pictures' } },
        el('h2', { text: 'Your pictures' }),
        el('ol', { class: 'pics__list' }, ...rows))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
