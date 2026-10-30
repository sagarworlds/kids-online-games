import { QuestScene } from './QuestScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { tripStars, tripScore } from '../logic/scoring.js';
import { newlyExplored } from '../logic/progress.js';
import { createStampCard } from '../ui/StampCard.js';

/** Results of a trip: stars, and the new stamps in the passport. */
export class TripResultScene extends QuestScene {
  /** @param {import('./QuestScene.js').Trip} trip */
  enter(trip) {
    const { services, data } = this;
    const correct = trip.results.filter((r) => r.correct).length;
    const stars = tripStars(correct);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, trip.levelId, { stars, score: tripScore(correct) });
    const progress = data.progress.load();
    const stamps = newlyExplored(trip.startProgress, progress).map((code) => this.index.get(code)).filter(Boolean);
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great trip, ${name}!` : `Nice trip, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__correct', text: `${correct} of ${trip.results.length} answers right.` }),
      stamps.length
        ? el('section', { class: 'newstamps', attrs: { 'aria-label': 'New passport stamps' } },
          el('h2', { text: `New passport stamps (${stamps.length})` }),
          el('div', { class: 'stamps' }, ...stamps.map((c) => createStampCard(c, { broken: data.brokenFlags, showFact: false }))))
        : el('p', { class: 'result__nostamps', text: 'No new stamps this time. A country is explored after two right answers about it.' }),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Another trip', icon: '✈️', variant: 'primary', big: true, onClick: () => this.routes.play({ levelId: trip.levelId, continent: trip.continent }) }),
        createButton({ label: 'Passport', icon: '📘', onClick: () => this.routes.passport() }),
        createButton({ label: 'World map', icon: '🌍', onClick: () => this.routes.hub() }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
