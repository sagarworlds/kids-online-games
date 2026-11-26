import { QuestScene } from './QuestScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';

/**
 * Shown while the 3D globe is still loading on a slow connection, so the child sees the game instead of a blank page. It is
 * only put up if loading takes more than a moment, and the hub or trip replaces it.
 */
export class LoadingScene extends QuestScene {
  enter() {
    const { services } = this;
    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('div', { class: 'loading' }, el('p', { class: 'loading__text', text: '🌍 Getting the globe ready…', attrs: { role: 'status' } })));
  }
}
