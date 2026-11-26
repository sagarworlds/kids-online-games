import { TowerBase } from './TowerBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { levelOfFloor, isFloor, floorKey, ladderKey, isFloorOpen, CLEAR_STARS, FLOORS } from '../logic/levels.js';
import { trickFor } from '../logic/splits.js';

const starsHtml = (n) => ICONS.star.repeat(n) + ICONS.starEmpty.repeat(3 - n);

/** One floor: learn the table, practise it on the ladder, then take the Challenge. */
export class FloorScene extends TowerBase {
  /** @param {{ floor: number }} params */
  enter({ floor }) {
    const { services } = this;
    if (!isFloor(floor)) throw new GameError('BAD_FLOOR', `There is no floor ${floor}`, { floor });
    if (!isFloorOpen(floor, this.cleared())) throw new GameError('FLOOR_LOCKED', `Floor ${floor} is not open yet`, { floor });
    const level = levelOfFloor(floor);
    const { bestStars } = this.save;
    const challengeStars = bestStars[floorKey(floor)] ?? 0;
    const ladderStars = bestStars[ladderKey(floor)] ?? 0;
    const trick = trickFor(floor);
    const next = floor < FLOORS && floor < level.lastFloor ? floor + 1 : null;

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const card = (icon, title, text, stars, onClick) => el('button', { class: 'activity', attrs: { type: 'button' }, on: { click: () => { services.audio.play('click'); onClick(); } } },
      el('span', { class: 'activity__icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'activity__title', text: title }),
      el('span', { class: 'activity__text', text }),
      stars === null ? null : el('span', { class: 'menu__stars', html: starsHtml(stars), attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` } }));

    this.ui.append(hud.el, el('div', { class: 'floorpage' },
      el('h1', { class: 'menu__title', text: `Floor ${floor}` }),
      el('p', { class: 'menu__intro', text: `The ${floor} times table, ${level.label} level.${trick ? ' This floor has a trick card!' : ''}` }),
      el('div', { class: 'activities' },
        card('📖', 'Learn', 'See the jumps and how to split the sum.', null, () => this.routes.learn(floor)),
        card('🪜', 'Practice', 'Fill the ladder, one rung at a time.', ladderStars, () => this.routes.ladder(floor)),
        card('⏱️', 'Challenge', `${level.questions} questions against the clock.`, challengeStars, () => this.routes.quiz({ mode: 'challenge', floor, levelId: level.id }))),
      el('p', { class: 'floorpage__goal', text: challengeStars >= CLEAR_STARS
        ? `Floor ${floor} is cleared!${next ? ` Floor ${next} is open.` : ''}`
        : `Get ${CLEAR_STARS} stars in the Challenge to clear this floor${next ? ` and open floor ${next}` : ''}.` }),
      el('div', { class: 'result__actions' }, createButton({ label: 'Back to the tower', icon: '🗼', onClick: () => this.routes.menu() }))));
  }
}
