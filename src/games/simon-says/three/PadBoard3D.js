import {
  AmbientLight, DirectionalLight, Group, Mesh, ExtrudeGeometry, BoxGeometry, PlaneGeometry, Shape, MeshLambertMaterial, MeshBasicMaterial, AdditiveBlending, Color, Vector3,
} from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { approach } from '../../../engine/three/motionMath.js';
import { createGlowTexture } from '../../../engine/three/glow.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import { PAD_SIZE, padLayout, boardWidth, gridOf, shapeOutline, lighten, padPose, startView, viewLimits } from '../logic/look3d.js';

/**
 * The pads in 3D: a console with a big pad for each colour, which the child can turn and zoom. A pad that lights goes down like a pressed button and
 * glows in its colour; when it goes out it comes back up. Each pad has its shape raised on its top and its number beside it, so the pads differ by
 * more than colour, as on the flat pads.
 *
 * It does what `createPadBoard` does (`light`, `setEnabled`), so the play scene and the music scene use it the same way, and a tap on a pad in the picture
 * calls `onPress` like a click on a flat pad. The flat pads themselves (`controls`, made by the scene) stay in the page, laid over the picture, one
 * button on each pad, invisible except for the focus ring: so the keyboard (keys 1 to 6, or Tab and Space) and screen readers work as before, and a pad
 * is still named by its colour, shape and key. If 3D cannot run, the picture goes and the flat pads are the board again, as they were.
 *
 * @typedef {{
 *   el: HTMLElement,
 *   light: (padId: number, on: boolean) => void,
 *   setEnabled: (enabled: boolean) => void,
 *   tick: (dt: number) => void,
 *   draw: () => void,
 *   dispose: () => void
 * }} PadBoard3D
 */

/** How quickly a pad goes down and comes back up, and its glow comes and goes, as a rate for `approach`. */
const PRESS_RATE = 30;
const SLAB = 0.5;
const BASE_TOP = 0.1;

function roundedSquare(size, radius) {
  const h = size / 2;
  const shape = new Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  return shape;
}

function iconShape(shape) {
  const outline = shapeOutline(shape, 1.25);
  const s = new Shape();
  if (!outline) { s.absarc(0, 0, 0.62, 0, Math.PI * 2, false); return s; }
  outline.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/**
 * @param {{
 *   pads: readonly import('../logic/pads.js').Pad[],
 *   controls: ReturnType<typeof import('../ui/PadBoard.js').createPadBoard>,
 *   onPress: (padId: number) => void,
 *   onFallBack: () => void
 * }} options `controls` is the flat set of pads; `onPress` is called with the pad that was tapped in the picture; `onFallBack` is told when 3D stops.
 * @returns {PadBoard3D}
 */
export function createPadBoard3D({ pads, controls, onPress, onFallBack }) {
  const container = el('div', { class: 'scene3d__stage pads3d' });
  const count = pads.length;
  let view = null;
  let enabled = true;
  /** @type {{ pad: object, group: Group, slab: Group, material: MeshLambertMaterial, glow: object, soft: Color, full: Color, level: number, target: number }[]} */
  const models = [];

  function degrade(reason) {
    logError(new Error(`3D pads stopped: ${reason}`), 'simon-says:3d');
    view?.dispose();
    view = null;
    container.classList.add('pads3d--flat');
    controls.el.classList.remove('pads--overlay');
    for (const pad of pads) Object.assign(controls.button(pad.id).style, { left: '', top: '', width: '', height: '' });
    onFallBack();
  }

  try {
    view = new OrbitStage({
      container, background: '#1c2250', fov: 40, near: 0.1, far: 100, limits: viewLimits(count, 0.9), target: { x: 0, y: 0, z: 0 },
      label: `3D board of ${count} pads, each with its own colour, shape and number. Tap a pad to play it, or use the keys 1 to ${count}. Drag to turn the board.`,
      orbit: (stage) => {
        const { azimuth, polar, distance } = startView(count, stage.size.width / Math.max(1, stage.size.height));
        return { azimuth, polar, distance };
      },
      onContextLost: () => degrade('the graphics were lost'),
      onTap: ({ clientX, clientY }) => {
        if (!view) return;
        const hit = view.stage.pick(clientX, clientY, models.flatMap((m) => m.group.userData.pickable))[0];
        const id = hit?.object.userData.pad;
        if (id !== undefined) onPress(id);
      },
    });
  } catch (error) {
    logError(error, 'simon-says:3d');
    degrade('3D could not start');
  }

  let lastAspect = 0;
  if (view) {
    const { scene } = view.stage;
    scene.add(new AmbientLight('#ffffff', Math.PI * 0.8));
    const lamp = new DirectionalLight('#ffffff', Math.PI * 0.7);
    lamp.position.set(3, 9, 6);
    scene.add(lamp);

    const { rows } = gridOf(count);
    const base = new Mesh(new BoxGeometry(boardWidth(count) + 1.2, 0.6, rows * PAD_SIZE + (rows - 1) * 0.5 + 1.2), new MeshLambertMaterial({ color: '#2b3270' }));
    base.position.y = BASE_TOP - 0.3;
    scene.add(base);

    const slabGeometry = new ExtrudeGeometry(roundedSquare(PAD_SIZE, 0.3), { depth: SLAB - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    slabGeometry.translate(0, 0, -(SLAB - 0.12) / 2);
    const white = new MeshLambertMaterial({ color: '#ffffff' });
    const spots = padLayout(count);
    pads.forEach((pad, i) => {
      const group = new Group();
      group.position.set(spots[i].x, 0, spots[i].z);
      const material = new MeshLambertMaterial({ color: lighten(pad.color, 0.55) });
      // The pad's body, its shape and its number all go down together when it is pressed.
      const slab = new Group();
      const body = new Mesh(slabGeometry, material);
      body.rotation.x = -Math.PI / 2; // the extrusion's depth becomes height
      body.position.y = SLAB / 2;
      const icon = new Mesh(new ExtrudeGeometry(iconShape(pad.shape), { depth: 0.14, bevelEnabled: false }), white);
      icon.rotation.x = -Math.PI / 2;
      icon.position.y = SLAB + 0.02;
      const label = makeLabel(pad.key, { fontSize: 60, worldHeight: 0.5, background: '#ffffff', padding: 12 });
      label.position.set(-PAD_SIZE / 2 + 0.45, SLAB + 0.35, PAD_SIZE / 2 - 0.4);
      // The glow is a pool of light on the console round the pad (a flat picture lying on it, added to what is under it), so it shows round the pad's edge
      // and does not wash out the pad's own colour or the pads behind it.
      const glow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({
        map: createGlowTexture([[0.1, toRgba(pad.color, 0.95)], [0.5, toRgba(pad.color, 0.4)], [1, toRgba(pad.color, 0)]]), transparent: true, blending: AdditiveBlending, depthWrite: false,
      }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = BASE_TOP + 0.02;
      glow.scale.setScalar(0.001);
      slab.add(body, icon, label);
      group.add(slab, glow);
      const pickable = [body, icon];
      for (const mesh of pickable) mesh.userData.pad = pad.id;
      group.userData.pickable = pickable;
      scene.add(group);
      models.push({ pad, group, slab, material, glow, soft: new Color(lighten(pad.color, 0.55)), full: new Color(pad.color), level: 0, target: 0 });
    });
    controls.el.classList.add('pads--overlay');
  }
  container.append(controls.el);

  const projected = new Vector3();
  const neighbour = new Vector3();

  /** Puts each flat pad's button over its pad in the picture. */
  function placeControls() {
    const { width, height } = view.stage.size;
    const camera = view.stage.camera;
    const spots = padLayout(count);
    const top = SLAB + 0.1;
    const px = (v) => [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    projected.set(spots[0].x, top, spots[0].z).project(camera);
    neighbour.set(spots[0].x + PAD_SIZE, top, spots[0].z).project(camera);
    const [ax, ay] = px(projected);
    const [bx, by] = px(neighbour);
    const side = Math.max(48, Math.hypot(bx - ax, by - ay) * 0.9);
    pads.forEach((pad, i) => {
      projected.set(spots[i].x, top, spots[i].z).project(camera);
      const [x, y] = px(projected);
      const style = controls.button(pad.id).style;
      style.left = `${x.toFixed(1)}px`;
      style.top = `${y.toFixed(1)}px`;
      style.width = style.height = `${side.toFixed(1)}px`;
    });
  }

  return {
    el: container,
    light(padId, on) {
      controls.light(padId, on);
      const model = models.find((m) => m.pad.id === padId);
      if (model) model.target = on ? 1 : 0;
    },
    setEnabled(next) {
      enabled = next;
      controls.setEnabled(next);
    },
    tick(dt) {
      if (!view) return;
      view.update(dt);
      // The picture's shape changed (a phone was turned): fit the board to it again.
      const aspect = view.stage.size.width / Math.max(1, view.stage.size.height);
      if (Math.abs(aspect - lastAspect) > 0.03) {
        lastAspect = aspect;
        view.snapTo({ distance: startView(count, aspect).distance, target: { x: 0, y: 0, z: 0 } });
      }
      const calm = view.reducedMotion;
      for (const model of models) {
        model.level = calm ? model.target : approach(model.level, model.target, dt, PRESS_RATE);
        const { drop, glow } = padPose(model.level);
        model.slab.position.y = -drop;
        model.material.color.copy(model.soft).lerp(model.full, glow);
        // A pad that cannot be played at the moment (the sequence is playing) is a little dimmer, as the flat pads are.
        if (!enabled) model.material.color.multiplyScalar(0.88);
        model.material.emissive.copy(model.full).multiplyScalar(glow * 0.55);
        model.glow.scale.setScalar(Math.max(0.001, glow * (PAD_SIZE + 2.2)));
        model.glow.material.opacity = glow;
      }
    },
    draw() {
      if (!view) return;
      view.render();
      placeControls();
    },
    dispose() {
      view?.dispose();
      view = null;
    },
  };
}

/** @param {string} hex '#rrggbb' @param {number} alpha @returns {string} A CSS colour for a canvas gradient. */
function toRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
