import { FoodScene } from './FoodScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS } from '../logic/levels.js';
import { habitatScore } from '../logic/scoring.js';
import { withLearned } from '../logic/learned.js';
import { ROLE_LABELS } from '../ui/OrganismCard.js';

/** Results: stars, how it went, and the living things you learned about (they are remembered for the menu's count). */
export class ResultScene extends FoodScene {
  /** @param {import('./FoodScene.js').RoundResult} result */
  enter(result) {
    const { services, data } = this;
    const slug = services.game.slug;
    const { habitat } = result;
    const place = this.place(habitat.place);
    const { improvedStars, improvedScore } = services.rewards.recordRound(slug, habitat.id, { stars: result.stars, score: habitatScore(result.stars, result.whatIf?.correct ?? 0) });
    const known = data.organisms.map((o) => o.id);
    services.rewards.update(slug, (save) => { save.extra = withLearned(save.extra, habitat.organisms, known); });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(result.stars, services.rng);

    const lines = [
      result.wrongAtFirstCheck === 0 ? 'Every arrow was right the first time you checked.' : `${result.wrongAtFirstCheck} ${result.wrongAtFirstCheck === 1 ? 'arrow was' : 'arrows were'} wrong at your first check.`,
    ];
    if (result.whatIf) lines.push(`What if?: ${result.whatIf.correct} of ${result.whatIf.total} right.`);

    const nextIndex = (data.places.indexOf(place) + 1) % data.places.length;
    const nextHabitat = this.data.habitats.find((h) => h.place === data.places[nextIndex].id && h.level === habitat.level);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: result.stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!` }),
      el('p', { class: 'result__mode', text: `${place.name} · ${LEVELS[habitat.level].label}` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${result.stars} out of 3 stars` }, html: ICONS.star.repeat(result.stars) + ICONS.starEmpty.repeat(3 - result.stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('ul', { class: 'result__lines' }, ...lines.map((line) => el('li', { text: line }))),
      el('section', { class: 'learned', attrs: { 'aria-label': 'Living things you learned about' } },
        el('h2', { text: 'Living things you learned about' }),
        el('ul', { class: 'learned__list' }, ...habitat.organisms.map((id) => {
          const organism = data.lookup.get(id);
          return el('li', { class: 'learned__item' },
            el('span', { class: 'learned__icon', text: organism.icon, attrs: { 'aria-hidden': 'true' } }),
            el('span', {}, el('strong', { text: organism.name }), ` · ${ROLE_LABELS[organism.role]}`));
        }))),
      el('div', { class: 'result__actions' },
        createButton({ label: `Next: ${data.places[nextIndex].name}`, icon: '➡️', variant: 'primary', big: true, onClick: () => this.routes.build({ habitatId: nextHabitat.id }) }),
        createButton({ label: 'Play again', icon: '↻', onClick: () => this.routes.build({ habitatId: habitat.id }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (result.stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(result.stars === 3 ? 'cheer' : 'chime');
  }
}
