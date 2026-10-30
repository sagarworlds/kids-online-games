import { logError } from './utils/errors.js';

/**
 * Owns the loop and delegates every frame to the active scene.
 * It also keeps the optional canvas sharp on high-DPI screens and tells the
 * scenes when the play area changes size.
 */
export class Game {
  #root;
  #canvas;
  #ctx;
  #scenes;
  #loop;
  #onFatalError;
  #observer = null;
  #dpr = 1;
  #size = { width: 0, height: 0 };

  /**
   * @param {{
   *   root: HTMLElement,
   *   canvas?: HTMLCanvasElement|null,
   *   scenes: import('./SceneManager.js').SceneManager,
   *   loop: import('./GameLoop.js').GameLoop,
   *   onFatalError: (error: unknown) => void
   * }} deps `onFatalError` shows the friendly "Oops" screen.
   */
  constructor({ root, canvas = null, scenes, loop, onFatalError }) {
    this.#root = root;
    this.#canvas = canvas;
    this.#ctx = canvas ? canvas.getContext('2d') : null;
    this.#scenes = scenes;
    this.#loop = loop;
    this.#onFatalError = onFatalError;
  }

  /** @returns {{ width: number, height: number }} Play-area size in CSS pixels. */
  get size() {
    return { ...this.#size };
  }

  /** Measures the play area and starts the frame loop. */
  start() {
    this.#measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => this.#measure());
      this.#observer.observe(this.#root);
    } else {
      globalThis.addEventListener?.('resize', () => this.#measure());
    }
    this.#loop.start({
      update: (dt) => this.#scenes.update(dt),
      render: () => this.#render(),
      onError: (error) => this.fail(error),
    });
  }

  /** Stops the loop and the resize observer. */
  stop() {
    this.#loop.stop();
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /**
   * Stops everything and shows the error screen. Safe to call from anywhere
   * (frame errors, event handlers, unhandled promise rejections).
   * @param {unknown} error
   */
  fail(error) {
    logError(error, 'game');
    this.stop();
    try {
      this.#onFatalError(error);
    } catch (secondary) {
      logError(secondary, 'game:error-screen');
    }
  }

  #measure() {
    const rect = this.#root.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.#size = { width, height };
    if (this.#canvas) {
      // Cap the pixel ratio at 2: sharper than that costs speed on tablets for no visible gain.
      this.#dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      this.#canvas.width = Math.round(width * this.#dpr);
      this.#canvas.height = Math.round(height * this.#dpr);
      this.#canvas.style.width = `${width}px`;
      this.#canvas.style.height = `${height}px`;
    }
    try {
      this.#scenes.resize(width, height);
    } catch (error) {
      this.fail(error);
    }
  }

  #render() {
    if (!this.#ctx) {
      this.#scenes.render(null);
      return;
    }
    const ctx = this.#ctx;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.clearRect(0, 0, this.#size.width, this.#size.height);
    this.#scenes.render(ctx);
  }
}
