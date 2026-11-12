import {
  Group, Mesh, CylinderGeometry, TorusGeometry, SphereGeometry, BoxGeometry, MeshLambertMaterial,
} from '../../../engine/three/three.js';
import { PIZZA_RADIUS, CHEESE_RADIUS, sliceAngle, sliceTurn, flagDashAngles, spotPosition } from '../logic/look3d.js';
import { toppingSpots } from '../logic/toppingSpots.js';

/**
 * The pizza and its toppings, built from simple shapes (no model files). Every slice is the same shape, built pointing forwards (towards -z)
 * and then turned into its place; the geometry and the materials are made once for a pizza (`createPizzaKit`) and shared by all its slices
 * and pieces, so a twelve-slice pizza costs little more than a two-slice one.
 *
 * @typedef {ReturnType<typeof createPizzaKit>} PizzaKit
 * @typedef {{ group: Group, lifter: Group, toppings: Group, dashes: Group, pickable: Mesh[] }} SliceModel `group` is turned to the
 *   slice's place; `lifter` is what lifts and tips (about the pizza's centre end); `toppings` holds the pieces; `dashes` the red marks.
 */

/** A slice is a little narrower than its share of the circle, so there is a thin gap between slices and the cuts can be seen. */
const GAP = 0.96;
const DOUGH_HEIGHT = 0.22;
const CHEESE_HEIGHT = 0.1;
const paint = (color) => new MeshLambertMaterial({ color });

/**
 * The shared geometry and materials for a pizza cut into `count` slices.
 * @param {number} count
 * @param {{ detail: 'high'|'medium'|'low' }} quality From the stage: fewer curve segments on a weak device.
 */
export function createPizzaKit(count, quality = { detail: 'high' }) {
  const angle = sliceAngle(count) * GAP;
  // About one segment for every 7.5 degrees of the whole pizza (fewer on a weak device), so the edge looks round at any number of slices.
  const segments = Math.max(2, Math.ceil((quality.detail === 'low' ? 30 : 48) / count));
  const start = Math.PI - angle / 2; // the slice is centred on 'forwards' (-z), which is theta = PI in a cylinder's own terms
  const piece = quality.detail === 'low' ? 10 : 16;
  return {
    count, angle,
    dough: new CylinderGeometry(PIZZA_RADIUS - 0.05, PIZZA_RADIUS - 0.05, DOUGH_HEIGHT, segments, 1, false, start, angle),
    cheese: new CylinderGeometry(CHEESE_RADIUS, CHEESE_RADIUS, CHEESE_HEIGHT, segments, 1, false, start, angle),
    crust: new TorusGeometry(PIZZA_RADIUS - 0.22, 0.24, 8, segments, angle),
    dash: new BoxGeometry(0.34, 0.12, 0.14),
    materials: { dough: paint('#e8b86d'), cheese: paint('#ffe7a0'), crust: paint('#d9983f'), flag: paint('#e53935') },
    pieces: {
      pepperoni: { disc: new CylinderGeometry(0.36, 0.36, 0.09, piece), dot: new CylinderGeometry(0.06, 0.06, 0.02, 8), red: paint('#c62828'), dark: paint('#6d0f0f') },
      olive: { ring: new TorusGeometry(0.21, 0.1, 8, piece), black: paint('#2f3b2f') },
      mushroom: { stem: new CylinderGeometry(0.1, 0.13, 0.24, 8), cap: new SphereGeometry(0.34, piece, 8, 0, Math.PI * 2, 0, Math.PI / 2), cream: paint('#f1e0cc'), brown: paint('#bf936b') },
      cheese: { prism: new CylinderGeometry(0.38, 0.38, 0.1, 3), dot: new CylinderGeometry(0.05, 0.05, 0.02, 8), yellow: paint('#ffc400'), dark: paint('#8a6a00') },
    },
  };
}

const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };
/** Lays a shape that is built standing up (a ring round the z axis) flat on the cheese. */
const lying = (mesh) => { mesh.rotation.x = Math.PI / 2; return mesh; };

/** The pieces of each topping, built around (0, 0, 0) lying on the cheese. Each has its own shape as well as its colour. */
const BUILDERS = {
  pepperoni: ({ disc, dot, red, dark }) => [at(new Mesh(disc, red), 0, 0.045, 0), at(new Mesh(dot, dark), -0.13, 0.1, -0.08), at(new Mesh(dot, dark), 0.12, 0.1, 0.1)],
  olive: ({ ring, black }) => [at(lying(new Mesh(ring, black)), 0, 0.1, 0)],
  mushroom: ({ stem, cap, cream, brown }) => [at(new Mesh(stem, cream), 0, 0.12, 0), at(new Mesh(cap, brown), 0, 0.22, 0)],
  cheese: ({ prism, dot, yellow, dark }) => [at(new Mesh(prism, yellow), 0, 0.05, 0), at(new Mesh(dot, dark), -0.1, 0.11, 0.05), at(new Mesh(dot, dark), 0.12, 0.11, -0.08)],
};

/**
 * One piece of a topping, placed in a slice's own frame.
 * @param {PizzaKit} kit
 * @param {string} kind A key of the toppings above.
 * @param {import('../logic/toppingSpots.js').ToppingSpot} spot
 * @param {number} index Slice (marked on the piece so a tap on it finds its slice).
 * @returns {Group|null} Null for a topping the 3D pizza has no shape for (the flat pizza ignores those too).
 */
export function buildPiece(kit, kind, spot, index) {
  const build = BUILDERS[kind];
  if (!build) return null;
  const piece = new Group();
  for (const part of build(kit.pieces[kind])) piece.add(part);
  const { x, z } = spotPosition(spot, kit.count, CHEESE_RADIUS);
  piece.position.set(x, DOUGH_HEIGHT + CHEESE_HEIGHT, z);
  piece.rotation.y = (spot.spin * Math.PI) / 180;
  piece.scale.setScalar(spot.scale);
  piece.traverse((node) => { node.userData.slice = index; });
  return piece;
}

/**
 * Fills a slice's `toppings` group with the pieces of one topping (or empties it).
 * @param {PizzaKit} kit
 * @param {SliceModel} slice
 * @param {number} index
 * @param {string|null} kind
 */
export function setSliceTopping(kit, slice, index, kind) {
  slice.toppings.clear();
  slice.pickable.length = 3; // the dough, the cheese and the crust stay; the old pieces go
  if (!kind) return;
  for (const spot of toppingSpots(index, kit.count, CHEESE_RADIUS)) {
    const piece = buildPiece(kit, kind, spot, index);
    if (!piece) continue;
    slice.toppings.add(piece);
    piece.traverse((node) => { if (node.isMesh) slice.pickable.push(node); });
  }
}

/**
 * One slice: dough, cheese and crust, an empty place for toppings and the red dashes that flag it.
 * @param {PizzaKit} kit
 * @param {number} index
 * @returns {SliceModel}
 */
export function buildSlice(kit, index) {
  const group = new Group();
  group.rotation.y = sliceTurn(index, kit.count);
  const lifter = new Group();
  group.add(lifter);

  const dough = at(new Mesh(kit.dough, kit.materials.dough), 0, DOUGH_HEIGHT / 2, 0);
  const cheese = at(new Mesh(kit.cheese, kit.materials.cheese), 0, DOUGH_HEIGHT + CHEESE_HEIGHT / 2, 0);
  const crust = new Mesh(kit.crust, kit.materials.crust);
  // The torus is built standing up round the z axis; lay it flat and turn it to start where the slice does (see the notes in look3d.js).
  crust.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - kit.angle / 2);
  crust.position.y = 0.2;
  lifter.add(dough, cheese, crust);

  const toppings = new Group();
  lifter.add(toppings);

  // Red dashes along the outer edge, which only show while the slice is flagged: a mark that is a shape, not just a colour.
  const dashes = new Group();
  for (const a of flagDashAngles(kit.count)) {
    const dash = new Mesh(kit.dash, kit.materials.flag);
    const r = PIZZA_RADIUS + 0.38;
    dash.position.set(r * Math.sin(a), 0.32, -r * Math.cos(a));
    dash.rotation.y = -a; // the dash lies along the edge
    dashes.add(dash);
  }
  dashes.visible = false;
  lifter.add(dashes);

  const pickable = [dough, cheese, crust];
  for (const mesh of pickable) mesh.userData.slice = index;
  return { group, lifter, toppings, dashes, pickable };
}

/** A round plate under the pizza, and the table. @returns {Group} */
export function buildTable() {
  const table = new Group();
  const plate = at(new Mesh(new CylinderGeometry(PIZZA_RADIUS + 0.75, PIZZA_RADIUS + 0.6, 0.12, 40), paint('#cdd8e2')), 0, -0.06, 0);
  const top = at(new Mesh(new CylinderGeometry(28, 28, 0.2, 48), paint('#b9824a')), 0, -0.22, 0);
  table.add(top, plate);
  return table;
}
