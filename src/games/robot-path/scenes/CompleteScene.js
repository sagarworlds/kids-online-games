import { RobotScene } from './RobotScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { findLevel, levelKey } from '../logic/levels.js';
import { criteriaFor, starsFor } from '../logic/scoring.js';
import { nextLevelId, worldForLock } from '../logic/progress.js';

/**
 * "Level complete": stars, which star each goal earned, and blocks used vs
 * your best. Saves the result once, on entry.
 */
export class CompleteScene extends RobotScene {
  /** @param {{ levelId: number, result: { blocks: number, collected: number, totalGems: number } }} params */
  enter({ levelId, result }) {
    const { services, data } = this;
    const level = findLevel(data.levels, levelId);
    const slug = services.game.slug;
    const key = levelKey(level.id);

    const run = { reachedGoal: true, blocks: result.blocks, par: level.par, collected: result.collected, totalGems: result.totalGems };
    const stars = starsFor(run);
    const criteria = criteriaFor(run);

    const { improvedStars } = services.rewards.recordRound(slug, key, { stars });
    let bestBlocks = result.blocks;
    services.rewards.update(slug, (save) => {
      const best = save.extra.bestBlocks && typeof save.extra.bestBlocks === 'object' ? save.extra.bestBlocks : {};
      bestBlocks = Math.min(result.blocks, best[key] ?? Infinity);
      best[key] = bestBlocks;
      save.extra.bestBlocks = best;
    });

    const name = services.profile.getProfile().name;
    const lockedWorld = worldForLock(services.settings.difficultyLock);
    const nextId = nextLevelId(data.levels, level.id, lockedWorld);
    const nextLevel = nextId === null ? null : findLevel(data.levels, nextId);
    const finishedWorld = nextLevel && nextLevel.world !== level.world ? data.worlds.find((w) => w.id === level.world) : null;

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const starRow = el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` } },
      ...[1, 2, 3].map((n) => el('span', {
        class: n <= stars ? 'pop-in' : '',
        style: { 'animation-delay': `${n * 0.18}s` },
        html: n <= stars ? ICONS.star : ICONS.starEmpty,
      })));

    const describe = {
      goal: () => 'Reached the battery',
      par: () => `Used ${level.par} blocks or fewer (you used ${result.blocks})`,
      gems: () => `Collected every gem (${result.collected} of ${result.totalGems})`,
    };
    const checklist = el('ul', { class: 'criteria' }, ...criteria.filter((c) => c.applicable).map((c) =>
      el('li', { class: c.met ? 'is-met' : 'is-missed' },
        el('span', { class: 'criteria__mark', text: c.met ? '✔' : '✖', attrs: { 'aria-hidden': 'true' } }),
        el('span', { text: `${c.met ? '' : 'Not yet: '}${describe[c.id]()}` }))));

    const main = el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Nice work, ${name}!` }),
      el('p', { class: 'result__level', text: `Level ${level.id}: ${level.title}` }),
      starRow,
      el('p', { class: 'result__praise', text: improvedStars ? `${praiseFor(stars, services.rng)} New best!` : praiseFor(stars, services.rng) }),
      checklist,
      el('p', { class: 'result__blocks', text: `You used ${result.blocks} blocks. Your best is ${bestBlocks}.` }),
      finishedWorld ? el('p', { class: 'result__world', text: `You finished the ${finishedWorld.name}! A new world is open.` }) : null,
      nextId === null && lockedWorld === null ? el('p', { class: 'result__world', text: 'You finished every level. Amazing!' }) : null,
      el('div', { class: 'result__actions' },
        nextId !== null ? createButton({ label: 'Next level', icon: '▶', variant: 'primary', big: true, onClick: () => this.routes.puzzle({ levelId: nextId }) }) : null,
        createButton({ label: 'Play again', icon: '↻', onClick: () => this.routes.puzzle({ levelId: level.id }) }),
        createButton({ label: 'Level map', onClick: () => this.routes.map() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref })));

    this.ui.append(hud.el, main);
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
    main.querySelector('.btn--primary')?.focus();
  }
}
