/**
 * Services every scene receives through its constructor (Dependency Inversion:
 * scenes talk to these abstractions and `main.js` decides the concrete classes).
 *
 * @typedef {{
 *   scenes: import('./SceneManager.js').SceneManager,
 *   input: import('./services/InputService.js').InputService,
 *   audio: import('./services/AudioService.js').AudioService,
 *   storage: import('./services/StorageService.js').StorageService,
 *   settings: import('./services/SettingsService.js').SettingsService,
 *   rewards: import('./services/RewardService.js').RewardService,
 *   speech: import('./services/SpeechService.js').SpeechService,
 *   profile: { getProfile(): { name: string, avatar: string } },
 *   rng: () => number,
 *   openSettings: () => Promise<void>,
 *   game: { slug: string, title: string, homeHref: string }
 * }} Services
 */

/**
 * Base class for every screen. Subclasses override only the hooks they need,
 * so new behaviour is added by extension and the engine never changes.
 *
 * Lifecycle: `enter` -> (`pause` <-> `resume`)* -> `exit`.
 * DOM scenes build their UI inside `this.ui`; canvas scenes also draw in `render`.
 */
export class Scene {
  /**
   * The scene's DOM container. Assigned by the SceneManager before `enter`
   * and removed again after `exit`.
   * @type {HTMLElement|null}
   */
  ui = null;

  /** @param {Services} services */
  constructor(services) {
    this.services = services;
  }

  /**
   * Called once when the scene becomes active.
   * @param {Record<string, unknown>} [params] Data passed by whoever opened it.
   */
  enter(params) {}

  /** Called once when the scene is removed. Release listeners and timers here. */
  exit() {}

  /** Called when another scene is pushed on top of this one. */
  pause() {}

  /** Called when the scene above this one is popped. */
  resume() {}

  /** @param {number} dt Seconds since the previous frame (at most 0.05). */
  update(dt) {}

  /** @param {CanvasRenderingContext2D|null} ctx Null in DOM-only games. */
  render(ctx) {}

  /**
   * Called on enter and whenever the play area changes size (resize, rotate).
   * @param {number} width CSS pixels.
   * @param {number} height CSS pixels.
   */
  resize(width, height) {}
}
