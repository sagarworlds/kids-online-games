import { TraceBase } from './TraceBase.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, roundKey, roundStars } from '../logic/levels.js';
import { SETS } from '../logic/glyphs/index.js';

/** Results: stars for the round, and each glyph with its own stars. */
export class ResultScene extends TraceBase {
  /** @param {import('./TraceBase.js').RoundResult} result */
  enter({ setId, levelId, results }) {
    const { services } = this;
    const stars = Math.max(1, roundStars(results));
    const points = results.reduce((sum, r) => sum + Math.round(r.score * 100), 0);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, roundKey(setId), { stars, score: points });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);
    const rows = results.map((r) => el('li', { class: 'glyphrow' },
      el('span', { class: 'glyphrow__char', text: r.char }),
      el('span', { class: 'glyphrow__note', text: r.mistakes > 0 ? `${r.mistakes} wrong ${r.mistakes === 1 ? 'start' : 'starts'}` : r.score === 0 ? 'skipped' : 'neat' }),
      el('span', { class: 'glyphrow__stars', html: ICONS.star.repeat(r.stars) + ICONS.starEmpty.repeat(3 - r.stars), attrs: { role: 'img', 'aria-label': `${r.stars} out of 3 stars` } })));

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars === 1 ? `Nice try, ${name}!` : `Lovely writing, ${name}!` }),
      el('p', { class: 'result__mode', text: `${SETS[setId].label} · ${LEVELS[levelId].label}` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      stars === 1 ? el('p', { class: 'result__tip', text: 'Tip: go slowly and keep your pencil on the dots. The snail only moves when you are on the path.' }) : null,
      el('div', { class: 'trace__actions' },
        createButton({ label: 'Play again', icon: '✏️', variant: 'primary', big: true, onClick: () => this.routes.trace({ setId, levelId }) }),
        createButton({ label: 'Worksheet', icon: '🖨️', onClick: () => this.routes.worksheet(setId) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() })),
      el('section', { class: 'glyphs', attrs: { 'aria-label': 'Your writing' } }, el('h2', { text: 'What you wrote' }), el('ul', { class: 'glyphs__list' }, ...rows))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
