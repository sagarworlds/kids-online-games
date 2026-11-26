import {
  Group, Mesh, BoxGeometry, IcosahedronGeometry, OctahedronGeometry, SphereGeometry, ConeGeometry, CylinderGeometry, CircleGeometry,
  ExtrudeGeometry, Shape, MeshLambertMaterial, MeshBasicMaterial,
} from '../../../engine/three/three.js';
import { TILE, cellCenter } from '../logic/board3d.js';

/**
 * The pieces of the Robot Path board, built from a few simple shapes (no model files): the floor, rocks, the battery, gems
 * and the robot. Each returns a group (or mesh) standing on the floor with its feet at y = 0, so putting one on a square is
 * just placing it at that square's centre. Shapes, not only colours, carry the meaning, as in the 2D picture: the robot's
 * pointed nose shows which way it faces, a rock is lumpy and solid, the battery has a bolt.
 *
 * @typedef {import('./boardTheme.js').Theme} Theme
 */

const paint = (color, extra = {}) => new MeshLambertMaterial({ color, ...extra });

/** @param {import('../../../engine/three/three.js').BufferGeometry} geometry @param {import('../../../engine/three/three.js').Material} material @param {[number, number, number]} at */
function part(geometry, material, at) {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...at);
  return mesh;
}

/**
 * The floor: one tile for each square in a checker pattern (so squares are easy to count), on a dark frame.
 * @param {import('../logic/levels.js').Level} level
 * @param {Theme} theme
 * @returns {Group}
 */
export function createFloor(level, theme) {
  const [cols, rows] = level.size;
  const floor = new Group();
  const tile = new BoxGeometry(TILE * 0.96, 0.2, TILE * 0.96);
  const materials = [paint(theme.tileA), paint(theme.tileB)];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const at = cellCenter(x, y, level.size);
      floor.add(part(tile, materials[(x + y) % 2], [at.x, -0.1, at.z]));
    }
  }
  floor.add(part(new BoxGeometry(cols * TILE + 0.4, 0.16, rows * TILE + 0.4), paint(theme.line), [0, -0.28, 0]));
  return floor;
}

/** A lumpy grey rock: a flat-shaded ball that is not quite round, turned a different way on each square. @param {number} turn @param {Theme} theme */
export function createRock(turn, theme) {
  const rock = new Mesh(new IcosahedronGeometry(0.42, 0), paint(theme.rock, { flatShading: true }));
  rock.scale.set(1, 0.85, 1);
  rock.position.y = 0.32;
  rock.rotation.y = turn;
  return rock;
}

/**
 * The goal: a yellow battery with a lightning bolt on the side that faces the viewer. `userData.charge()` turns it green.
 * @returns {Group}
 */
export function createBattery() {
  const battery = new Group();
  const bodyMaterial = paint('#ffd23f');
  battery.add(
    part(new BoxGeometry(0.5, 0.72, 0.34), bodyMaterial, [0, 0.36, 0]),
    part(new BoxGeometry(0.22, 0.1, 0.16), paint('#ffffff'), [0, 0.77, 0]),
  );
  // The bolt, drawn flat and given a little thickness; the same shape as in the 2D picture, turned right way up.
  const bolt = new Shape();
  [[5, 18], [-13, -8], [-2, -8], [-7, -26], [14, 4], [3, 4]].forEach(([x, y], i) => (i === 0 ? bolt.moveTo(x * 0.02, y * 0.02) : bolt.lineTo(x * 0.02, y * 0.02)));
  bolt.closePath();
  const mark = new Mesh(new ExtrudeGeometry(bolt, { depth: 0.04, bevelEnabled: false }), paint('#1f2544'));
  mark.position.set(0, 0.36, 0.17);
  battery.add(mark);
  battery.userData.charge = () => bodyMaterial.color.set('#3ec46d');
  battery.userData.discharge = () => bodyMaterial.color.set('#ffd23f');
  return battery;
}

/** A turquoise gem standing on one point. @returns {Mesh} */
export function createGem() {
  const gem = new Mesh(new OctahedronGeometry(0.2, 0), paint('#4de1d0', { emissive: '#1b6b62' }));
  gem.scale.y = 1.5;
  gem.position.y = 0.45;
  return gem;
}

/**
 * The robot, built facing -z (North on the board): a chassis in the world's colour, two eyes and a pointed nose that show
 * which way it looks (so the child sees "its own left and right"), wheels, an antenna and a soft shadow on the floor.
 *
 * @param {Theme} theme
 * @param {{ detail: 'low'|'high' }} quality
 * @returns {{ root: Group, body: Group }} `root` is moved and turned about the vertical axis; `body` is what hops, leans and
 *   squashes (the shadow stays on the floor in `root`).
 */
export function createRobot(theme, { detail }) {
  const sides = detail === 'high' ? 14 : 8;
  const root = new Group();
  const body = new Group();
  const wheel = new CylinderGeometry(0.13, 0.13, 0.1, sides);
  const wheelMaterial = paint(theme.line);
  const leftWheel = part(wheel, wheelMaterial, [-0.34, 0.13, 0.05]);
  const rightWheel = part(wheel, wheelMaterial, [0.34, 0.13, 0.05]);
  leftWheel.rotation.z = rightWheel.rotation.z = Math.PI / 2;
  const nose = part(new ConeGeometry(0.16, 0.34, 4), paint(theme.nose), [0, 0.76, -0.2]);
  nose.rotation.x = -Math.PI / 2; // a cone points up by default; this lays it down pointing forward (-z)
  const eye = new SphereGeometry(0.075, sides, 6);
  const pupil = new SphereGeometry(0.036, sides, 6);
  body.add(
    leftWheel, rightWheel,
    part(new BoxGeometry(0.62, 0.5, 0.62), paint(theme.shell), [0, 0.43, 0]),
    part(new BoxGeometry(0.46, 0.26, 0.04), paint('#ffffff'), [0, 0.52, -0.31]),
    part(eye, paint('#ffffff'), [-0.12, 0.54, -0.33]), part(eye, paint('#ffffff'), [0.12, 0.54, -0.33]),
    part(pupil, paint(theme.line), [-0.12, 0.54, -0.39]), part(pupil, paint(theme.line), [0.12, 0.54, -0.39]),
    nose,
    part(new CylinderGeometry(0.02, 0.02, 0.2, 4), paint(theme.line), [0.2, 0.78, 0.2]),
    part(new SphereGeometry(0.05, sides, 6), paint('#ff5d8f'), [0.2, 0.9, 0.2]),
  );
  // A flat dark disc under the robot: a cheap "blob" shadow, since the 3D rules allow no shadow maps.
  const shadow = new Mesh(new CircleGeometry(0.42, sides), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  root.add(shadow, body);
  return { root, body };
}
