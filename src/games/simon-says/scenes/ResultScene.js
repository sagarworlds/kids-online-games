import { SimonScene } from './SimonScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { getLevel, saveKey } from '../logic/levels.js';
import { starsFor } from '../logic/scoring.js';

/** Results: longest sequence, your personal best for this level and mode, and stars. Saves on entry. */
export class ResultScene extends SimonScene {
  /** @param {{ levelId: 'easy'|'medium'|'hard', mode: 'classic'|'reverse', longest: number }} params */
  enter({ levelId, mode, longest }) {
    const { services } = this;
    const level = getLevel(levelId);
    const key = saveKey(levelId, mode);
    const stars = starsFor(level, longest);
    const slug = services.game.slug;

    let previousBest = 0;
    services.rewards.update(slug, (save) => {
      const bests = save.extra.bestLength && typeof save.extra.bestLength === 'object' ? save.extra.bestLength : {};
      previousBest = bests[key] ?? 0;
      bests[key] = Math.max(previousBest, longest);
      save.extra.bestLength = bests;
    });
    services.rewards.recordRound(slug, key, { stars, score: longest });
    const newBest = longest > previousBest;
    const name = services.profile.getProfile().name;

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Good try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: newBest && longest > 0 ? `${praiseFor(stars, services.rng)} New personal best!` : praiseFor(stars, services.rng) }),
      el('dl', { class: 'result__stats' },
        el('div', { class: 'result__stat' }, el('dt', { text: 'Longest' }), el('dd', { text: String(longest) })),
        el('div', { class: 'result__stat' }, el('dt', { text: 'Personal best' }), el('dd', { text: String(Math.max(previousBest, longest)) })),
        el('div', { class: 'result__stat' }, el('dt', { text: 'Level' }), el('dd', { text: `${level.label}${mode === 'reverse' ? ' · Reverse' : ''}` }))),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({ levelId, mode }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
