import { WebGLRenderer, Scene as ThreeScene, PerspectiveCamera, Color, Raycaster, Vector2 } from './three.js';
import { GameError, logError } from '../utils/errors.js';
import { markDeviceSlow, readDevice } from './deviceVerdict.js';
import { FRAME_WATCH_DEFAULTS, createFrameWatch, pixelRatioSteps } from './frameWatch.js';
import { pickQuality } from './support.js';

/**
 * A ready-to-use 3D view inside a DOM element: renderer, scene, camera, sizing, picking and clean-up.
 * Every 3D scene builds on this, so the mobile rules (capped pixel ratio, no shadows, a lost graphics
 * context handled instead of a frozen picture, a view that runs too slowly given up on) are written once.
 *
 * It watches how smoothly it runs (see `frameWatch.js`). When frames stay slow it lowers its resolution, and when that is not enough
 * it tells the game to carry on flat, through the same `onContextLost` hook every game already wires to its flat version, and notes that
 * this device is slow so games open flat here by default from then on.
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
  #onTooSlow;
  #handleLost;
  #disposed = false;
  #size = { width: 1, height: 1 };
  /** The pixel ratios to step down through when frames are slow, starting with the one in use. */
  #ratios;
  #frameRequest = null;

  /**
   * @param {{
   *   container: HTMLElement,
   *   background?: string|number|null,
   *   fov?: number, near?: number, far?: number,
   *   quality?: import('./support.js').Quality,
   *   onContextLost?: () => void,
   *   onTooSlow?: () => void,
   *   frameWatch?: boolean,
   *   label?: string
   * }} options `container` must have a size from CSS; the canvas fills it. `label` is read by screen
   *   readers in place of the picture. `onContextLost` should switch the game to its 2D version. `onTooSlow` is called when the
   *   view runs too slowly even at a low resolution (it defaults to `onContextLost`, so a game that handles a lost context already
   *   handles this). `frameWatch: false` turns the speed check off; by default it is on unless the device record says otherwise.
   * @throws {GameError} With code 'WEBGL_UNAVAILABLE' when the renderer cannot be created. Callers
   *   catch it and fall back to 2D.
   */
  constructor({ container, background = null, fov = 50, near = 0.1, far = 200, quality, onContextLost, onTooSlow, frameWatch, label = '3D view' }) {
    this.#container = container;
    this.#onContextLost = onContextLost ?? (() => {});
    this.#onTooSlow = onTooSlow ?? this.#onContextLost;
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

    this.#ratios = pixelRatioSteps(this.quality.pixelRatio, FRAME_WATCH_DEFAULTS.steps);
    if (frameWatch ?? readDevice().frameWatch !== 'off') this.#watchFrames();
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
    if (this.#frameRequest !== null) globalThis.cancelAnimationFrame?.(this.#frameRequest);
    this.#observer?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.#handleLost);
    disposeObject(this.scene);
    this.renderer.dispose();
    this.canvas.remove();
    this.#container.classList.remove('stage3d');
  }

  /**
   * Times the animation frames (with a loop of its own, so a scene that only draws when something moves is not mistaken for a slow
   * one) and acts on what `createFrameWatch` says.
   */
  #watchFrames() {
    const raf = globalThis.requestAnimationFrame?.bind(globalThis);
    if (!raf) return;
    const watch = createFrameWatch({ steps: this.#ratios.length - 1 });
    let last = null;
    const tick = (now) => {
      if (this.#disposed) return;
      if (last !== null) {
        const verdict = watch.frame(now - last);
        if (verdict === 'lower') this.#lowerResolution(this.#ratios[watch.lowered]);
        else if (verdict === 'giveUp') {
          this.#giveUpSlow(watch.lowered);
          return;
        }
      }
      last = now;
      this.#frameRequest = raf(tick);
    };
    this.#frameRequest = raf(tick);
  }

  /** @param {number} ratio */
  #lowerResolution(ratio) {
    console.warn(`[stage3d] the 3D view is running slowly, so its resolution goes down to x${ratio}`);
    // three.js resizes the drawing buffer itself when the ratio changes.
    this.renderer.setPixelRatio(ratio);
  }

  /** @param {number} lowered How many times the resolution was lowered first. */
  #giveUpSlow(lowered) {
    logError(
      new GameError('STAGE_TOO_SLOW', 'the 3D view runs too slowly on this device, so the game carries on with its flat version', { lowered }),
      'stage3d',
    );
    markDeviceSlow();
    this.#onTooSlow();
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
