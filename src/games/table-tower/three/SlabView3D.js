import {
  Group, Mesh, BoxGeometry, MeshLambertMaterial, AmbientLight, DirectionalLight, CanvasTexture, SRGBColorSpace,
} from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { disposeObject } from '../../../engine/three/Stage3D.js';
import { easeInOut } from '../../../engine/three/motionMath.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { SLAB_HEIGHT, slabLayout, slabFraming } from '../logic/slabs3d.js';

/**
 * The "split the sum" picture in 3D: each part of the table is a slab of unit squares, as wide as the part and as deep as the number of
 * rows, so 17 × 6 is a 10 × 6 slab beside a 7 × 6 slab and the child can turn the picture to look at them from any side. It does what
 * the flat blocks do (`createBlockStage`): the grid hands it the written working and the number of rows each time the child picks one.
 *
 * @typedef {{
 *   el: HTMLElement,
 *   show: (explained: ReturnType<typeof import('../logic/splits.js').explainSplit>, rows: number) => void,
 *   update: (dt: number) => void,
 *   render: () => void,
 *   dispose: () => void
 * }} SlabStage
 */

const FOV = 45;
const LIMITS = Object.freeze({ minPolar: 0.15, maxPolar: 1.5, minDistance: 5, maxDistance: 140 });
/** The slab colours are the flat blocks' (`.sg__block--0` and `--1` in style.css). */
const SLAB_COLORS = Object.freeze(['#cfe3ff', '#ffd9b3']);
/** A square of the grid is this many pixels in the picture drawn on a slab's top: at most 20 squares wide, so at most 480 pixels. */
const UNIT_PIXELS = 24;
const GROW_SECONDS = 0.35;

/** The top of a slab: its colour with the squares marked out. @returns {CanvasTexture} */
function gridTexture(width, depth, color) {
  const canvas = document.createElement('canvas');
  canvas.width = width * UNIT_PIXELS;
  canvas.height = depth * UNIT_PIXELS;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new GameError('CANVAS_UNAVAILABLE', 'the browser did not give a 2D canvas for a slab', { width, depth });
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(31, 37, 68, 0.55)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= width; x++) { ctx.beginPath(); ctx.moveTo(x * UNIT_PIXELS, 0); ctx.lineTo(x * UNIT_PIXELS, canvas.height); ctx.stroke(); }
  for (let z = 0; z <= depth; z++) { ctx.beginPath(); ctx.moveTo(0, z * UNIT_PIXELS); ctx.lineTo(canvas.width, z * UNIT_PIXELS); ctx.stroke(); }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * @param {{ onContextLost: () => void }} options
 * @returns {SlabStage}
 * @throws {GameError} 'WEBGL_UNAVAILABLE' when the device cannot do 3D (the scene then shows the flat blocks).
 */
export function createSlabStage({ onContextLost }) {
  const container = el('div', { class: 'sg__stage3d' });
  const view = new OrbitStage({
    container, background: '#eef3ff', fov: FOV, limits: LIMITS, onContextLost,
    label: 'The sum drawn as 3D slabs of squares, one slab for each part. Drag to turn it. The working is written below.',
    orbit: { azimuth: 0, polar: 0.95, distance: 24 },
  });
  const { scene } = view.stage;
  scene.add(new AmbientLight('#ffffff', Math.PI * 0.75));
  const sun = new DirectionalLight('#ffffff', Math.PI * 0.7);
  sun.position.set(6, 14, 10);
  scene.add(sun);

  let slabs = new Group();
  scene.add(slabs);
  let grow = 1; // 0 to 1: the new slabs rising into place
  let lastAspect = 0;
  let lastFraming = null;

  function frame(totalWidth, rows) {
    const aspect = view.stage.size.width / view.stage.size.height;
    lastAspect = aspect;
    lastFraming = { totalWidth, rows };
    return slabFraming({ totalWidth, rows, aspect });
  }

  return {
    el: container,

    show(explained, rows) {
      slabs.removeFromParent();
      disposeObject(slabs);
      slabs = new Group();
      const layout = slabLayout({ factors: explained.parts.map((p) => p.factor), rows });
      const labelHeight = Math.max(1.4, layout.totalWidth * 0.08);
      for (const slab of layout.slabs) {
        const color = SLAB_COLORS[slab.index % 2];
        const side = new MeshLambertMaterial({ color });
        const top = new MeshLambertMaterial({ map: gridTexture(slab.width, slab.depth, color) });
        const mesh = new Mesh(new BoxGeometry(slab.width, SLAB_HEIGHT, slab.depth), [side, side, top, side, side, side]);
        mesh.position.set(slab.x, SLAB_HEIGHT / 2, 0);
        slabs.add(mesh);
        const label = makeLabel(`${slab.factor} × ${rows} = ${slab.product}`, { worldHeight: labelHeight, fontSize: 56, padding: 12 });
        label.position.set(slab.x, SLAB_HEIGHT + labelHeight * 0.9, 0);
        slabs.add(label);
      }
      scene.add(slabs);
      const framing = frame(layout.totalWidth, rows);
      if (view.reducedMotion) { grow = 1; view.snapTo({ ...framing, target: { x: 0, y: 0, z: 0 } }); } else {
        grow = 0;
        view.glideTo({ ...framing, target: { x: 0, y: 0, z: 0 } });
      }
    },

    update(dt) {
      view.update(dt);
      if (grow < 1) {
        grow = Math.min(1, grow + dt / GROW_SECONDS);
        slabs.scale.y = 0.15 + 0.85 * easeInOut(grow);
      } else slabs.scale.y = 1;
      // A phone turned on its side changes the picture's shape: keep every slab in frame unless the child has zoomed.
      const aspect = view.stage.size.width / view.stage.size.height;
      if (lastFraming && Math.abs(aspect - lastAspect) > 1e-6) {
        const before = slabFraming({ ...lastFraming, aspect: lastAspect }).distance;
        lastAspect = aspect;
        if (Math.abs(view.input.orbit.distance - before) < 1e-6) view.input.orbit = { ...view.input.orbit, distance: slabFraming({ ...lastFraming, aspect }).distance };
      }
    },

    render: () => view.render(),
    dispose: () => view.dispose(),
  };
}
