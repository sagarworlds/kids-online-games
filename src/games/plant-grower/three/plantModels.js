import {
  Group, Mesh, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial,
} from '../../../engine/three/three.js';

/**
 * The plants, the pot and the weather's small parts, built from simple shapes (no model files). Each plant is a recipe in the same shape as
 * the flat pictures in `ui/PlantArt.js`: a stem that grows taller with each stage, and parts (leaves, buds, flowers, fruit) that appear at a
 * stage and, for some, go again at a later one (a green fruit becomes a red one). A part that sits along the stem (a cactus's spines) has a
 * `fit(growth)` that moves it to where the stem has reached, so it never hangs in the air above a short plant.
 *
 * @typedef {{
 *   group: Group,
 *   stem: Mesh,
 *   height: number,
 *   parts: { at: number, until?: number, object: Group, fit?: (growth: number) => void }[],
 *   leaves: { pivot: Group, side: number, up: number }[],
 *   leafMaterials: MeshLambertMaterial[]
 * }} PlantModel `height` is the stem's full height; `leaves` can droop (`up` is how far each points up when healthy); `leafMaterials` change
 *   colour when something is wrong.
 */

const lambert = (color) => new MeshLambertMaterial({ color });
/** How far above flat a healthy leaf points, in radians (about 20 degrees). */
const LEAF_UP = 0.35;

/** @param {import('../../../engine/three/three.js').BufferGeometry} geometry @param {import('../../../engine/three/three.js').Material} material @param {[number, number, number]} at */
function mesh(geometry, material, at = [0, 0, 0]) {
  const m = new Mesh(geometry, material);
  m.position.set(...at);
  return m;
}

/** A recipe's working state: the plant's group plus what the recipe adds to it. */
function start(stemColor, radius, height) {
  const stem = mesh(new CylinderGeometry(radius * 0.8, radius, 1, 8), lambert(stemColor), [0, 0.5, 0]);
  const group = new Group();
  group.add(stem);
  return { group, stem, height, parts: [], leaves: [], leafMaterials: [] };
}

/** A pair of leaves at a height: each is a flat oval on a pivot at the stem, so tipping the pivot droops the leaf. */
function leafPair(model, y, size, color, at) {
  const material = lambert(color);
  model.leafMaterials.push(material);
  const pair = new Group();
  pair.position.y = y;
  const oval = new SphereGeometry(1, 10, 6);
  for (const side of [-1, 1]) {
    const pivot = new Group();
    const leaf = mesh(oval, material, [side * size * 0.55, 0, 0]);
    leaf.scale.set(size * 0.55, size * 0.07, size * 0.26);
    pivot.add(leaf);
    // A turn about z by +angle lifts a leaf on the right and, by -angle, a leaf on the left: so "up" is the angle times the side.
    pivot.rotation.z = side * LEAF_UP;
    model.leaves.push({ pivot, side, up: LEAF_UP });
    pair.add(pivot);
  }
  model.parts.push({ at, object: pair });
}

/** Stretches a mesh along y (an oval ear of rice is a ball stretched upwards). */
const stretchY = (m, k) => { m.scale.y = k; return m; };

const ring = (count, make) => Array.from({ length: count }, (_, i) => make((i / count) * Math.PI * 2));

/** @returns {PlantModel} */
function sunflower() {
  const model = start('#4c9a2a', 0.11, 3.2);
  [[1, 0.5, 0.9, '#6dbb45'], [2, 1.0, 1.0, '#4caf50'], [3, 1.6, 1.2, '#4caf50'], [4, 2.2, 1.1, '#43a047']].forEach(([at, y, size, color]) => leafPair(model, y, size, color, at));
  const head = new Group();
  head.position.y = 3.2;
  head.rotation.x = Math.PI / 2 - 0.3; // the face of the flower looks forward and a little up
  const disc = mesh(new CylinderGeometry(0.5, 0.5, 0.16, 18), lambert('#7a4a21'));
  head.add(disc, ...ring(14, (angle) => {
    const petal = mesh(new SphereGeometry(1, 8, 6), lambert('#ffd23f'), [Math.cos(angle) * 0.75, 0.04, Math.sin(angle) * 0.75]);
    petal.scale.set(0.34, 0.06, 0.2);
    petal.rotation.y = -angle;
    return petal;
  }));
  const bud = new Group();
  bud.position.y = 3.2;
  bud.add(mesh(new SphereGeometry(0.34, 10, 8), lambert('#5aa832')), mesh(new ConeGeometry(0.2, 0.4, 8), lambert('#4c9a2a'), [0, 0.3, 0]));
  const seeds = new Group();
  seeds.position.y = 3.2;
  seeds.rotation.x = Math.PI / 2 - 0.3;
  [[-0.2, -0.1], [0.2, -0.1], [0, 0.12], [-0.25, 0.22], [0.25, 0.22], [0, -0.3]].forEach(([x, z]) => seeds.add(mesh(new SphereGeometry(0.05, 6, 4), lambert('#3e2511'), [x, 0.1, z])));
  model.parts.push({ at: 5, until: 6, object: bud }, { at: 6, object: head }, { at: 7, object: seeds });
  return model;
}

/** @returns {PlantModel} */
function tomato() {
  const model = start('#5d8f2a', 0.09, 2.6);
  [[1, 0.5, 0.85, '#7cb342'], [2, 0.95, 0.95, '#689f38'], [3, 1.4, 1.05, '#7cb342'], [4, 1.85, 1.0, '#689f38']].forEach(([at, y, size, color]) => leafPair(model, y, size, color, at));
  const spots = [[-0.7, 0.85], [0.75, 1.3], [-0.65, 1.75], [0.55, 0.6]];
  const flowers = new Group();
  const green = new Group();
  const ripe = new Group();
  spots.slice(0, 3).forEach(([x, y]) => {
    flowers.add(mesh(new SphereGeometry(0.13, 8, 6), lambert('#fdd835'), [x, y, 0]));
    green.add(mesh(new SphereGeometry(0.2, 10, 8), lambert('#8bc34a'), [x, y, 0]));
  });
  spots.forEach(([x, y]) => {
    ripe.add(mesh(new SphereGeometry(0.27, 12, 10), lambert('#e53935'), [x, y, 0]));
    ripe.add(mesh(new ConeGeometry(0.14, 0.1, 6), lambert('#4caf50'), [x, y + 0.26, 0]));
  });
  model.parts.push({ at: 5, until: 6, object: flowers }, { at: 6, until: 7, object: green }, { at: 7, object: ripe });
  return model;
}

/** @returns {PlantModel} */
function cactus() {
  const model = start('#3f9b55', 0.5, 2.3);
  model.stem.geometry.dispose();
  model.stem.geometry = new CylinderGeometry(0.48, 0.52, 1, 14);
  const spines = new Group();
  const spineHeights = [0.5, 0.9, 1.3, 1.7, 2.0];
  [[0.1, 0.5, 0.5], [-0.15, 0.9, 0.48], [0.2, 1.3, 0.46], [-0.1, 1.7, 0.42], [0.05, 2.0, 0.34]].forEach(([x, y, z]) => spines.add(mesh(new ConeGeometry(0.04, 0.2, 4), lambert('#e8f5e9'), [x, y, z]).rotateX(Math.PI / 2)));
  // The heights above are for the full-grown cactus; a shorter one gets them squeezed in proportion.
  const fitSpines = (growth) => spines.children.forEach((spine, i) => { spine.position.y = spineHeights[i] * growth; });
  const arm = (side, y) => {
    const g = new Group();
    g.add(mesh(new CylinderGeometry(0.2, 0.2, 0.7, 10), lambert('#3f9b55'), [side * 0.6, y, 0]).rotateZ(Math.PI / 2), mesh(new CylinderGeometry(0.2, 0.2, 0.8, 10), lambert('#3f9b55'), [side * 0.95, y + 0.4, 0]));
    g.add(mesh(new SphereGeometry(0.2, 10, 8), lambert('#3f9b55'), [side * 0.95, y + 0.8, 0]));
    return g;
  };
  const flower = new Group();
  flower.position.y = 2.3;
  flower.add(...ring(8, (a) => mesh(new SphereGeometry(0.16, 6, 4), lambert('#ff80ab'), [Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22])), mesh(new SphereGeometry(0.12, 8, 6), lambert('#ffeb3b'), [0, 0.15, 0]));
  const fruit = new Group();
  [[-0.95, 1.9], [0.95, 2.1], [0, 2.55]].forEach(([x, y]) => fruit.add(mesh(new SphereGeometry(0.15, 8, 6), lambert('#e53935'), [x, y, 0])));
  model.parts.push({ at: 2, object: spines, fit: fitSpines }, { at: 4, object: arm(-1, 1.0) }, { at: 5, object: arm(1, 1.3) }, { at: 6, object: flower }, { at: 7, object: fruit });
  return model;
}

/** @returns {PlantModel} */
function rice() {
  const model = start('#7cb342', 0.05, 2.6);
  const stalk = (lean, at) => {
    const g = new Group();
    const s = mesh(new CylinderGeometry(0.035, 0.05, 2.2, 6), lambert('#8bc34a'), [lean * 0.55, 1.1, 0]);
    s.rotation.z = -lean * 0.48;
    g.add(s);
    model.parts.push({ at, object: g });
    return g;
  };
  stalk(-1, 3);
  stalk(1, 3);
  [[2, 0.55, 0.9, '#9ccc65'], [4, 1.2, 1.15, '#8bc34a']].forEach(([at, y, size, color]) => leafPair(model, y, size, color, at));
  const tips = [[0, 2.6], [-1.17, 2.15], [1.17, 2.15]];
  const green = new Group();
  const full = new Group();
  const golden = new Group();
  tips.forEach(([x, y]) => {
    green.add(stretchY(mesh(new SphereGeometry(0.1, 6, 5), lambert('#c5e1a5'), [x, y, 0]), 3));
    full.add(stretchY(mesh(new SphereGeometry(0.12, 6, 5), lambert('#aed581'), [x, y, 0]), 3.3));
    golden.add(stretchY(mesh(new SphereGeometry(0.14, 6, 5), lambert('#f9c846'), [x + (x >= 0 ? 0.25 : -0.25), y - 0.25, 0]), 3));
  });
  model.parts.push({ at: 5, until: 6, object: green }, { at: 6, until: 7, object: full }, { at: 7, object: golden });
  return model;
}

/** A plant with no recipe (one added to the data file) is a plain green stem, so the game still works. @returns {PlantModel} */
const plain = () => start('#4c9a2a', 0.1, 2.4);

const RECIPES = { sunflower, tomato, cactus, rice };

/** @param {string} id @returns {PlantModel} */
export const buildPlant = (id) => (RECIPES[id] ?? plain)();

/**
 * The pot, with its soil, a face on the front, and a puddle for too much water. `face` has a mouth for each mood (only one shows).
 * @returns {{ group: Group, soil: MeshLambertMaterial, mouths: Record<'happy'|'ok'|'wilting', Mesh>, puddle: Mesh }}
 */
export function buildPot() {
  const group = new Group();
  group.add(
    mesh(new CylinderGeometry(1.0, 0.78, 1.1, 24), lambert('#b5651d'), [0, 0.55, 0]),
    mesh(new CylinderGeometry(1.12, 1.12, 0.22, 24), lambert('#c97a30'), [0, 1.15, 0]),
  );
  const soilMaterial = lambert('#5a3a22');
  // A little above the rim's flat top, so the two never fight over the same pixels.
  group.add(mesh(new CylinderGeometry(0.98, 0.98, 0.04, 24), soilMaterial, [0, 1.28, 0]));
  const dark = lambert('#3e2511');
  const eye = new SphereGeometry(0.07, 8, 6);
  // The pot narrows towards the bottom, so the face is placed on the wall at each height (otherwise the mouth sinks into the pot).
  const wall = (y) => 0.78 + 0.22 * (y / 1.1) + 0.01;
  group.add(mesh(eye, dark, [-0.28, 0.7, wall(0.7)]), mesh(eye, dark, [0.28, 0.7, wall(0.7)]));
  const mouths = {
    happy: mesh(new TorusGeometry(0.22, 0.03, 6, 14, Math.PI), dark, [0, 0.56, wall(0.56)]),
    ok: mesh(new BoxGeometry(0.4, 0.05, 0.05), dark, [0, 0.46, wall(0.46)]),
    wilting: mesh(new TorusGeometry(0.22, 0.03, 6, 14, Math.PI), dark, [0, 0.4, wall(0.4)]),
  };
  mouths.happy.rotation.z = Math.PI; // the open side of the arc faces up: a smile
  for (const m of Object.values(mouths)) { m.visible = false; group.add(m); }
  const puddle = mesh(new CylinderGeometry(2.0, 2.0, 0.03, 28), new MeshBasicMaterial({ color: '#3b8fe0', transparent: true, opacity: 0.8 }), [0, 0.02, 0]);
  puddle.visible = false;
  group.add(puddle);
  return { group, soil: soilMaterial, mouths, puddle };
}

/**
 * A cloud: a few overlapping white balls.
 * @param {number} size
 * @returns {Group}
 */
export function buildCloud(size) {
  const cloud = new Group();
  const puff = new SphereGeometry(1, 10, 8);
  const material = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 });
  for (const [x, y, s] of [[0, 0, 1], [1.1, 0.25, 0.8], [-1.05, 0.15, 0.75], [0.35, 0.55, 0.7]]) {
    const ball = new Mesh(puff, material);
    ball.position.set(x * size, y * size, 0);
    ball.scale.setScalar(s * size);
    cloud.add(ball);
  }
  return cloud;
}
