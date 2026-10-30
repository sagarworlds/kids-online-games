import { TrainScene } from './TrainScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { roundStars, mistakeTotals, roundScore } from '../logic/scoring.js';
import { sentencesFor, pickSentences } from '../logic/sentences.js';
import { getLevel, HINTS_PER_ROUND } from '../logic/levels.js';

const STATUS_NOTE = { first: 'first whistle', retry: 'after a retry', failed: 'answer shown' };

/** Results: stars, the sentences built, and the mistakes by type (order, punctuation, extra word). */
export class ResultScene extends TrainScene {
  /** @param {import('./TrainScene.js').Round} round */
  enter(round) {
    const { services, data } = this;
    const level = getLevel(round.levelId);
    const stars = roundStars(round.results);
    const totals = mistakeTotals(round.results);
    const firstTry = round.results.filter((r) => r.status === 'first').length;
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, round.levelId, { stars, score: roundScore(round.results) });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const rows = round.results.map((r) => {
      const ok = r.status !== 'failed';
      return el('li', { class: `sentence-row${ok ? '' : ' is-bad'}` },
        el('span', { html: ok ? ICONS.check : ICONS.cross, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'sentence-row__text', text: r.text }),
        el('span', { class: 'sentence-row__note', text: STATUS_NOTE[r.status] }));
    });
    const mistakeRows = [['Word order', totals.order], ['Capital letter and punctuation', totals.punctuation]];
    if (level.distractor) mistakeRows.push(['Extra word on the track', totals.extra]);

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great sentences, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__built', text: `You built ${round.results.length} sentences. ${firstTry} on the first whistle.` }),
      el('section', { class: 'mistakes', attrs: { 'aria-label': 'Mistakes by type' } },
        el('h2', { text: 'Mistakes' }),
        el('ul', {}, ...mistakeRows.map(([label, count]) => el('li', {}, el('span', { text: label }), el('strong', { text: String(count) }))))),
      el('ul', { class: 'sentences' }, ...rows),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({
          levelId: round.levelId, entries: pickSentences(sentencesFor(data, round.levelId), services.rng), index: 0, results: [], hintsLeft: HINTS_PER_ROUND }) }),
        createButton({ label: 'Change level', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
