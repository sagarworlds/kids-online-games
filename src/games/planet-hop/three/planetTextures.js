import { CanvasTexture, SRGBColorSpace } from '../../../engine/three/three.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createRng } from '../../../engine/utils/random.js';

/**
 * Planet surfaces, drawn on a small canvas in code (no image files to download, and they work offline). The colours are
 * the same as the 2D pictures in `ui/PlanetArt.js`, so a child who knows one view knows the other.
 *
 * The canvas wraps round a sphere: x is the way round (the left and right edges meet) and y runs from the north pole
 * at the top to the south pole at the bottom. A shape that crosses an edge is drawn twice so no seam shows.
 */

/** A text becomes the same number every time, so a planet's craters are in the same places on every visit. */
const seedOf = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** @typedef {CanvasRenderingContext2D} Ctx @typedef {{ w: number, h: number }} Size */

/** Horizontal stripes. `list` holds [from, to, colour] with from and to as shares of the height (0 top, 1 bottom). */
function bands(ctx, { w, h }, list) {
  for (const [from, to, colour] of list) {
    ctx.fillStyle = colour;
    ctx.fillRect(0, from * h, w, (to - from) * h);
  }
}

/** A filled oval at a share of the width and height, repeated across the seam. */
function oval(ctx, { w, h }, [cx, cy, rx, ry], colour) {
  ctx.fillStyle = colour;
  for (const shift of [-w, 0, w]) {
    ctx.beginPath();
    ctx.ellipse(cx * w + shift, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** `count` round dents of random size, placed with the planet's own seeded generator. */
function craters(ctx, size, rng, count, colour) {
  for (let i = 0; i < count; i++) {
    const r = 0.012 + rng() * 0.03;
    oval(ctx, size, [rng(), 0.12 + rng() * 0.76, r, r * 2], colour);
  }
}

/** A wavy cloud stripe across the whole width, as on Venus. */
function wave(ctx, { w, h }, y, colour, width) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = 0; x <= w; x += 8) {
    const line = y * h + Math.sin((x / w) * Math.PI * 6) * h * 0.04;
    if (x === 0) ctx.moveTo(x, line);
    else ctx.lineTo(x, line);
  }
  ctx.stroke();
}

/**
 * What is drawn on each body, on top of its plain colour. A body that is not listed (a planet added to the data file)
 * stays a plain coloured ball, as in the 2D pictures, so a new planet never breaks the view.
 * @type {Record<string, (ctx: Ctx, size: Size, rng: () => number) => void>}
 */
const RECIPES = {
  mercury: (ctx, size, rng) => craters(ctx, size, rng, 26, '#8f8a82'),
  moon: (ctx, size, rng) => craters(ctx, size, rng, 22, '#a7a7a7'),
  venus: (ctx, size) => { for (const y of [0.25, 0.45, 0.65, 0.82]) wave(ctx, size, y, '#f6dfaa', size.h * 0.07); },
  earth: (ctx, size) => {
    for (const land of [[0.18, 0.38, 0.1, 0.17], [0.3, 0.64, 0.05, 0.14], [0.55, 0.36, 0.12, 0.15], [0.62, 0.62, 0.06, 0.1], [0.82, 0.7, 0.07, 0.07]]) oval(ctx, size, land, '#4caf50');
    bands(ctx, size, [[0, 0.07, '#ffffff'], [0.93, 1, '#ffffff']]);
    for (const cloud of [[0.1, 0.22, 0.07, 0.025], [0.45, 0.52, 0.08, 0.025], [0.75, 0.3, 0.06, 0.02]]) oval(ctx, size, cloud, 'rgba(255,255,255,0.7)');
  },
  mars: (ctx, size) => {
    for (const patch of [[0.2, 0.5, 0.1, 0.1], [0.5, 0.4, 0.08, 0.07], [0.72, 0.58, 0.09, 0.08]]) oval(ctx, size, patch, '#a8401f');
    bands(ctx, size, [[0, 0.07, '#ffffff'], [0.94, 1, '#ffffff']]);
  },
  jupiter: (ctx, size) => {
    bands(ctx, size, [[0.12, 0.22, '#b87d4b'], [0.32, 0.42, '#f0d9b5'], [0.48, 0.62, '#b87d4b'], [0.7, 0.8, '#efd5ae']]);
    oval(ctx, size, [0.6, 0.64, 0.07, 0.05], '#c0452c');
  },
  saturn: (ctx, size) => bands(ctx, size, [[0.18, 0.28, '#c9a95a'], [0.46, 0.54, '#d9bf7a'], [0.7, 0.78, '#c9a95a']]),
  uranus: (ctx, size) => bands(ctx, size, [[0.46, 0.54, '#b5e5e8']]),
  neptune: (ctx, size) => {
    oval(ctx, size, [0.3, 0.42, 0.08, 0.06], '#26398a');
    oval(ctx, size, [0.7, 0.68, 0.1, 0.02], 'rgba(255,255,255,0.6)');
  },
};

/**
 * The surface picture for a planet or the Moon.
 *
 * @param {{ id: string, color: string }} body
 * @param {{ detail: 'low'|'high' }} quality `low` draws a smaller picture for phones that need to save memory. Both are
 *   within the 512 px limit for 3D textures in `docs/SPEC.md`.
 * @returns {import('../../../engine/three/three.js').CanvasTexture} Freed with the rest of the scene by `Stage3D.dispose()`.
 * @throws {GameError} 'CANVAS_UNAVAILABLE' when the browser gives no 2D canvas to draw on.
 */
export function createPlanetTexture(body, { detail }) {
  const w = detail === 'high' ? 512 : 256;
  const size = { w, h: w / 2 };
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new GameError('CANVAS_UNAVAILABLE', 'the browser did not give a 2D canvas for a planet surface', { body: body.id });
  ctx.fillStyle = body.color;
  ctx.fillRect(0, 0, size.w, size.h);
  RECIPES[body.id]?.(ctx, size, createRng(seedOf(body.id)));

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
