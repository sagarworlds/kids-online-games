/**
 * Decides whether a device should get the 3D version of a game, and how much detail it can afford.
 * Everything here is a pure function of the hints passed in, so it is unit-tested without a browser.
 */

/** @typedef {'3d'|'2d'} ViewMode */

/**
 * @typedef {{
 *   pixelRatio: number, antialias: boolean, shadows: boolean, detail: 'low'|'high'
 * }} Quality
 * `pixelRatio` is the cap handed to the renderer; `detail` lets a scene pick segment counts and object counts.
 */

/**
 * True when the browser can create a WebGL 2 context (three.js r163+ needs WebGL 2).
 * @param {() => { getContext(type: string, attrs?: object): unknown }} [createCanvas] Injected in tests.
 * @returns {boolean}
 */
export function hasWebGL2(createCanvas = () => document.createElement('canvas')) {
  try {
    const canvas = createCanvas();
    // failIfMajorPerformanceCaveat is left off on purpose: a software renderer is slow but still works,
    // and pickQuality() already lowers the detail for weak devices.
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Picks render settings from what the browser reports about the device.
 * Phones with little memory or few cores get no antialiasing and a pixel ratio of 1: on a small, dense
 * screen that is barely visible, and it roughly halves the work per frame.
 *
 * @param {{ deviceMemory?: number, hardwareConcurrency?: number, devicePixelRatio?: number }} [hints]
 * @returns {Quality}
 */
export function pickQuality({ deviceMemory, hardwareConcurrency, devicePixelRatio = 1 } = {}) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  // Browsers that hide these values (Safari, Firefox) are treated as capable: iPhones and iPads are.
  const weakMemory = Number.isFinite(deviceMemory) && deviceMemory <= 2;
  const weakCpu = Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 4;
  if (weakMemory || weakCpu) {
    return { pixelRatio: 1, antialias: false, shadows: false, detail: 'low' };
  }
  // Above 2 the extra pixels cost speed and battery for no visible gain (same cap as the 2D canvas).
  return { pixelRatio: Math.min(2, dpr), antialias: true, shadows: false, detail: 'high' };
}

/**
 * True for the very weakest phones: 1 GB of memory or less, or two cores or fewer. They open games flat until the child asks for 3D,
 * because a first visit that stutters is the worst way to meet it. (`pickQuality` is gentler: it only lowers the detail up to 2 GB or
 * 4 cores.) Browsers that hide these values are treated as capable.
 * @param {{ deviceMemory?: number, hardwareConcurrency?: number }} [hints]
 * @returns {boolean}
 */
export function isWeakDevice({ deviceMemory, hardwareConcurrency } = {}) {
  return (Number.isFinite(deviceMemory) && deviceMemory <= 1) || (Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 2);
}

/**
 * Which version of a game to show.
 * @param {{ supported: boolean, preference?: ViewMode|null, slowDevice?: boolean }} options `preference` is the child's saved choice.
 *   `slowDevice` says 3D has been too slow here (or the device is very weak).
 * @returns {ViewMode} 2D when the device cannot do 3D. Otherwise the child's own choice always wins; with no choice yet, 3D, unless
 *   the device is slow.
 */
export function resolveViewMode({ supported, preference = null, slowDevice = false }) {
  if (!supported) return '2d';
  if (preference === '2d' || preference === '3d') return preference;
  return slowDevice ? '2d' : '3d';
}
