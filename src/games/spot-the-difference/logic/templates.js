import { invalidData } from '../../../engine/utils/errors.js';
import { hexToRgb } from './color.js';

/**
 * @typedef {{ k: 'rect'|'circle'|'ellipse'|'polygon'|'path', fill?: string, stroke?: string, sw?: number, rot?: number, [key: string]: any }} Shape
 * @typedef {{ id: string, name: string, w: number, h: number, shapes: Shape[], asymmetric?: boolean, noRotate?: boolean }} Template
 * @typedef {{ id: string, name: string, icon: string, background: Shape[], objects: string[] }} Theme
 *
 * A template is a drawing made of simple shapes around the point (0, 0), `w` x `h` big. A fill of "$" is the object's own
 * colour (which `recolor` changes), "$d" a darker and "$l" a lighter shade of it; anything else is a fixed colour.
 * `asymmetric`: it looks different when mirrored (so `flip` is allowed). `noRotate`: turning it looks the same.
 */

const OBJECTS_FILE = 'objects.json';
const KINDS = ['rect', 'circle', 'ellipse', 'polygon', 'path'];
const TOKEN = /^\$(d|l)?$/;
const PATH = /^[MLQCZ0-9eE.\-\s]+$/;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Templates that are smaller than this (their longer side, in scene units) would be too small to spot. */
export const MIN_TEMPLATE_SIZE = 44;
export const MAX_TEMPLATE_SIZE = 140;
/** The colour-changing part of a template must cover at least this share of its box, or `recolor` would be hard to see. */
export const MIN_RECOLOR_SHARE = 0.1;
export const MIN_THEME_OBJECTS = 20;
export const MAX_THEME_OBJECTS = 30;

const NUMBER_FIELDS = { rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'] };

/** Where a path's numbers are: pairs after the absolute commands M, L, Q, C (Z has none). */
function pathPoints(d) {
  const values = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  const points = [];
  for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i], values[i + 1]]);
  return points;
}

/** @param {Shape} shape @returns {[number, number][]} Points that surely hold the shape (before its own `rot`). */
function shapePoints(shape) {
  switch (shape.k) {
    case 'rect': return [[shape.x, shape.y], [shape.x + shape.w, shape.y], [shape.x, shape.y + shape.h], [shape.x + shape.w, shape.y + shape.h]];
    case 'circle': return [[shape.cx - shape.r, shape.cy - shape.r], [shape.cx + shape.r, shape.cy + shape.r]];
    case 'ellipse': {
      // An ellipse that is turned is held by its longer radius, which may be a little roomy: that is on the safe side.
      const m = shape.rot ? Math.max(shape.rx, shape.ry) : null;
      return m === null ? [[shape.cx - shape.rx, shape.cy - shape.ry], [shape.cx + shape.rx, shape.cy + shape.ry]] : [[shape.cx - m, shape.cy - m], [shape.cx + m, shape.cy + m]];
    }
    case 'polygon': return Array.from({ length: shape.pts.length / 2 }, (_, i) => [shape.pts[2 * i], shape.pts[2 * i + 1]]);
    default: return pathPoints(shape.d);
  }
}

/**
 * The extent of a list of shapes: smallest and largest x and y, including half of each outline.
 * @param {readonly Shape[]} shapes
 * @returns {{ x0: number, x1: number, y0: number, y1: number }}
 */
export function shapeExtents(shapes) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const shape of shapes) {
    const pad = (shape.sw ?? 0) / 2;
    const turn = shape.k === 'ellipse' ? 0 : ((shape.rot ?? 0) * Math.PI) / 180;
    for (const [px, py] of shapePoints(shape)) {
      const x = px * Math.cos(turn) - py * Math.sin(turn);
      const y = px * Math.sin(turn) + py * Math.cos(turn);
      x0 = Math.min(x0, x - pad); x1 = Math.max(x1, x + pad); y0 = Math.min(y0, y - pad); y1 = Math.max(y1, y + pad);
    }
  }
  return { x0, x1, y0, y1 };
}

/** The area of a shape (a path has none we can add up, so it counts as 0). */
function shapeArea(shape) {
  switch (shape.k) {
    case 'rect': return shape.w * shape.h;
    case 'circle': return Math.PI * shape.r * shape.r;
    case 'ellipse': return Math.PI * shape.rx * shape.ry;
    case 'polygon': {
      let sum = 0;
      const n = shape.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        sum += shape.pts[2 * i] * shape.pts[2 * j + 1] - shape.pts[2 * j] * shape.pts[2 * i + 1];
      }
      return Math.abs(sum) / 2;
    }
    default: return 0;
  }
}

/** Checks one shape; `where` names it in the error. @param {any} shape @param {string} where @param {string} file @param {boolean} allowTokens */
function checkShape(shape, where, file, allowTokens) {
  if (!KINDS.includes(shape?.k)) invalidData(file, `${where}.k`, `must be one of ${KINDS.join(', ')}`);
  if (shape.k === 'polygon') {
    if (!Array.isArray(shape.pts) || shape.pts.length < 6 || shape.pts.length % 2 !== 0 || !shape.pts.every(isNumber)) invalidData(file, `${where}.pts`, 'must be at least three x, y pairs of numbers');
  } else if (shape.k === 'path') {
    if (typeof shape.d !== 'string' || !PATH.test(shape.d) || !/^M/.test(shape.d.trim()) || !shape.d.includes(' ')) invalidData(file, `${where}.d`, 'must be a path of absolute M, L, Q, C and Z commands');
  } else {
    for (const field of NUMBER_FIELDS[shape.k]) if (!isNumber(shape[field])) invalidData(file, `${where}.${field}`, 'must be a number');
  }
  for (const field of ['fill', 'stroke']) {
    const value = shape[field];
    if (value === undefined) continue;
    if (allowTokens && TOKEN.test(value)) continue;
    try {
      hexToRgb(value);
    } catch {
      invalidData(file, `${where}.${field}`, `must be a colour like #aabbcc${allowTokens ? ' or $, $d, $l' : ''}`);
    }
  }
  if (shape.rot !== undefined && !isNumber(shape.rot)) invalidData(file, `${where}.rot`, 'must be a number of degrees');
  if (shape.sw !== undefined && !(isNumber(shape.sw) && shape.sw > 0)) invalidData(file, `${where}.sw`, 'must be a positive number');
}

/**
 * Checks the object templates: every shape is well formed; the box `w` x `h` really holds the drawing; the longer side is
 * between 44 and 140 (nothing too small to spot, nothing too big to place); and some of the drawing uses the object's own
 * colour, enough of it that `recolor` shows.
 *
 * @param {any} data
 * @returns {Map<string, Template>}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateTemplates(data) {
  if (!Array.isArray(data?.templates) || data.templates.length === 0) invalidData(OBJECTS_FILE, 'templates', 'must be a non-empty array');
  const map = new Map();
  data.templates.forEach((t, i) => {
    const at = `templates[${i}]`;
    if (!isText(t?.id) || !/^[a-z]+$/.test(t.id)) invalidData(OBJECTS_FILE, `${at}.id`, 'must be a lowercase word');
    if (map.has(t.id)) invalidData(OBJECTS_FILE, `${at}.id`, `"${t.id}" appears twice`);
    if (!isText(t.name)) invalidData(OBJECTS_FILE, `${at}.name`, 'must be a non-empty string');
    if (!Array.isArray(t.shapes) || t.shapes.length === 0) invalidData(OBJECTS_FILE, `${at}.shapes`, 'must be a non-empty array');
    t.shapes.forEach((s, j) => checkShape(s, `${at}.shapes[${j}]`, OBJECTS_FILE, true));
    if (!isNumber(t.w) || !isNumber(t.h)) invalidData(OBJECTS_FILE, `${at}.w`, 'w and h must be numbers');
    const longer = Math.max(t.w, t.h);
    if (longer < MIN_TEMPLATE_SIZE || longer > MAX_TEMPLATE_SIZE) invalidData(OBJECTS_FILE, `${at}`, `its longer side must be ${MIN_TEMPLATE_SIZE} to ${MAX_TEMPLATE_SIZE} (found ${longer})`);
    const { x0, x1, y0, y1 } = shapeExtents(t.shapes);
    if (Math.max(Math.abs(x0), Math.abs(x1)) * 2 > t.w + 2 || Math.max(Math.abs(y0), Math.abs(y1)) * 2 > t.h + 2) {
      invalidData(OBJECTS_FILE, `${at}`, `the drawing (${Math.round(x1 - x0)} x ${Math.round(y1 - y0)}) does not fit its ${t.w} x ${t.h} box around (0, 0)`);
    }
    const own = t.shapes.filter((s) => s.fill === '$');
    if (own.length === 0) invalidData(OBJECTS_FILE, `${at}.shapes`, 'needs a shape with fill "$" so the object can change colour');
    const share = own.reduce((sum, s) => sum + shapeArea(s), 0) / (t.w * t.h);
    if (share < MIN_RECOLOR_SHARE && !own.some((s) => s.k === 'path')) invalidData(OBJECTS_FILE, `${at}.shapes`, `its own-colour part covers only ${Math.round(share * 100)}% of the box, too little to notice a colour change`);
    for (const flag of ['asymmetric', 'noRotate']) if (t[flag] !== undefined && typeof t[flag] !== 'boolean') invalidData(OBJECTS_FILE, `${at}.${flag}`, 'must be true or false');
    map.set(t.id, t);
  });
  return map;
}

/**
 * Checks one theme: a background (plain fixed colours) and a pool of 20 to 30 object templates that all exist, without repeats.
 * @param {any} data
 * @param {ReadonlyMap<string, Template>} templates
 * @param {string} file e.g. "themes/park.json"
 * @returns {Theme}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateTheme(data, templates, file) {
  if (!isText(data?.id) || !/^[a-z]+$/.test(data.id)) invalidData(file, 'id', 'must be a lowercase word');
  for (const field of ['name', 'icon']) if (!isText(data[field])) invalidData(file, field, 'must be a non-empty string');
  if (!Array.isArray(data.background) || data.background.length === 0) invalidData(file, 'background', 'must be a non-empty array of shapes');
  data.background.forEach((s, i) => checkShape(s, `background[${i}]`, file, false));
  if (!Array.isArray(data.objects) || new Set(data.objects).size !== data.objects.length) invalidData(file, 'objects', 'must be a list of object ids without repeats');
  for (const id of data.objects) if (!templates.has(id)) invalidData(file, 'objects', `"${id}" is not in objects.json`);
  if (data.objects.length < MIN_THEME_OBJECTS || data.objects.length > MAX_THEME_OBJECTS) invalidData(file, 'objects', `must have ${MIN_THEME_OBJECTS} to ${MAX_THEME_OBJECTS} objects (found ${data.objects.length})`);
  if (data.objects.filter((id) => templates.get(id).asymmetric).length < 4) invalidData(file, 'objects', 'needs at least 4 asymmetric objects so a flip can be used');
  return data;
}
