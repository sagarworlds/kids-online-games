import { el, svgEl } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { exceedsThreshold } from '../../../engine/utils/dragMath.js';
import { WORLD_VIEW } from '../logic/continents.js';
import { fitToAspect, zoomAt, panBy, pinchView, pixelsPerUnit, resolveTap, MIN_VIEW_WIDTH } from '../logic/mapView.js';

const WHEEL_STEP = 1.2;
const BUTTON_STEP = 1.6;
const PLANE_MS = 900;
const KEY_PAN = 0.15;

/**
 * The world map: an SVG of every country that can be panned, zoomed (mouse wheel, pinch, the + and − buttons, and the
 * keyboard), tapped, coloured in, highlighted and flown over by a little plane.
 *
 * The pan and zoom maths is in `logic/mapView.js`; this only turns pointer events into those calls.
 *
 * @param {{
 *   world: import('./worldData.js').World,
 *   label: string,
 *   onTap?: (code: string|null) => void
 * }} options `onTap` is called with the country that was tapped (null for open sea). Without it the map is for looking.
 * @returns {{
 *   el: HTMLElement,
 *   setExplored: (codes: ReadonlySet<string>) => void,
 *   setHome: (rect: import('../logic/continents.js').Rect, options?: { animate?: boolean }) => void,
 *   highlight: (code: string|null, label?: string) => void,
 *   flyPlaneTo: (code: string) => Promise<void>,
 *   destroy: () => void
 * }}
 */
export function createWorldMap({ world, label, onTap }) {
  const anchors = world.countries.map(({ code, cx, cy, r }) => ({ code, cx, cy, r }));
  const anchorOf = new Map(anchors.map((a) => [a.code, a]));
  const limits = { world: WORLD_VIEW, minWidth: MIN_VIEW_WIDTH };

  /** @type {import('../logic/continents.js').Rect} */
  let home = { ...WORLD_VIEW };
  let view = { ...WORLD_VIEW };
  let width = 1;
  let height = 1;
  let highlighted = null;

  // ----------------------------------------------------------- the picture
  const pathEls = new Map();
  const countryGroup = svgEl('g', { class: 'map__countries' });
  for (const c of world.countries) {
    const path = svgEl('path', { d: c.d, class: 'country', 'data-code': c.code });
    pathEls.set(c.code, path);
    countryGroup.append(path);
  }
  const contextGroup = svgEl('g', { class: 'map__context' }, ...world.context.map((d) => svgEl('path', { d, class: 'context' })));
  const labelEl = svgEl('text', { class: 'map__label', 'text-anchor': 'middle' });
  const plane = svgEl('text', { class: 'map__plane', 'text-anchor': 'middle', 'aria-hidden': 'true' });
  plane.textContent = '✈️';
  plane.setAttribute('visibility', 'hidden');
  const svg = svgEl('svg', { class: 'map__svg', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, contextGroup, countryGroup, labelEl, plane);

  // ------------------------------------------------------------- controls
  const controls = el('div', { class: 'map__controls', attrs: { role: 'group', 'aria-label': 'Map controls' } },
    createButton({ icon: '＋', ariaLabel: 'Zoom in', onClick: () => zoomBy(BUTTON_STEP) }),
    createButton({ icon: '－', ariaLabel: 'Zoom out', onClick: () => zoomBy(1 / BUTTON_STEP) }),
    createButton({ icon: '⤢', ariaLabel: 'Show the whole area again', onClick: () => setHome(home) }));
  const root = el('div', { class: 'map', attrs: { role: 'group', 'aria-label': `${label}. Drag to move, pinch or use the plus and minus buttons to zoom.`, tabindex: '0' } }, svg, controls);

  // ------------------------------------------------------------------ view
  // Every pixel-to-map conversion uses the picture itself, not the bordered box around it: the border would otherwise
  // shift each tap by a few pixels, enough to land on the next island.
  const drawing = svg;
  function measure() {
    const box = drawing.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
  }

  function apply(next) {
    view = next;
    svg.setAttribute('viewBox', `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`);
    const scale = pixelsPerUnit(view, width);
    // Text and the plane are sized in screen pixels, whatever the zoom.
    labelEl.style.fontSize = `${14 / scale}px`;
    labelEl.style.strokeWidth = `${3 / scale}px`;
    plane.style.fontSize = `${22 / scale}px`;
    placeLabel();
  }

  /** Sets the area the map goes back to, fitted to the shape of the screen, and shows it. */
  function setHome(rect, { animate = false } = {}) {
    home = rect;
    measure();
    const fitted = fitToAspect(rect, width / height);
    if (!animate || prefersReducedMotion()) { apply(fitted); return; }
    glide(fitted);
  }

  let gliding = 0;
  function glide(target) {
    const from = { ...view };
    const start = performance.now();
    const token = ++gliding;
    const step = (now) => {
      if (token !== gliding) return;
      const t = Math.min(1, (now - start) / 450);
      const e = 1 - (1 - t) ** 3;
      apply({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, width: from.width + (target.width - from.width) * e, height: from.height + (target.height - from.height) * e });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const toMap = (clientX, clientY) => {
    const box = drawing.getBoundingClientRect();
    return { x: view.x + ((clientX - box.left) / box.width) * view.width, y: view.y + ((clientY - box.top) / box.height) * view.height };
  };

  function zoomBy(factor, anchor = { x: view.x + view.width / 2, y: view.y + view.height / 2 }) {
    gliding += 1;
    apply(zoomAt(view, factor, anchor, limits));
  }

  // ----------------------------------------------------------- pointer input
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  let press = null; // { start, moved } for one finger or the mouse
  let pinch = null;

  root.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.map__controls')) return;
    root.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gliding += 1;
    if (pointers.size === 1) {
      press = { start: { x: event.clientX, y: event.clientY }, moved: false, target: event.target };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { view: { ...view }, distance: Math.hypot(a.x - b.x, a.y - b.y), middle: toMap(middle.x, middle.y) };
      press = null; // two fingers is never a tap
    }
  });

  root.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const box = drawing.getBoundingClientRect();
      const middlePx = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      apply(pinchView(pinch.view, pinch.distance, Math.hypot(a.x - b.x, a.y - b.y), pinch.middle,
        { x: (middlePx.x - box.left) / box.width, y: (middlePx.y - box.top) / box.height }, limits));
      return;
    }
    if (!press) return;
    if (!press.moved && !exceedsThreshold(press.start, { x: event.clientX, y: event.clientY })) return;
    press.moved = true;
    const box = drawing.getBoundingClientRect();
    apply(panBy(view, -((event.clientX - previous.x) / box.width) * view.width, -((event.clientY - previous.y) / box.height) * view.height, limits));
  });

  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (event.type === 'pointerup' && press && !press.moved && pointers.size === 0) {
      const target = press.target.closest?.('.country');
      const point = toMap(event.clientX, event.clientY);
      if (onTap) onTap(resolveTap(point, target?.dataset.code ?? null, anchors, pixelsPerUnit(view, width)));
    }
    if (pointers.size === 0) press = null;
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);

  root.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, toMap(event.clientX, event.clientY));
  }, { passive: false });

  // ----------------------------------------------------------- keyboard
  root.addEventListener('keydown', (event) => {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (move) {
      event.preventDefault();
      apply(panBy(view, move[0] * view.width * KEY_PAN, move[1] * view.height * KEY_PAN, limits));
    } else if (event.key === '+' || event.key === '=') zoomBy(BUTTON_STEP);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / BUTTON_STEP);
  });

  // --------------------------------------------------------- the pictures
  // When the screen area changes shape, keep the same centre and width and just fit the height.
  // The work waits for the next frame so it never changes layout while the browser is still delivering resize notices.
  let refitFrame = 0;
  const refit = () => {
    refitFrame = 0;
    measure();
    const fitted = view.width / (width / height);
    apply({ x: view.x, y: view.y + view.height / 2 - fitted / 2, width: view.width, height: fitted });
  };
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (!refitFrame) refitFrame = requestAnimationFrame(refit);
  });
  resizeObserver?.observe(root);

  function placeLabel() {
    const a = highlighted && anchorOf.get(highlighted);
    if (!a) return;
    const scale = pixelsPerUnit(view, width);
    labelEl.setAttribute('x', String(a.cx));
    labelEl.setAttribute('y', String(a.cy - Math.max(a.r, 2 / scale) - 8 / scale));
  }

  /** Colours in the countries the child has explored. */
  function setExplored(codes) {
    for (const [code, path] of pathEls) path.classList.toggle('is-explored', codes.has(code));
  }

  /** Makes a country pulse and writes its name beside it (null clears it). */
  function highlight(code, text = '') {
    if (highlighted) pathEls.get(highlighted)?.classList.remove('is-target');
    highlighted = code;
    labelEl.textContent = code ? text : '';
    if (code) {
      const path = pathEls.get(code);
      path?.classList.add('is-target');
      path?.parentNode.append(path); // on top of its neighbours so the outline is not hidden
      placeLabel();
    }
  }

  /** The plane flies from wherever it is to a country. */
  function flyPlaneTo(code) {
    const a = anchorOf.get(code);
    if (!a) return Promise.resolve();
    const from = plane.dataset.x ? { x: Number(plane.dataset.x), y: Number(plane.dataset.y) } : { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    plane.setAttribute('visibility', 'visible');
    const place = (x, y) => { plane.setAttribute('x', String(x)); plane.setAttribute('y', String(y)); plane.dataset.x = String(x); plane.dataset.y = String(y); };
    if (prefersReducedMotion()) { place(a.cx, a.cy); return Promise.resolve(); }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / PLANE_MS);
        const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        place(from.x + (a.cx - from.x) * e, from.y + (a.cy - from.y) * e - Math.sin(Math.PI * t) * 12 / pixelsPerUnit(view, width));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function destroy() {
    resizeObserver?.disconnect();
    cancelAnimationFrame(refitFrame);
    gliding += 1;
  }

  return { el: root, setExplored, setHome, highlight, flyPlaneTo, destroy };
}
