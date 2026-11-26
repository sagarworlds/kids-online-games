import { CanvasTexture, SRGBColorSpace } from '../../../engine/three/three.js';
import { GameError } from '../../../engine/utils/errors.js';
import { texturePlacement } from '../logic/globe.js';
import { WORLD_HEIGHT } from '../logic/projection.js';

/**
 * The picture wrapped round the globe, drawn in code from the same country outlines the 2D map uses (so a child who knows
 * one knows the other): sea, the grey land that is not part of the quiz, the countries, the ones the child has explored in
 * green and the one being asked about in orange. Drawing it once and only repainting the few countries that change keeps a
 * new answer fast.
 *
 * It also answers "which country is at this point of the map?" by testing the point against each outline's real shape (not
 * a picture of colours, whose blurred edges would sometimes name the neighbour).
 *
 * The picture is 2048 pixels wide on a capable device and 1024 on a weak one. That is larger than the 512 pixels the other
 * 3D versions keep to, on purpose: a world map has hundreds of countries, some only a few pixels across.
 *
 * @typedef {import('../ui/worldData.js').World} World
 */

/** The colours are the 2D map's (`.country`, `.context` in style.css), with the sea a little deeper for a globe. */
const COLORS = Object.freeze({
  sea: '#9fd3f2', ice: '#f1f6fb', land: '#f0e4bd', landLine: '#6a5f3e', context: '#d6d6cc', contextLine: '#9a9a8c',
  explored: '#7fcf8b', exploredLine: '#1b5e2f', target: '#ffb347', targetLine: '#b3261e',
});

/** @param {number} width @param {number} height @returns {HTMLCanvasElement} */
function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * @param {{ world: World, detail: 'low'|'high' }} options
 * @returns {{
 *   texture: import('../../../engine/three/three.js').CanvasTexture,
 *   setExplored: (codes: ReadonlySet<string>) => void,
 *   setTarget: (code: string|null) => void,
 *   flush: () => void,
 *   codeAt: (point: { x: number, y: number }) => string|null
 * }} `flush` repaints if anything changed (call it once a frame). `codeAt` takes a point in map units.
 * @throws {GameError} 'CANVAS_UNAVAILABLE' when the browser gives no 2D canvas.
 */
export function createGlobeSkin({ world, detail }) {
  const width = detail === 'high' ? 2048 : 1024;
  const { height, scale, offsetY } = texturePlacement(width);
  const base = makeCanvas(width, height);
  const shown = makeCanvas(width, height);
  const baseCtx = base.getContext('2d');
  const ctx = shown.getContext('2d');
  if (!baseCtx || !ctx) throw new GameError('CANVAS_UNAVAILABLE', 'the browser did not give a 2D canvas for the globe', { width, height });

  const paths = new Map(world.countries.map((c) => [c.code, new Path2D(c.d)]));
  const contextPaths = world.context.map((d) => new Path2D(d));
  const texture = new CanvasTexture(shown);
  texture.colorSpace = SRGBColorSpace;

  /** A line one screen-ish pixel wide in the picture's pixels, whatever the picture's size. */
  const line = (pixels) => pixels / scale;

  function paint(context, code, fill, stroke, pixels) {
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = line(pixels);
    context.lineJoin = 'round';
    // The map file draws with the even-odd rule (a hole in a country is not part of it).
    context.fill(paths.get(code), 'evenodd');
    context.stroke(paths.get(code));
  }

  // The unchanging part: sea, the polar strips the map does not cover, the grey land and every country in its plain colour.
  baseCtx.fillStyle = COLORS.sea;
  baseCtx.fillRect(0, 0, width, height);
  const mapBottom = offsetY + WORLD_HEIGHT * scale;
  baseCtx.fillStyle = COLORS.ice;
  baseCtx.fillRect(0, 0, width, offsetY);
  baseCtx.fillRect(0, mapBottom, width, height - mapBottom);
  baseCtx.save();
  baseCtx.translate(0, offsetY);
  baseCtx.scale(scale, scale);
  baseCtx.fillStyle = COLORS.context;
  baseCtx.strokeStyle = COLORS.contextLine;
  baseCtx.lineWidth = line(0.8);
  for (const path of contextPaths) { baseCtx.fill(path, 'evenodd'); baseCtx.stroke(path); }
  for (const code of paths.keys()) paint(baseCtx, code, COLORS.land, COLORS.landLine, 1);
  baseCtx.restore();

  let explored = new Set();
  let target = null;
  let dirty = true;

  function repaint() {
    ctx.drawImage(base, 0, 0);
    ctx.save();
    ctx.translate(0, offsetY);
    ctx.scale(scale, scale);
    for (const code of explored) if (paths.has(code)) paint(ctx, code, COLORS.explored, COLORS.exploredLine, 1.6);
    // The asked-about country goes last so its outline is on top of its neighbours.
    if (target && paths.has(target)) paint(ctx, target, COLORS.target, COLORS.targetLine, 3);
    ctx.restore();
    texture.needsUpdate = true;
  }

  // For finding the country at a point: a box round each outline rules most of them out before the exact test.
  /** @type {Map<string, { minX: number, minY: number, maxX: number, maxY: number }|null>|null} */
  let boxes = null;
  let probe = null;
  function ensureProbe() {
    if (boxes) return;
    boxes = new Map();
    for (const c of world.countries) {
      const numbers = c.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      // The map file only uses absolute move, line and close commands, so its numbers are x, y pairs.
      if (numbers.length < 2 || numbers.length % 2 !== 0) { boxes.set(c.code, null); continue; }
      const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (let i = 0; i < numbers.length; i += 2) {
        box.minX = Math.min(box.minX, numbers[i]); box.maxX = Math.max(box.maxX, numbers[i]);
        box.minY = Math.min(box.minY, numbers[i + 1]); box.maxY = Math.max(box.maxY, numbers[i + 1]);
      }
      boxes.set(c.code, box);
    }
    probe = makeCanvas(1, 1).getContext('2d');
  }

  return {
    texture,
    setExplored(codes) { explored = new Set(codes); dirty = true; },
    setTarget(code) { target = code; dirty = true; },
    flush() { if (dirty) { dirty = false; repaint(); } },
    codeAt({ x, y }) {
      ensureProbe();
      for (const [code, path] of paths) {
        const box = boxes.get(code);
        if (box && (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY)) continue;
        if (probe.isPointInPath(path, x, y, 'evenodd')) return code;
      }
      return null;
    },
  };
}
