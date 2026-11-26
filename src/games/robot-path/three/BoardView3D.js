import { AmbientLight, DirectionalLight, Group } from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { easeInOut } from '../../../engine/three/motionMath.js';
import { el } from '../../../engine/utils/dom.js';
import { cellCenter, planStep, poseAt, startPose, chaseCamera, boardDistance, MAP_POLAR } from '../logic/board3d.js';
import { themeFor } from './boardTheme.js';
import { createFloor, createRock, createBattery, createGem, createRobot } from './boardModels.js';

/**
 * The 3D board for Robot Path: the same grid, rocks, battery, gems and robot as the 2D `BoardView`, seen at an angle the
 * child can turn. It has the same small interface as the 2D board (`reset`, `showFrame`, `celebrate`), so the puzzle scene
 * drives either one the same way, plus the extras a 3D view needs (`update`, `render`, `dispose`) and two camera views:
 * the map (turn and zoom it) and the robot's view (the camera rides behind the robot and looks the way it looks, so a left
 * turn bends the picture to the left).
 *
 * The board only *shows* the interpreter's trace, one frame at a time, so what is on screen is exactly what the rules computed.
 *
 * @typedef {'map'|'robot'} CameraMode
 * @typedef {{
 *   el: HTMLElement,
 *   reset: () => void,
 *   showFrame: (frame: import('../logic/interpreter.js').Frame) => void,
 *   celebrate: () => void,
 *   update: (dt: number) => void,
 *   render: () => void,
 *   dispose: () => void,
 *   setCameraMode: (mode: CameraMode) => void,
 *   showWholeBoard: () => void,
 *   readonly cameraMode: CameraMode
 * }} BoardView3D
 */

const FOV = 45;
/** The limits keep the child from flipping upside down, going under the floor, or losing the board. */
const LIMITS = Object.freeze({ minPolar: 0.15, maxPolar: 1.45, minDistance: 2.5, maxDistance: 30 });
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
const DANCE_SECONDS = 1.6;

/**
 * @param {{ level: import('../logic/levels.js').Level, onContextLost: () => void }} options
 * @returns {BoardView3D}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' when the device cannot do 3D; the
 *   caller opens the 2D board instead.
 */
export function createBoardView3D({ level, onContextLost }) {
  const [cols, rows] = level.size;
  const theme = themeFor(level.world);
  const container = el('div', { class: 'scene3d__stage' });
  const fit = (size) => boardDistance({ size: level.size, aspect: size.width / size.height, fovDegrees: FOV });
  const mapOrbit = (distance) => ({ azimuth: 0, polar: MAP_POLAR, distance });

  const view = new OrbitStage({
    container, background: theme.sky, fov: FOV, limits: LIMITS, target: ORIGIN, onContextLost,
    orbit: (stage) => mapOrbit(fit(stage.size)),
    label: `3D board with ${cols} columns and ${rows} rows. The robot starts at column ${level.start.x + 1}, row ${level.start.y + 1}. The battery is at column ${level.goal.x + 1}, row ${level.goal.y + 1}. Use the buttons to run the program.`,
  });
  const { scene, quality } = view.stage;

  // ---------------------------------------------------------------------------------- the scenery
  const world = new Group();
  scene.add(world, new AmbientLight('#ffffff', Math.PI * 0.6));
  const sun = new DirectionalLight('#ffffff', Math.PI * 0.75);
  sun.position.set(4, 8, 5);
  scene.add(sun);

  world.add(createFloor(level, theme));
  level.walls.forEach(([x, y]) => {
    const rock = createRock(((x * 7 + y * 13) % 6) + 0.3, theme);
    const at = cellCenter(x, y, level.size);
    rock.position.x = at.x;
    rock.position.z = at.z;
    world.add(rock);
  });
  const battery = createBattery();
  const goal = cellCenter(level.goal.x, level.goal.y, level.size);
  battery.position.set(goal.x, 0, goal.z);
  world.add(battery);

  /** @type {Map<string, import('../../../engine/three/three.js').Mesh>} */
  const gems = new Map();
  level.gems.forEach(([x, y], index) => {
    const gem = createGem();
    const at = cellCenter(x, y, level.size);
    gem.position.x = at.x;
    gem.position.z = at.z;
    gem.userData.phase = index;
    gems.set(`${x},${y}`, gem);
    world.add(gem);
  });

  const robot = createRobot(theme, quality);
  world.add(robot.root);

  // ---------------------------------------------------------------------------------- the robot's state
  /** Where the robot stands after the last step it was shown (the end of any motion in progress). */
  let pose = startPose(level);
  /** What is drawn now: the pose part-way through a motion, without the dance. */
  let shown = { ...pose };
  /** @type {{ motion: import('../logic/board3d.js').Motion, elapsed: number }|null} */
  let playing = null;
  /** Seconds into the victory dance, or null when it is not dancing. */
  let dance = null;
  let clock = 0;
  /** @type {CameraMode} */
  let mode = 'map';
  let savedMap = null;
  let lastFit = fit(view.stage.size);

  function place(state) {
    shown = { x: state.x, z: state.z, yaw: state.yaw };
    robot.root.position.set(state.x, 0, state.z);
    robot.root.rotation.y = state.yaw;
    // The body leans forward (-z is forward for the robot), hops, squashes on impact and wobbles; the shadow stays on the floor.
    robot.body.position.set(0, state.lift, -state.lean);
    robot.body.scale.set(1 + 0.08 * state.squash, 1 - 0.15 * state.squash, 1 + 0.08 * state.squash);
    robot.body.rotation.z = state.roll;
  }

  /** Puts a motion's gem away once the robot has picked it up. */
  function finishGem(motion) {
    const gem = motion.gem && gems.get(motion.gem);
    if (gem) gem.visible = false;
  }

  /** Brings an unfinished motion to its end at once, so the robot is where the rules say before the next step starts. */
  function finishMotion() {
    if (!playing) return;
    place(poseAt(playing.motion, 1));
    finishGem(playing.motion);
    playing = null;
  }

  function reset() {
    playing = null;
    dance = null;
    pose = startPose(level);
    place({ ...pose, lift: 0, lean: 0, squash: 0, roll: 0 });
    for (const gem of gems.values()) {
      gem.visible = true;
      gem.scale.set(1, 1.5, 1);
    }
    battery.userData.discharge();
    battery.scale.setScalar(1);
  }
  reset();

  // ---------------------------------------------------------------------------------- the camera
  function wholeBoard() {
    mode = 'map';
    view.input.enabled = true;
    view.glideTo({ ...mapOrbit(fit(view.stage.size)), target: ORIGIN });
  }

  function setCameraMode(next) {
    if (next === mode) return;
    if (next === 'robot') {
      // Remember how the child had the map turned, so "map view" gives it back instead of a default.
      savedMap = { ...view.input.orbit };
      mode = 'robot';
      view.input.enabled = false;
      return;
    }
    mode = 'map';
    view.input.enabled = true;
    view.glideTo({ ...(savedMap ?? mapOrbit(fit(view.stage.size))), target: ORIGIN });
  }

  /** When the view changes shape (rotating a phone), the board stays in frame unless the child zoomed it themselves. */
  function refit() {
    const next = fit(view.stage.size);
    if (Math.abs(next - lastFit) < 1e-6) return;
    if (mode === 'map' && Math.abs(view.input.orbit.distance - lastFit) < 1e-6) view.input.orbit = { ...view.input.orbit, distance: next };
    lastFit = next;
  }

  // ---------------------------------------------------------------------------------- the interface
  return {
    el: container,
    reset,

    showFrame(frame) {
      finishMotion();
      const motion = planStep(pose, frame, level.size);
      pose = motion.to;
      if (view.reducedMotion || motion.seconds === 0) {
        // Less motion: the robot is simply where the step leaves it (a stopped robot does not lean).
        place({ ...motion.to, lift: 0, lean: 0, squash: 0, roll: 0 });
        finishGem(motion);
        return;
      }
      playing = { motion, elapsed: 0 };
    },

    celebrate() {
      battery.userData.charge();
      if (!view.reducedMotion) dance = 0;
    },

    update(dt) {
      clock += dt;
      view.update(dt);
      refit();
      const still = view.reducedMotion;
      if (!still) {
        for (const gem of gems.values()) {
          gem.rotation.y += dt * 1.6;
          if (gem.visible) gem.position.y = 0.45 + Math.sin(clock * 2.2 + gem.userData.phase) * 0.05;
        }
      }
      if (playing) {
        playing.elapsed += dt;
        const { motion } = playing;
        const progress = Math.min(1, playing.elapsed / motion.seconds);
        // Slides and turns ease in and out; hops, leans and wobbles already have their own shape.
        place(poseAt(motion, motion.kind === 'move' || motion.kind === 'turn' ? easeInOut(progress) : progress));
        const gem = motion.gem && gems.get(motion.gem);
        if (gem) gem.scale.set(1 + 0.6 * progress, 1.5 * (1 + 0.6 * progress), 1 + 0.6 * progress);
        if (progress >= 1) finishMotion();
      }
      if (dance !== null) {
        dance += dt;
        if (dance >= DANCE_SECONDS) {
          dance = null;
          place({ ...shown, lift: 0, lean: 0, squash: 0, roll: 0 });
          battery.scale.setScalar(1);
        } else {
          // The robot spins and hops on the spot; the battery pulses. The camera follows `shown`, which has no spin.
          robot.root.rotation.y = shown.yaw + dance * 7;
          robot.body.position.y = 0.12 + 0.12 * Math.sin(dance * 11);
          battery.scale.setScalar(1 + 0.1 * Math.sin(dance * 12));
        }
      }
      if (mode === 'robot') view.follow(chaseCamera(shown), dt, 5);
    },

    render: () => view.render(),
    dispose: () => view.dispose(),
    setCameraMode,
    showWholeBoard: wholeBoard,
    get cameraMode() { return mode; },
  };
}
