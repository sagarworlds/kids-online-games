import {
  Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, IcosahedronGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial,
  CanvasTexture, SRGBColorSpace, NearestFilter,
} from '../../../engine/three/three.js';
import { createRng } from '../../../engine/utils/random.js';
import {
  ROAD_LENGTH, LEAD_IN, RUN_OFF, LANE_WIDTH, ROAD_HALF_WIDTH, tickZ,
} from '../logic/track3d.js';

/**
 * The pieces of the 3D race track, built from simple shapes and a tiny canvas picture (no model files): the road with its
 * lanes, kerbs, start line, a post for each question and the chequered finish gate, trees, hills and clouds, and the cars.
 * The cars face -z (down the road); the scenery is fixed, and only the cars and the camera move.
 */

const paint = (color, extra = {}) => new MeshLambertMaterial({ color, ...extra });

/** @param {import('../../../engine/three/three.js').BufferGeometry} geometry @param {import('../../../engine/three/three.js').Material} material @param {[number, number, number]} at */
function part(geometry, material, at) {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...at);
  return mesh;
}

/**
 * A car, about 1.6 wide and 3.2 long, nose towards -z. The ghost is the same car drawn see-through, so it is told apart by its
 * see-through look and its "Ghost" label as well as by its grey colour.
 *
 * @param {{ color: string, ghost: boolean, detail: 'low'|'high' }} options
 * @returns {{ root: Group, wheels: Mesh[] }} `wheels` are turned about x to spin them; `root` is placed on the road.
 */
export function createCar({ color, ghost, detail }) {
  const sides = detail === 'high' ? 14 : 8;
  const glass = ghost ? { transparent: true, opacity: 0.42, depthWrite: false } : {};
  const material = (c) => paint(c, glass);
  const root = new Group();
  const wheels = [];
  const wheelGeometry = new CylinderGeometry(0.34, 0.34, 0.26, sides);
  for (const [x, z] of [[-0.82, -1.0], [0.82, -1.0], [-0.82, 1.0], [0.82, 1.0]]) {
    const wheel = part(wheelGeometry, material('#2b2f45'), [x, 0.34, z]);
    wheel.rotation.z = Math.PI / 2; // a cylinder stands up by default; this lays it on its side as a wheel
    root.add(wheel);
    wheels.push(wheel);
  }
  root.add(
    part(new BoxGeometry(1.6, 0.5, 3.2), material(color), [0, 0.62, 0]),
    part(new BoxGeometry(1.2, 0.46, 1.5), material(color), [0, 1.08, 0.25]),
    // The windscreen is on the front of the cabin, which is towards -z.
    part(new BoxGeometry(1.0, 0.3, 0.06), material('#d9f4ff'), [0, 1.1, -0.51]),
    part(new BoxGeometry(0.34, 0.18, 0.06), material('#fff3a8'), [-0.5, 0.7, -1.62]),
    part(new BoxGeometry(0.34, 0.18, 0.06), material('#fff3a8'), [0.5, 0.7, -1.62]),
  );
  return { root, wheels };
}

/**
 * A small orange flame at the back of the car, for a boost. The caller scales it with the boost and hides it at 0 (a cone
 * squashed to nothing along its length would still leave its round base showing).
 * @returns {Mesh}
 */
export function createFlame() {
  const flame = new Mesh(new ConeGeometry(0.28, 1.1, 8), new MeshBasicMaterial({ color: '#ff9a1f' }));
  flame.rotation.x = Math.PI / 2; // a cone points up; this points it backwards (+z)
  flame.position.set(0, 0.65, 2.1);
  flame.scale.set(1, 0.001, 1);
  flame.visible = false;
  return flame;
}

/** A checkerboard strip, drawn in code, for the finish banner. @returns {CanvasTexture} */
function chequered() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : '#1f2544';
      ctx.fillRect(i * 4, j * 4, 4, 4);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter; // keep the squares sharp
  return texture;
}

/**
 * The road and everything fixed beside it.
 * @param {{ count: number, detail: 'low'|'high' }} options `count` is how many questions are in the race (a post stands for each).
 * @returns {Group}
 */
export function createTrack({ count, detail }) {
  const track = new Group();
  const length = LEAD_IN + ROAD_LENGTH + RUN_OFF;
  const middleZ = (LEAD_IN - ROAD_LENGTH - RUN_OFF) / 2;

  track.add(
    part(new PlaneGeometry(400, 400), paint('#7ccb73'), [0, -0.02, middleZ]),
    part(new BoxGeometry(LANE_WIDTH * 2, 0.1, length), paint('#4a4f63'), [0, -0.05, middleZ]),
  );
  track.children[0].rotation.x = -Math.PI / 2;

  // Edge lines, and the dashes between the two lanes.
  const white = paint('#f2f2f2');
  for (const x of [-ROAD_HALF_WIDTH + 0.12, ROAD_HALF_WIDTH - 0.12]) track.add(part(new BoxGeometry(0.14, 0.02, length), white, [x, 0.01, middleZ]));
  const dash = new BoxGeometry(0.14, 0.02, 1.4);
  for (let z = LEAD_IN - 1; z > -ROAD_LENGTH - RUN_OFF; z -= 3.2) track.add(part(dash, white, [0, 0.01, z]));

  // Red and white kerbs along both edges.
  const kerb = new BoxGeometry(0.4, 0.08, 2);
  const red = paint('#e63946');
  for (let i = 0, z = LEAD_IN - 1; z > -ROAD_LENGTH - RUN_OFF; z -= 2, i++) {
    for (const x of [-ROAD_HALF_WIDTH - 0.2, ROAD_HALF_WIDTH + 0.2]) track.add(part(kerb, i % 2 ? white : red, [x, 0.0, z]));
  }

  // The start line, and a small post for each question on the right-hand side.
  track.add(part(new BoxGeometry(LANE_WIDTH * 2, 0.03, 0.4), white, [0, 0.015, 0]));
  const post = new BoxGeometry(0.16, 1.1, 0.16);
  const marker = new SphereGeometry(0.2, 8, 6);
  for (let i = 1; i < count; i++) {
    const z = tickZ(i, count);
    track.add(part(post, paint('#ffffff'), [ROAD_HALF_WIDTH + 1.1, 0.55, z]), part(marker, paint('#ffd23f'), [ROAD_HALF_WIDTH + 1.1, 1.25, z]));
  }

  // The finish: a chequered strip across the road, and a gate of two posts with a chequered banner over it.
  const gateZ = -ROAD_LENGTH;
  const stripe = chequered();
  track.add(
    part(new BoxGeometry(LANE_WIDTH * 2, 0.03, 0.8), new MeshBasicMaterial({ map: stripe }), [0, 0.02, gateZ]),
    part(new BoxGeometry(0.4, 4.4, 0.4), paint('#1f2544'), [-ROAD_HALF_WIDTH - 0.9, 2.2, gateZ]),
    part(new BoxGeometry(0.4, 4.4, 0.4), paint('#1f2544'), [ROAD_HALF_WIDTH + 0.9, 2.2, gateZ]),
    part(new BoxGeometry(ROAD_HALF_WIDTH * 2 + 1.8, 1.1, 0.12), new MeshBasicMaterial({ map: stripe }), [0, 4.0, gateZ]),
  );

  // Trees along both sides, in places that are the same every race (a seeded generator), and some hills and clouds far off.
  const rng = createRng(77);
  const trunk = new CylinderGeometry(0.18, 0.24, 1.2, 6);
  const leaves = new ConeGeometry(1.0, 2.6, detail === 'high' ? 8 : 6);
  const trees = detail === 'high' ? 56 : 30;
  for (let i = 0; i < trees; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (ROAD_HALF_WIDTH + 3.5 + rng() * 14);
    const z = LEAD_IN - rng() * (LEAD_IN + ROAD_LENGTH + RUN_OFF);
    const tree = new Group();
    tree.add(part(trunk, paint('#7b5a3c'), [0, 0.6, 0]), part(leaves, paint(i % 3 ? '#2f9e5a' : '#3fb86a'), [0, 2.4, 0]));
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.8 + rng() * 0.7);
    track.add(tree);
  }
  for (let i = 0; i < 5; i++) {
    const hill = part(new IcosahedronGeometry(14 + rng() * 10, 1), paint(i % 2 ? '#6bb86a' : '#9ad48a'), [(i % 2 ? 1 : -1) * (70 + rng() * 40), 2, -10 - i * 28]);
    hill.scale.y = 0.55;
    track.add(hill);
  }
  const cloud = new SphereGeometry(3, 8, 6);
  const cloudMaterial = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
  for (let i = 0; i < 7; i++) {
    const group = new Group();
    for (const [dx, dy, dz, s] of [[0, 0, 0, 1], [3.2, 0.6, 0.4, 0.8], [-3, 0.2, -0.3, 0.7]]) {
      const puff = part(cloud, cloudMaterial, [dx, dy, dz]);
      puff.scale.setScalar(s);
      group.add(puff);
    }
    group.position.set((i % 2 ? 1 : -1) * (20 + rng() * 40), 24 + rng() * 8, -rng() * 130);
    track.add(group);
  }
  return track;
}
