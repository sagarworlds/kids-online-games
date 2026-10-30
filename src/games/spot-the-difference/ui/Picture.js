import { svgEl } from '../../../engine/utils/dom.js';
import { shade } from '../logic/color.js';
import { SCENE_WIDTH, SCENE_HEIGHT } from '../logic/levels.js';
import { inflateBox, boxCentre } from '../logic/geometry.js';

/** How long a miss mark and a hint stay on screen, in seconds. */
const MISS_SECONDS = 0.7;
const HINT_SECONDS = 3.2;
/** A hint circles a region, not the exact spot: it is this much bigger than the difference. */
const HINT_PAD = 34;

/**
 * Turns a colour token from the data into a real colour: "$" is the object's own colour, "$d" a darker shade of it and
 * "$l" a lighter one. Anything else is a plain colour. Shading the colour (instead of storing three) is what lets one
 * drawing of a bird be any colour and still look like a bird.
 * @param {string|undefined} value
 * @param {string} color
 * @returns {string}
 */
export function resolveColor(value, color) {
  if (value === undefined) return 'none';
  if (value === '$') return color;
  if (value === '$d') return shade(color, 'd');
  if (value === '$l') return shade(color, 'l');
  return value;
}

/**
 * Draws one shape from the data. `rot` turns it about the drawing's centre (0, 0), the same way the data was measured.
 * @param {import('../logic/templates.js').Shape} shape
 * @param {string} [color] The object's own colour (not needed for backgrounds).
 * @returns {SVGElement}
 */
export function drawShape(shape, color = '#808080') {
  const paint = {
    fill: resolveColor(shape.fill, color),
    stroke: resolveColor(shape.stroke, color),
    'stroke-width': shape.sw ?? 1,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  };
  if (shape.rot) paint.transform = `rotate(${shape.rot})`;
  switch (shape.k) {
    case 'rect': return svgEl('rect', { x: shape.x, y: shape.y, width: shape.w, height: shape.h, ...(shape.rx ? { rx: shape.rx } : {}), ...paint });
    case 'circle': return svgEl('circle', { cx: shape.cx, cy: shape.cy, r: shape.r, ...paint });
    case 'ellipse': return svgEl('ellipse', { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry, ...paint });
    case 'polygon': return svgEl('polygon', { points: shape.pts.join(' '), ...paint });
    default: return svgEl('path', { d: shape.d, ...paint });
  }
}

/** One object: its template drawn at its place, size, turn and colour. Flipping mirrors it before it is turned. */
function drawObject(object, template) {
  const sx = object.flip ? -object.scale : object.scale;
  const g = svgEl('g', {
    class: 'obj', 'data-object': object.id,
    transform: `translate(${object.x.toFixed(2)} ${object.y.toFixed(2)}) rotate(${object.rotation}) scale(${sx} ${object.scale})`,
  });
  for (const shape of template.shapes) g.append(drawShape(shape, object.color));
  return g;
}

/**
 * One of the two pictures: the background, the objects, and a layer on top for circles, crosses, hints and the keyboard
 * pointer. Both pictures are made by this same function from data, so they can only differ where the data does.
 *
 * @param {{
 *   theme: import('../logic/templates.js').Theme, templates: ReadonlyMap<string, import('../logic/templates.js').Template>,
 *   objects: readonly import('../logic/geometry.js').SceneObject[], label: string
 * }} options
 * @returns {{
 *   el: SVGSVGElement,
 *   markFound: (box: import('../logic/geometry.js').Box) => void,
 *   markMiss: (point: { x: number, y: number }) => void,
 *   showHint: (box: import('../logic/geometry.js').Box) => void,
 *   setPointer: (point: { x: number, y: number }|null) => void,
 *   tick: (dt: number) => void
 * }}
 */
export function createPicture({ theme, templates, objects, label }) {
  const svg = svgEl('svg', {
    class: 'picture__svg', viewBox: `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`, role: 'img', 'aria-label': label, focusable: 'false',
  });
  const background = svgEl('g', { class: 'picture__background' }, ...theme.background.map((shape) => drawShape(shape)));
  const things = svgEl('g', { class: 'picture__objects' }, ...objects.map((o) => drawObject(o, templates.get(o.template))));
  const marks = svgEl('g', { class: 'picture__marks' });
  const pointer = svgEl('g', { class: 'pointer', visibility: 'hidden' },
    svgEl('circle', { class: 'pointer__halo', r: 22 }),
    svgEl('circle', { class: 'pointer__ring', r: 22 }),
    svgEl('path', { class: 'pointer__cross', d: 'M -32 0 L -10 0 M 10 0 L 32 0 M 0 -32 L 0 -10 M 0 10 L 0 32' }));
  svg.append(background, things, marks, pointer);

  /** Marks that go away by themselves: `left` is the seconds to live; a hint also keeps the box of the difference it points at. */
  let temporary = [];
  const addTemporary = (node, seconds, extra = {}) => { marks.append(node); temporary.push({ node, left: seconds, ...extra }); };
  const sameBox = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

  return {
    el: svg,

    /** A circle that draws itself round a difference you found. Stays for the rest of the picture. */
    markFound(box) {
      // A hint for this very difference has done its job.
      for (const t of temporary) if (t.hintFor && sameBox(t.hintFor, box)) t.left = 0;
      const c = boxCentre(box);
      const attrs = { cx: c.x, cy: c.y, rx: Math.max(box.w / 2 + 12, 30), ry: Math.max(box.h / 2 + 12, 30), pathLength: 1 };
      marks.append(svgEl('g', { class: 'mark mark--found' },
        svgEl('ellipse', { ...attrs, class: 'mark__halo' }),
        svgEl('ellipse', { ...attrs, class: 'mark__ring' })));
    },

    /** A small cross that fades away where you tapped and found nothing. */
    markMiss({ x, y }) {
      addTemporary(svgEl('g', { class: 'mark mark--miss', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        svgEl('path', { class: 'mark__halo', d: 'M -16 -16 L 16 16 M 16 -16 L -16 16' }),
        svgEl('path', { class: 'mark__cross', d: 'M -16 -16 L 16 16 M 16 -16 L -16 16' })), MISS_SECONDS);
    },

    /** A soft glowing circle over the region of a difference. Only one at a time. */
    showHint(box) {
      for (const t of temporary) if (t.hintFor) t.left = 0;
      const area = inflateBox(box, HINT_PAD);
      const c = boxCentre(area);
      addTemporary(svgEl('ellipse', { class: 'mark mark--hint', cx: c.x, cy: c.y, rx: Math.max(area.w / 2, 44), ry: Math.max(area.h / 2, 44) }), HINT_SECONDS, { hintFor: box });
    },

    /** The keyboard pointer: shown at a place, or hidden with null. */
    setPointer(point) {
      if (!point) {
        pointer.setAttribute('visibility', 'hidden');
        return;
      }
      pointer.setAttribute('visibility', 'visible');
      pointer.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
    },

    /** Takes away marks that have run out of time. @param {number} dt Seconds. */
    tick(dt) {
      if (temporary.length === 0) return;
      for (const t of temporary) t.left -= dt;
      for (const t of temporary) if (t.left <= 0) t.node.remove();
      temporary = temporary.filter((t) => t.left > 0);
    },
  };
}
