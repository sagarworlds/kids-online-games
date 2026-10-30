import { DetectiveScene } from './DetectiveScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { roundStars, rankFor, roundScore } from '../logic/scoring.js';
import { generateRound } from '../logic/generatorRegistry.js';
import { CASES_PER_ROUND } from '../logic/levels.js';
import { typeName } from '../ui/typeNames.js';

/** The badge for each rank. The word is always shown with it, so the rank never depends on the picture. */
const RANK_ICON = { Rookie: '🕵️', Sleuth: '🔎', Master: '🏅' };

/** Results: stars, the detective rank badge, and how each kind of case went. */
export class ResultScene extends DetectiveScene {
  /** @param {import('./DetectiveScene.js').Round} round */
  enter(round) {
    const { services } = this;
    const stars = roundStars(round.results);
    const rank = rankFor(stars);
    const firstTry = round.results.filter((r) => r.firstTry).length;
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, round.levelId, { stars, score: roundScore(round.results) });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const rows = round.results.map((r, i) => el('li', { class: `case-row${r.firstTry ? '' : ' is-retry'}` },
      el('span', { html: r.firstTry ? ICONS.check : ICONS.cross, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'case-row__name', text: `Case ${i + 1}: ${typeName(r.type)}` }),
      el('span', { class: 'case-row__note', text: r.firstTry ? 'first pick' : `${r.wrongPicks} wrong ${r.wrongPicks === 1 ? 'pick' : 'picks'}` })));

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great detective work, ${name}!` : `Good start, ${name}!` }),
      el('div', { class: 'badge', attrs: { role: 'img', 'aria-label': `Detective rank: ${rank}` } },
        el('span', { class: 'badge__icon', text: RANK_ICON[rank], attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'badge__rank', text: `${rank} Detective`, attrs: { 'aria-hidden': 'true' } })),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__solved', text: `You solved ${firstTry} of ${round.results.length} cases with your first pick.` }),
      el('ul', { class: 'cases' }, ...rows),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({
          levelId: round.levelId, puzzles: generateRound(round.levelId, CASES_PER_ROUND, services.rng), index: 0, results: [] }) }),
        createButton({ label: 'Change level', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
