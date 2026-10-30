import { RobotScene } from './RobotScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { levelKey } from '../logic/levels.js';
import { levelStatus, summarise, worldForLock } from '../logic/progress.js';

/**
 * Level map: three worlds of ten levels, with the stars earned on each.
 * A level opens once the one before it has a star; a grown-up difficulty
 * lock narrows the map to a single world.
 */
export class MapScene extends RobotScene {
  enter() {
    const { services, data } = this;
    const lockedWorld = worldForLock(services.settings.difficultyLock);
    const { bestStars } = services.rewards.getSave(services.game.slug);
    const totals = summarise(data.levels, bestStars);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const message = el('p', { class: 'message', attrs: { role: 'status' } });

    const sections = data.worlds
      .filter((world) => lockedWorld === null || world.id === lockedWorld)
      .map((world) => {
        const buttons = data.levels.filter((l) => l.world === world.id).map((level) => {
          const status = levelStatus(data.levels, level.id, bestStars, lockedWorld);
          const stars = bestStars[levelKey(level.id)] ?? 0;
          const open = status === 'open';
          const label = open
            ? `Level ${level.id}, ${level.title}, ${stars} of 3 stars`
            : `Level ${level.id}, ${level.title}, locked`;
          return el('li', {}, el('button', {
            class: `levelbtn${open ? '' : ' is-locked'}`,
            attrs: { type: 'button', 'aria-label': label, 'aria-disabled': String(!open), 'data-level': level.id, 'data-stars': stars },
            on: {
              click: () => {
                if (open) this.routes.puzzle({ levelId: level.id });
                else message.textContent = 'Finish the level before this one to unlock it.';
              },
            },
          },
          el('span', { class: 'levelbtn__num', text: String(level.id) }),
          el('span', { class: 'levelbtn__title', text: level.title }),
          open
            ? el('span', { class: 'levelbtn__stars', html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) })
            : el('span', { class: 'levelbtn__lock', text: '🔒', attrs: { 'aria-hidden': 'true' } })));
        });
        return el('section', { class: 'world', attrs: { 'aria-labelledby': `world-${world.id}` } },
          el('h2', { text: `World ${world.id}: ${world.name}`, attrs: { id: `world-${world.id}` } }),
          el('p', { class: 'world__blurb', text: world.blurb }),
          el('ul', { class: 'levels' }, ...buttons));
      });

    const main = el('main', { class: 'map' },
      el('h1', { text: 'Robot Path' }),
      el('p', { class: 'map__summary', text: `${totals.stars} of ${totals.maxStars} stars · ${totals.completed} of ${data.levels.length} levels done` }),
      lockedWorld !== null ? el('p', { class: 'lock-note', text: `🔒 A grown-up has set this to World ${lockedWorld}.` }) : null,
      message,
      ...sections);
    this.ui.append(hud.el, main);

    // Put keyboard focus on the level the child most likely wants next.
    const next = this.ui.querySelector('.levelbtn[aria-disabled="false"][data-stars="0"]') ?? this.ui.querySelector('.levelbtn[aria-disabled="false"]');
    next?.focus();
  }
}
