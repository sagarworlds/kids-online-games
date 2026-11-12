import {
  Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, CircleGeometry, EdgesGeometry, LineSegments, LineBasicMaterial,
  MeshLambertMaterial, MeshBasicMaterial, AmbientLight, DirectionalLight,
} from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { disposeObject } from '../../../engine/three/Stage3D.js';
import { el } from '../../../engine/utils/dom.js';
import { createRng } from '../../../engine/utils/random.js';
import {
  FLOOR_HEIGHT, FLOOR_WIDTH, floorBase, floorCenterY, towerHeight, focusIndex, climbFraming, wholeTowerFraming,
} from '../logic/tower3d.js';

/**
 * The tower on the menu, in 3D: one floor for each times table of the chosen level, built (green) when its Challenge is passed, the
 * floor being worked on in gold with a flag, and the floors still to come as empty frames so the child can see how tall the tower
 * will be. The camera climbs up to the floor being worked on, and a tap on a floor opens it.
 *
 * It only shows what the menu tells it. Which floors are open, and what a tap on one does, are the game's rules (`logic/levels.js`
 * and the menu scene), the same as for the list of floors under the picture.
 *
 * @typedef {import('../logic/tower3d.js').FloorState} FloorState
 * @typedef {{
 *   el: HTMLElement,
 *   setLevel: (level: { floors: readonly number[], states: readonly FloorState[] }) => void,
 *   climb: () => void,
 *   showWholeTower: () => void,
 *   update: (dt: number) => void,
 *   render: () => void,
 *   dispose: () => void
 * }} TowerView3D
 */

const FOV = 45;
const LIMITS = Object.freeze({ minPolar: 0.55, maxPolar: 1.56, minDistance: 4, maxDistance: 90 });
const ANGLES = Object.freeze({ azimuth: 0.55, polar: 1.3 });
const COLORS = Object.freeze({ cleared: '#7fcf8b', current: '#ffd23f', frame: '#7d86a8', window: '#5aa9e6' });
const paint = (color) => new MeshLambertMaterial({ color });

/**
 * @param {{ onFloor: (floor: number) => void, onContextLost: () => void }} options `onFloor` is called with the floor number that
 *   was tapped in the picture (open or not: the menu decides what to say).
 * @returns {TowerView3D}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' when the device cannot do 3D; the caller
 *   opens the 2D menu instead.
 */
export function createTowerView3D({ onFloor, onContextLost }) {
  const container = el('div', { class: 'scene3d__stage' });
  const view = new OrbitStage({
    container, background: '#bfe3ff', fov: FOV, limits: LIMITS, onContextLost,
    label: 'A 3D tower, one floor for each times table. Floors that are built are green; the floor to work on is gold. Use the list of floors to choose one.',
    orbit: (stage) => ({ ...ANGLES, distance: climbFraming({ index: 0, count: 10, aspect: stage.size.width / stage.size.height }).distance }),
    target: { x: 0, y: 1, z: 0 },
    onTap: handleTap,
  });
  const { scene, quality } = view.stage;
  scene.add(new AmbientLight('#ffffff', Math.PI * 0.7));
  const sun = new DirectionalLight('#ffffff', Math.PI * 0.8);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  // The ground and a few trees round it, the same every visit.
  const ground = new Mesh(new CircleGeometry(40, 48), paint('#7ccb73'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  const rng = createRng(31);
  const trunk = new CylinderGeometry(0.2, 0.26, 1.2, 6);
  const leaves = new ConeGeometry(1.1, 2.8, quality.detail === 'high' ? 8 : 6);
  for (let i = 0; i < (quality.detail === 'high' ? 24 : 12); i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 7 + rng() * 22;
    const tree = new Group();
    const stem = new Mesh(trunk, paint('#7b5a3c'));
    stem.position.y = 0.6;
    const top = new Mesh(leaves, paint(i % 3 ? '#2f9e5a' : '#3fb86a'));
    top.position.y = 2.5;
    tree.add(stem, top);
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tree.scale.setScalar(0.8 + rng() * 0.8);
    scene.add(tree);
  }

  const tower = new Group();
  scene.add(tower);
  const floorBox = new BoxGeometry(FLOOR_WIDTH, FLOOR_HEIGHT, FLOOR_WIDTH);
  const frameEdges = new EdgesGeometry(floorBox);
  const frameLine = new LineBasicMaterial({ color: COLORS.frame });
  const tappable = [];
  let count = 0;
  let focus = 0;
  let current = null;
  let clock = 0;
  let lastAspect = 0;

  function clearTower() {
    for (const child of [...tower.children]) {
      child.removeFromParent();
      // The shared geometries and materials are freed once with the scene; only each floor's own label texture is freed here.
      child.traverse((node) => { if (node.isSprite) disposeObject(node); });
    }
    tappable.length = 0;
    current = null;
  }

  /** Builds the floors for a level and climbs the camera to the one being worked on. */
  function setLevel({ floors, states }) {
    clearTower();
    count = floors.length;
    floors.forEach((floor, i) => {
      const state = states[i];
      const group = new Group();
      group.position.y = floorCenterY(i);
      let body;
      if (state === 'locked') {
        // An empty frame: see-through with an outline, so a floor that is not built is also not drawn solid (not just a colour).
        body = new Mesh(floorBox, new MeshBasicMaterial({ color: '#dfe6f7', transparent: true, opacity: 0.2, depthWrite: false }));
        group.add(body, new LineSegments(frameEdges, frameLine));
      } else {
        body = new Mesh(floorBox, paint(state === 'current' ? COLORS.current : COLORS.cleared));
        group.add(body);
        const window = new BoxGeometry(0.5, 0.42, 0.05);
        for (const x of [-1.1, 1.1]) {
          const pane = new Mesh(window, paint(COLORS.window));
          pane.position.set(x, 0.05, FLOOR_WIDTH / 2 + 0.01);
          group.add(pane);
        }
      }
      body.userData.floor = floor;
      body.userData.state = state;
      tappable.push(body);
      const label = makeLabel(state === 'cleared' ? `${floor} ✓` : String(floor), { worldHeight: 0.62, fontSize: 56, padding: 12 });
      // Well in front of the face: a label seen at an angle is a flat card turned to the camera, and its far edge would dip behind the wall.
      label.position.set(0, 0.02, FLOOR_WIDTH / 2 + 0.4);
      group.add(label);
      tower.add(group);
      if (state === 'current') current = group;
    });

    // A gold flag on the floor being worked on ("you are here") and a chequered one at the top of the tower (the goal).
    const flagAt = (x, y, z, color, height) => {
      const flag = new Group();
      const pole = new Mesh(new CylinderGeometry(0.05, 0.05, height, 6), paint('#6b4e16'));
      pole.position.y = height / 2;
      const cloth = new Mesh(new BoxGeometry(0.8, 0.5, 0.05), paint(color));
      cloth.position.set(0.4, height - 0.25, 0);
      flag.add(pole, cloth);
      flag.position.set(x, y, z);
      tower.add(flag);
    };
    flagAt(0, towerHeight(count) - 0.9, 0, '#1f2544', 1.8);
    if (current) flagAt(FLOOR_WIDTH / 2 - 0.2, current.position.y + FLOOR_HEIGHT / 2, FLOOR_WIDTH / 2 - 0.2, '#ff5d8f', 1.2);

    focus = focusIndex(states);
    // Start at the bottom and climb, so the child sees how far up they are (a cut straight to the floor with less motion).
    const aspect = view.stage.size.width / view.stage.size.height;
    lastAspect = aspect;
    const bottom = climbFraming({ index: 0, count, aspect });
    view.snapTo({ ...ANGLES, distance: bottom.distance, target: bottom.target });
    climb();
  }

  function climb() {
    const frame = climbFraming({ index: focus, count, aspect: view.stage.size.width / view.stage.size.height });
    if (view.reducedMotion) view.snapTo({ distance: frame.distance, target: frame.target });
    else view.glideTo({ distance: frame.distance, target: frame.target });
  }

  function showWholeTower() {
    const frame = wholeTowerFraming({ count, aspect: view.stage.size.width / view.stage.size.height });
    view.glideTo({ ...ANGLES, distance: frame.distance, target: frame.target });
  }

  function handleTap({ clientX, clientY }) {
    const hits = view.stage.pick(clientX, clientY, tappable);
    // The empty frames are see-through, so a tap that goes through one reaches the built floor behind it (the roof of the floor
    // being worked on lies inside the frame above it, and tapping that roof must open it).
    const hit = hits.find((h) => h.object.userData.state !== 'locked') ?? hits[0];
    const floor = hit?.object.userData.floor;
    if (floor !== undefined) onFloor(floor);
  }

  return {
    el: container,
    setLevel,
    climb,
    showWholeTower,
    update(dt) {
      clock += dt;
      view.update(dt);
      // The floor being worked on breathes a little (still when motion is turned down).
      if (current) current.scale.y = view.reducedMotion ? 1 : 1 + Math.sin(clock * 3) * 0.025;
      // A phone turned on its side changes the picture's shape: keep the floor in frame (unless the child has zoomed or turned).
      const aspect = view.stage.size.width / view.stage.size.height;
      if (count && Math.abs(aspect - lastAspect) > 1e-6) {
        const before = climbFraming({ index: focus, count, aspect: lastAspect }).distance;
        lastAspect = aspect;
        if (Math.abs(view.input.orbit.distance - before) < 1e-6) view.input.orbit = { ...view.input.orbit, distance: climbFraming({ index: focus, count, aspect }).distance };
      }
    },
    render: () => view.render(),
    dispose: () => view.dispose(),
  };
}
