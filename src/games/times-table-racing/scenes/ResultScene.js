import { RacingScene } from './RacingScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { ghostFinishMs } from '../logic/ghost.js';
import { starsForRace, ghostDifference, formatTime, formatSeconds, heatFor, raceScore } from '../logic/scoring.js';
import { tablesKey, withRaceResult } from '../logic/saveData.js';
import { getLevel } from '../logic/levels.js';

const HEAT_LABEL = { strong: 'Strong', ok: 'Nearly', practise: 'Practise' };
const HEAT_ICON = { strong: ICONS.check, ok: '', practise: ICONS.cross };

/** Results: time, how it compares with the ghost, stars, and how each table went. Also saves the best run. */
export class ResultScene extends RacingScene {
  /** @param {import('./RacingScene.js').RaceOutcome} outcome */
  enter(outcome) {
    const { services } = this;
    const { levelId, tables, summary, ghost } = outcome;
    const level = getLevel(levelId);
    const table = tablesKey(tables, level);

    const ghostMs = ghostFinishMs(ghost.run);
    const diff = ghostDifference(summary.finishMs, ghostMs);
    const stars = starsForRace(summary.finishMs, ghostMs);

    // Save the ghost (if this was the best run for this level and table choice) and the new fact weights.
    const slug = services.game.slug;
    const { extra, newBest } = withRaceResult(services.rewards.getSave(slug).extra, {
      levelId, table, run: { table, times: summary.times }, weights: summary.weights,
    });
    services.rewards.update(slug, (save) => { save.extra = extra; });
    const { improvedStars, improvedScore } = services.rewards.recordRound(slug, levelId, { stars, score: raceScore(summary.firstTry) });

    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);
    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });

    const against = ghost.isDefault ? 'the starter ghost' : 'your best run';
    const ghostLine = diff < 0
      ? `${formatSeconds(diff)} ahead of ${against}!`
      : diff === 0 ? `Exactly level with ${against}.` : `${formatSeconds(diff)} behind ${against}.`;

    const strip = el('ul', { class: 'heat', attrs: { 'aria-label': 'How each table went' } },
      ...Object.keys(summary.perTable).map(Number).sort((a, b) => a - b).map((t) => {
        const stats = summary.perTable[t];
        const heat = heatFor(stats);
        return el('li', { class: `heat__cell heat__cell--${heat}`, attrs: { 'aria-label': `${t} times table: ${stats.correct} of ${stats.asked} right first time. ${HEAT_LABEL[heat]}.` } },
          el('span', { class: 'heat__table', text: `${t}×`, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'heat__score', text: `${stats.correct}/${stats.asked}`, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'heat__label', attrs: { 'aria-hidden': 'true' } }, el('span', { html: HEAT_ICON[heat] }), ` ${HEAT_LABEL[heat]}`));
      }));
    const toPractise = Object.keys(summary.perTable).map(Number).filter((t) => heatFor(summary.perTable[t]) === 'practise').sort((a, b) => a - b);

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great race, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore || newBest ? `${praise} New best!` : praise }),
      el('dl', { class: 'result__stats' },
        stat('Your time', formatTime(summary.finishMs)),
        stat('Ghost time', formatTime(ghostMs)),
        stat('Right first time', `${summary.firstTry} of ${summary.asked}`)),
      el('p', { class: 'result__ghost', text: ghostLine }),
      newBest && !ghost.isDefault ? el('p', { class: 'result__newbest', text: 'New best time! That is your ghost next time.' }) : null,
      newBest && ghost.isDefault ? el('p', { class: 'result__newbest', text: 'Your run is saved. Next time you will race your own ghost!' }) : null,
      el('h2', { class: 'result__heading', text: 'Your tables' }),
      strip,
      toPractise.length ? el('p', { class: 'result__tip', text: `Worth practising: the ${toPractise.map((t) => `${t}×`).join(', ')} table${toPractise.length > 1 ? 's' : ''}. They will come up more often.` }) : null,
      el('div', { class: 'result__actions' },
        createButton({ label: 'Race again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({ levelId, tables }) }),
        createButton({ label: 'Change tables', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}

function stat(label, value) {
  return el('div', { class: 'result__stat' }, el('dt', { text: label }), el('dd', { text: value }));
}
