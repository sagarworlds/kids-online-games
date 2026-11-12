import {
  Mesh, ExtrudeGeometry, Shape, SphereGeometry, PlaneGeometry, CircleGeometry, MeshLambertMaterial, MeshBasicMaterial, AmbientLight, DirectionalLight,
  Color, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, LinearFilter,
} from '../../../engine/three/three.js';
import { Stage3D, disposeObject } from '../../../engine/three/Stage3D.js';
import { createStarfield } from '../../../engine/three/starfield.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { problemToText } from '../logic/hints.js';
import {
  CAMERA_DISTANCE, FOV, STAR_RADIUS, skySize, starPosition, floorLevel, isUrgent, starOutline, halfOf, SLICE_SECONDS, halfMotion, sparkMotion, TEXT_SECONDS,
  risingText, REVEAL_SECONDS, revealOpacity,
} from '../logic/look3d.js';

/**
 * The night sky of Number Ninja in 3D: the stars that fall are chunky gold solids that spin as they fall, with the sum on a plate under each, over a dojo
 * floor. A star that is sliced (a right answer) splits down the middle into two halves that fly apart and fade, in a burst of sparks, with the score
 * floating up; a star that lands cracks a shield and shows its answer on a plate for a moment.
 *
 * It only draws what the play scene tells it: where the stars are each frame (`tick`), which one was hit or landed. All the rules, the input, the pad, the
 * words and the sounds stay in the scene and the page. The camera is fixed (a falling game must not be turned away from the child), looking straight
 * at a sheet of sky; the stars' places on it are the round's own (`logic/look3d.js`).
 *
 * If 3D cannot start, or the graphics are lost, `active` turns false and the scene draws the flat sky on the game canvas again, from the same round.
 *
 * @typedef {import('../logic/round.js').Problem} Problem
 * @typedef {{
 *   el: HTMLElement,
 *   readonly active: boolean,
 *   tick: (dt: number, problems: readonly Problem[]) => void,
 *   hit: (problem: Problem, points: number) => void,
 *   landed: (problem: Problem, text: string) => void,
 *   centre: (text: string|null) => void,
 *   draw: () => void,
 *   dispose: () => void
 * }} StarField3D
 */

const INK = '#1f2544';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
/** How high the plate under a star is, in world units (the text and its frame). */
const PLATE_HEIGHT = 0.95;
const SPARKS = 10;
const STAR_DEPTH = 0.46;

/** The label under a star, drawn on a canvas: white plate, dark text, a red frame and a "!" badge when urgent, pink and red for a revealed answer. */
function plateTexture(text, { urgent = false, bad = false } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `700 40px ${FONT}`;
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const margin = 16;
  const plateW = textWidth + 40;
  const plateH = 64;
  canvas.width = plateW + margin * 2;
  canvas.height = plateH + margin * 2;
  ctx.font = font;
  ctx.beginPath();
  ctx.roundRect(margin, margin, plateW, plateH, 18);
  ctx.fillStyle = bad ? '#fde8e6' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = urgent || bad ? 6 : 4;
  ctx.strokeStyle = urgent || bad ? '#b3261e' : INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, margin + plateH / 2 + 2);
  if (urgent) {
    // The warning badge: a shape and a "!" so the warning does not depend on the red frame.
    ctx.beginPath();
    ctx.arc(margin + plateW - 2, margin, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#b3261e';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText('!', margin + plateW - 2, margin + 1);
  }
  return { texture: finish(canvas), ratio: canvas.width / canvas.height, rows: canvas.height / plateH };
}

/** Big white text with a dark edge (the score that floats up, "Ready…" and "Go!"). */
function outlinedTexture(text, size) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `800 ${size}px ${FONT}`;
  ctx.font = font;
  const pad = Math.ceil(size * 0.3);
  canvas.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.height = Math.ceil(size * 1.3) + pad * 2;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(6, size * 0.16);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return { texture: finish(canvas), ratio: canvas.width / canvas.height };
}

function finish(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
}

function spriteOf({ texture }, ratio, height) {
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(ratio * height, height, 1);
  return sprite;
}

function shapeOf(points) {
  const shape = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

/**
 * @param {{ lanes: number, onContextLost: () => void }} options `lanes` is how many lanes the round has (a plate must fit its lane).
 * @returns {StarField3D}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' when the device cannot do 3D; the caller carries on in 2D.
 */
export function createStarField3D({ lanes, onContextLost }) {
  const container = el('div', { class: 'ninja3d' });
  const reduced = prefersReducedMotion();
  let lost = false;
  let disposed = false;
  const stage = new Stage3D({
    container, background: '#1d2370', fov: FOV, near: 0.1, far: 120, onContextLost: () => giveUp(),
    label: '3D night sky with stars falling. The sums on the stars are also listed on the page.',
  });
  /** The graphics were lost: the picture goes (a dead canvas would hide the flat sky behind it) and the scene is told, so it draws the flat sky again. */
  function giveUp() {
    if (lost || disposed) return;
    lost = true;
    stage.dispose();
    container.hidden = true;
    onContextLost();
  }
  const { scene, camera, quality } = stage;
  camera.position.set(0, 0, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  scene.add(new AmbientLight('#ffffff', Math.PI * 0.75));
  const light = new DirectionalLight('#ffffff', Math.PI * 0.7);
  light.position.set(3, 5, 9);
  scene.add(light, createStarfield({ count: quality.detail === 'low' ? 40 : 90, seed: 77, minRadius: 40, spread: 10, size: 0.6, color: '#dfe6ff' }));

  // The floor is a flat green band across the bottom of the sky with a dark line along its top edge, like the flat sky's.
  const floor = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#2c6e49' }));
  const floorLine = new Mesh(new PlaneGeometry(1, 0.09), new MeshBasicMaterial({ color: INK }));
  const moon = new Mesh(new CircleGeometry(1.7, 32), new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.3 }));
  scene.add(floor, floorLine, moon);

  // One star, and the two halves of one, are made once and shared (the halves are cut from the same outline).
  const outline = starOutline(STAR_RADIUS, STAR_RADIUS * 0.5);
  const extrusion = { depth: STAR_DEPTH, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2 };
  const solid = (points) => { const g = new ExtrudeGeometry(shapeOf(points), extrusion); g.translate(0, 0, -STAR_DEPTH / 2); return g; };
  const geometries = { star: solid(outline), left: solid(halfOf(outline, -1)), right: solid(halfOf(outline, 1)), spark: new SphereGeometry(0.1, 8, 6) };
  const gold = new MeshLambertMaterial({ color: '#ffd23f', emissive: '#7a5200' });
  const white = new MeshBasicMaterial({ color: '#ffffff' });
  const red = new MeshBasicMaterial({ color: '#ff6b5e' });

  /** @type {Map<number, { star: Mesh, plate: Sprite, plateInfo: object, urgentInfo: object|null, urgent: boolean, text: string }>} */
  const stars = new Map();
  /** @type {{ age: number, life: number, update: (age: number) => void, objects: object[] }[]} */
  const effects = [];
  let centre = null;
  let centreText = null;
  let clock = 0;
  let lastAspect = 0;

  const aspect = () => stage.size.width / Math.max(1, stage.size.height);

  /** Fits the floor and the moon to the shape of the picture. */
  function fit(next) {
    lastAspect = next;
    const { width, height } = skySize(next);
    const top = floorLevel(next);
    const bottom = -height / 2 - 0.5;
    floor.scale.set(width * 1.1, top - bottom, 1);
    floor.position.set(0, (top + bottom) / 2, -1);
    floorLine.scale.x = width * 1.1;
    floorLine.position.set(0, top, -0.9);
    moon.position.set(width / 2 - 2.4, height / 2 - 2.4, -8);
  }

  /** Sizes a plate (no wider than its lane) and puts it under a star at the star's place. */
  function placePlate(sprite, info, x, y, z = 0.6) {
    const natural = { w: info.ratio * PLATE_HEIGHT * info.rows, h: PLATE_HEIGHT * info.rows };
    const k = Math.min(1, ((skySize(aspect()).width / lanes) * 0.96) / natural.w);
    sprite.scale.set(natural.w * k, natural.h * k, 1);
    sprite.position.set(x, y - STAR_RADIUS - PLATE_HEIGHT * 0.55, z);
  }

  function makePlate(text, options) {
    const info = plateTexture(text, options);
    const sprite = spriteOf(info, info.ratio, PLATE_HEIGHT * info.rows);
    return { info, sprite };
  }

  function addStar(problem, text) {
    const star = new Mesh(geometries.star, gold);
    const { info, sprite } = makePlate(text, { urgent: false });
    scene.add(star, sprite);
    const entry = { star, plate: sprite, plateInfo: info, plateShown: info, urgentInfo: null, urgent: false, text };
    stars.set(problem.id, entry);
    return entry;
  }

  function removeStar(id) {
    const entry = stars.get(id);
    if (!entry) return null;
    stars.delete(id);
    entry.star.removeFromParent();
    entry.plate.removeFromParent();
    entry.plateInfo.texture.dispose();
    entry.urgentInfo?.texture.dispose();
    entry.plate.material.dispose();
    return entry;
  }

  function addEffect(life, objects, update) {
    for (const object of objects) scene.add(object);
    effects.push({ age: 0, life, objects, update });
  }

  function dropEffect(effect) {
    for (const object of effect.objects) { object.removeFromParent(); disposeObject(object); }
  }

  return {
    el: container,
    get active() { return !lost && !disposed; },

    tick(dt, problems) {
      if (!this.active) return;
      clock += dt;
      const a = aspect();
      if (Math.abs(a - lastAspect) > 0.005) fit(a);
      const live = new Set();
      for (const problem of problems) {
        live.add(problem.id);
        const entry = stars.get(problem.id) ?? addStar(problem, problemToText(problem));
        const { x, y } = starPosition(problem, a);
        entry.star.position.set(x, y, 0);
        // Spinning as it falls is what makes it a solid; with less motion it keeps a turned-away pose so that it still looks solid.
        entry.star.rotation.y = reduced ? 0.45 : clock * 1.6 + problem.id;
        entry.star.rotation.z = reduced ? 0 : Math.sin(clock * 2.2 + problem.id) * 0.08;
        const urgent = isUrgent(problem.y);
        if (urgent !== entry.urgent) {
          entry.urgent = urgent;
          if (urgent && !entry.urgentInfo) entry.urgentInfo = plateTexture(entry.text, { urgent: true });
          const info = urgent ? entry.urgentInfo : entry.plateInfo;
          entry.plate.material.map = info.texture;
          entry.plate.material.needsUpdate = true;
          entry.plateShown = info;
        }
        placePlate(entry.plate, entry.plateShown, x, y);
      }
      // A star the round no longer has (it was hit or landed, and its effect has been started) is not kept.
      for (const id of [...stars.keys()]) if (!live.has(id)) removeStar(id);

      for (const effect of effects) { effect.age += dt; effect.update(Math.min(effect.age, effect.life)); }
      for (let i = effects.length - 1; i >= 0; i--) {
        if (effects[i].age >= effects[i].life) { dropEffect(effects[i]); effects.splice(i, 1); }
      }
    },

    hit(problem, points) {
      if (!this.active) return;
      const a = aspect();
      const { x, y } = starPosition(problem, a);
      removeStar(problem.id);
      // The score floats up (or, with less motion, stays and fades).
      const info = outlinedTexture(`✔ +${points}`, 56);
      const label = spriteOf(info, info.ratio, 0.95);
      label.position.set(x, y, 1);
      addEffect(TEXT_SECONDS, [label], (age) => {
        const { y: rise, opacity } = risingText(age, reduced);
        label.position.y = y + rise;
        label.material.opacity = opacity;
      });
      if (reduced) return; // no slicing or sparks for a child who asked for less motion
      const halves = [-1, 1].map((side) => {
        const half = new Mesh(side < 0 ? geometries.left : geometries.right, gold.clone());
        half.material.transparent = true;
        half.position.set(x, y, 0);
        return { side, half };
      });
      addEffect(SLICE_SECONDS, halves.map((h) => h.half), (age) => {
        for (const { side, half } of halves) {
          const m = halfMotion(side, age);
          half.position.set(x + m.x, y + m.y, 0);
          half.rotation.z = m.rotation;
          half.material.opacity = m.opacity;
        }
      });
      const sparks = Array.from({ length: SPARKS }, (_, i) => ({ angle: (i / SPARKS) * Math.PI * 2, mesh: new Mesh(geometries.spark, white) }));
      addEffect(0.5, sparks.map((s) => s.mesh), (age) => {
        for (const { angle, mesh } of sparks) {
          const m = sparkMotion(angle, age);
          mesh.position.set(x + m.x, y + m.y, 0.5);
          mesh.scale.setScalar(m.scale);
        }
      });
    },

    landed(problem, text) {
      if (!this.active) return;
      const a = aspect();
      const { x, y } = starPosition(problem, a);
      removeStar(problem.id);
      // The answer shows on a plate for a moment, so a missed star still teaches the sum.
      const { info, sprite } = makePlate(`✖ ${text}`, { bad: true });
      placePlate(sprite, info, x, y, 0.8);
      addEffect(REVEAL_SECONDS, [sprite], (age) => { sprite.material.opacity = revealOpacity(age); });
      if (reduced) return;
      const burst = Array.from({ length: 7 }, (_, i) => ({ angle: Math.PI * (0.15 + (i / 6) * 0.7), mesh: new Mesh(geometries.spark, red) }));
      addEffect(0.5, burst.map((b) => b.mesh), (age) => {
        for (const { angle, mesh } of burst) {
          const m = sparkMotion(angle, age, 1.8);
          mesh.position.set(x + m.x, y - STAR_RADIUS + m.y, 0.5);
          mesh.scale.setScalar(m.scale);
        }
      });
    },

    centre(text) {
      if (!this.active || text === centreText) return;
      centreText = text;
      if (centre) { centre.removeFromParent(); disposeObject(centre); centre = null; }
      if (!text) return;
      const info = outlinedTexture(text, 110);
      centre = spriteOf(info, info.ratio, 2.2);
      centre.position.set(0, 0.5, 2);
      scene.add(centre);
    },

    draw() {
      if (this.active) stage.render();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stage.dispose();
    },
  };
}
