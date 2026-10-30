import { GameError } from './utils/errors.js';

/**
 * Holds the scene stack and runs transitions. Only the top scene is updated
 * and drawn; scenes underneath are paused and hidden until revealed again.
 */
export class SceneManager {
  /** @type {import('./Scene.js').Scene[]} */
  #stack = [];
  #uiRoot;
  #size = { width: 0, height: 0 };

  /**
   * @param {{ uiRoot?: HTMLElement|null }} [options] Element that holds scene
   *   containers. Omit in unit tests that have no DOM.
   */
  constructor({ uiRoot = null } = {}) {
    this.#uiRoot = uiRoot;
  }

  /** @returns {import('./Scene.js').Scene|null} The active scene. */
  get current() {
    return this.#stack.at(-1) ?? null;
  }

  /** @returns {number} */
  get depth() {
    return this.#stack.length;
  }

  /**
   * Puts a scene on top. The previous scene is paused, not destroyed.
   * @param {import('./Scene.js').Scene} scene
   * @param {Record<string, unknown>} [params]
   */
  push(scene, params) {
    const below = this.current;
    if (below) {
      below.pause();
      if (below.ui) below.ui.hidden = true;
    }
    this.#stack.push(scene);
    this.#open(scene, params);
  }

  /**
   * Removes the top scene and resumes the one below it.
   * @throws {GameError} With code 'EMPTY_STACK' if nothing is on the stack.
   */
  pop() {
    const top = this.#stack.pop();
    if (!top) throw new GameError('EMPTY_STACK', 'SceneManager.pop: no scene to pop');
    this.#close(top);
    const below = this.current;
    if (below) {
      if (below.ui) below.ui.hidden = false;
      below.resume();
      below.resize(this.#size.width, this.#size.height);
    }
  }

  /**
   * Swaps the top scene for another (the normal way to move Menu -> Play -> Results).
   * @param {import('./Scene.js').Scene} scene
   * @param {Record<string, unknown>} [params]
   */
  replace(scene, params) {
    const top = this.#stack.pop();
    if (top) this.#close(top);
    this.#stack.push(scene);
    this.#open(scene, params);
  }

  /** Exits every scene, top first. */
  clear() {
    while (this.#stack.length) this.#close(this.#stack.pop());
  }

  /** @param {number} dt */
  update(dt) {
    this.current?.update(dt);
  }

  /** @param {CanvasRenderingContext2D|null} ctx */
  render(ctx) {
    this.current?.render(ctx);
  }

  /**
   * Remembers the play-area size and forwards it to the active scene.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.#size = { width, height };
    this.current?.resize(width, height);
  }

  #open(scene, params) {
    if (this.#uiRoot) {
      const container = this.#uiRoot.ownerDocument.createElement('div');
      container.className = 'scene';
      this.#uiRoot.append(container);
      scene.ui = container;
    }
    scene.enter(params);
    scene.resize(this.#size.width, this.#size.height);
  }

  #close(scene) {
    try {
      scene.exit();
    } finally {
      // Always remove the DOM, even if exit() throws, so nothing is left on screen.
      scene.ui?.remove();
      scene.ui = null;
    }
  }
}
