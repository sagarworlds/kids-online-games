import { LightsScene } from './LightsScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createViewToggle } from '../../../engine/three/ViewToggle.js';
import { LEVELS, LEVEL_IDS, PUZZLES_PER_ROUND } from '../logic/levels.js';

/** Menu: choose the grid size (the level), see your best stars, start a round of five puzzles. */
export class MenuScene extends LightsScene {
  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; },
    });

    const { bestStars } = services.rewards.getSave(services.game.slug);
    const best = el('ul', {}, ...LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
    }));

    // Only offered where the device can do 3D. The choice is remembered for next time (see `createViewChoice`).
    const { view } = this.routes;
    const viewEl = view.supported ? el('div', { class: 'menu__view' },
      createViewToggle({ mode: view.mode(), onChange: (next) => { view.choose(next); this.routes.menu(); } }),
      el('p', { class: 'menu__viewnote', text: view.mode() === '3d' ? 'In 3D view the jars stand on a table at night: turn it, and the fireflies fly away when you win.' : 'In 2D view the jars are a flat grid.' })) : null;

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Lights Out' }),
      el('p', { class: 'menu__intro', text: 'Tap a jar to flip it and the jars next to it. Set every firefly free by turning all the lights off!' }),
      picker.el,
      el('p', { class: 'menu__note', text: `${PUZZLES_PER_ROUND} puzzles per round. Fewer taps earn more stars.` }),
      viewEl,
      createButton({ label: 'Start', icon: '▶', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        this.routes.play({ levelId, index: 0, results: [] });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }
}
