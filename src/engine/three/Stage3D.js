import { WebGLRenderer, Scene as ThreeScene, PerspectiveCamera, Color, Raycaster, Vector2 } from './three.js';
import { GameError, logError } from '../utils/errors.js';
import { pickQuality } from './support.js';

/**
 * A ready-to-use 3D view inside a DOM element: renderer, scene, camera, sizing, picking and clean-up.
 * Every 3D scene builds on this, so the mobile rules (capped pixel ratio, no shadows, a lost graphics
 * context handled instead of a frozen picture) are written once.
 *
 * Typical use inside an engine Scene:
 *   enter()  -> this.stage = new Stage3D({ container, onContextLost: () => routes.play2d() })
 *   render() -> this.stage.render()
 *   exit()   -> this.stage.dispose()
 */
export class Stage3D {
  /** @type {import('./three.js').WebGLRenderer} */
  renderer;
  /** @type {import('./three.js').Scene} */
  scene;
  /** @type {import('./three.js').PerspectiveCamera} */
  camera;
  /** @type {import('./support.js').Quality} */
  quality;

  #container;
  #observer = null;
  #raycaster = new Raycaster();
  #pointer = new Vector2();
  #onContextLost;
  #handleLost;
  #disposed = false;
  #size = { width: 1, height: 1 };

  /**
   * @param {{
   *   container: HTMLElement,
   *   background?: string|number|null,
   *   fov?: number, near?: number, far?: number,
   *   quality?: import('./support.js').Quality,
   *   onContextLost?: () => void,
   *   label?: string
   * }} options `container` must have a size from CSS; the canvas fills it. `label` is read by screen
   *   readers in place of the picture. `onContextLost` should switch the game to its 2D version.
   * @throws {GameError} With code 'WEBGL_UNAVAILABLE' when the renderer cannot be created. Callers
   *   catch it and fall back to 2D.
   */
  constructor({ container, background = null, fov = 50, near = 0.1, far = 200, quality, onContextLost, label = '3D view' }) {
    this.#container = container;
    this.#onContextLost = onContextLost ?? (() => {});
    this.quality = quality ?? pickQuality({
      deviceMemory: globalThis.navigator?.deviceMemory,
      hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
      devicePixelRatio: globalThis.devicePixelRatio,
    });

    try {
      this.renderer = new WebGLRenderer({
        antialias: this.quality.antialias,
        alpha: background === null,
        // Phones should not spin up a second, hungrier GPU for a low-poly learning game.
        powerPreference: 'low-power',
      });
    } catch (cause) {
      throw new GameError('WEBGL_UNAVAILABLE', 'could not create a WebGL 2 renderer', { cause: String(cause) });
    }
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;

    const canvas = this.renderer.domElement;
    canvas.classList.add('stage3d__canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    // Without this the browser scrolls or zooms the page while a child drags inside the 3D view.
    canvas.style.touchAction = 'none';
    container.classList.add('stage3d');
    container.append(canvas);

    this.scene = new ThreeScene();
    if (background !== null) this.scene.background = new Color(background);
    this.camera = new PerspectiveCamera(fov, 1, near, far);

    this.#handleLost = (event) => {
      // preventDefault tells the browser we handle the loss ourselves instead of leaving a dead canvas.
      event.preventDefault();
      logError(new GameError('WEBGL_CONTEXT_LOST', 'the graphics context was lost'), 'stage3d');
      this.#onContextLost();
    };
    canvas.addEventListener('webglcontextlost', this.#handleLost);

    this.#fit();
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => this.#fit());
      this.#observer.observe(container);
    }
  }

  /** @returns {HTMLCanvasElement} The canvas, for pointer listeners and focus. */
  get canvas() {
    return this.renderer.domElement;
  }

  /** @returns {{ width: number, height: number }} View size in CSS pixels. */
  get size() {
    return { ...this.#size };
  }

  /** Draws one frame. Call it from the engine scene's `render()` hook. */
  render() {
    if (this.#disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Finds what is under a screen point, nearest first. Used for "tap the planet" style input.
   * @param {number} clientX Viewport x, as in a pointer event.
   * @param {number} clientY
   * @param {import('./three.js').Object3D[]} objects Candidates; their children are tested too.
   * @returns {import('./three.js').Intersection[]}
   */
  pick(clientX, clientY, objects) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];
    // Raycaster wants -1..1 with y pointing up; the browser gives pixels with y pointing down.
    this.#pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.#raycaster.setFromCamera(this.#pointer, this.camera);
    return this.#raycaster.intersectObjects(objects, true);
  }

  /** Frees GPU memory and listeners. Call from the engine scene's `exit()`; safe to call twice. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#observer?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.#handleLost);
    disposeObject(this.scene);
    this.renderer.dispose();
    this.canvas.remove();
    this.#container.classList.remove('stage3d');
  }

  #fit() {
    const rect = this.#container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.#size = { width, height };
    // `false`: sizes come from CSS (the canvas fills its container), so three must not set inline sizes.
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Frees the geometries, materials and textures of an object and everything under it.
 * three.js never frees GPU memory on its own; without this, replaying a level leaks until the tab dies.
 * @param {import('./three.js').Object3D} root
 */
export function disposeObject(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose();
      }
      material.dispose?.();
    }
  });
}
