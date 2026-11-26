import { AmbientLight, DirectionalLight, Vector3 } from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { approach } from '../../../engine/three/motionMath.js';
import { createStarfield } from '../../../engine/three/starfield.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import {
  CELL, JAR_HEIGHT, JAR_BASE, BOUNCE_SECONDS, FLIGHT_SECONDS, cellPosition, changedCells, startView, viewLimits, bounce, fireflyFlights, flightProgress,
} from '../logic/look3d.js';
import { createJarKit, buildJar, setJarLit, buildTable, buildArrow, buildFirefly } from './jarModels.js';

/**
 * The board in 3D: a table at night with a jar for every cell, which the child can turn and zoom. A jar that is lit holds a glowing firefly; a
 * tap on a jar flips it and its neighbours, and the flipped jars bounce. When the puzzle is solved the fireflies fly away. A hint is an arrow
 * that points down at a jar.
 *
 * The flat grid of jar buttons (`controls`, made by the scene) stays in the page: it is laid over the picture, one button on top of each jar,
 * invisible except for its focus ring and its hint outline. So the keyboard and screen readers have the same buttons as ever (arrows move, Space
 * or Enter flips, each jar says its row, column and whether it holds a firefly) and a tap on a jar in the picture and a press on its button do
 * the same thing. If 3D cannot run, the picture goes and the grid becomes the board again, as it was, with nothing lost.
 *
 * @typedef {{
 *   el: HTMLElement,
 *   render: (board: boolean[][], options?: { hint?: [number, number]|null, locked?: boolean }) => void,
 *   focusCell: (r: number, c: number) => void,
 *   tick: (dt: number) => void,
 *   draw: () => void,
 *   dispose: () => void
 * }} BoardView3D
 */

/** How quickly a jar's glow comes and goes, as a rate for `approach`. */
const GLOW_RATE = 14;
const FLYERS_PER_BOARD = 30;

/**
 * @param {{
 *   size: number,
 *   controls: ReturnType<typeof import('../ui/BoardView.js').createBoardView>,
 *   onTap: (r: number, c: number) => void,
 *   onFallBack: () => void
 * }} options `controls` is the flat grid; `onTap` is called with the jar that was tapped in the picture; `onFallBack` is told when 3D stops.
 * @returns {BoardView3D}
 */
export function createBoardView3D({ size, controls, onTap, onFallBack }) {
  const container = el('div', { class: 'scene3d__stage board3d' });
  let board = Array.from({ length: size }, () => Array(size).fill(false));
  let hint = null;
  let locked = false;
  let view = null;
  let jars = [];
  let kit = null;
  let arrow = null;
  const flyers = [];
  let flights = 0; // how many times the fireflies have been set free, so each time flies differently
  let clock = 0;

  function degrade(reason) {
    logError(new Error(`3D board stopped: ${reason}`), 'lights-out:3d');
    view?.dispose();
    view = null;
    container.classList.add('board3d--flat');
    controls.el.classList.remove('jars--overlay');
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) Object.assign(controls.cell(r, c).style, { left: '', top: '', width: '', height: '' });
    onFallBack();
  }

  try {
    const { azimuth, polar, distance, target } = startView(size);
    view = new OrbitStage({
      container, background: '#0e1233', fov: 40, near: 0.1, far: 200, limits: viewLimits(size), target,
      label: `3D board of ${size * size} jars at night. Tap a jar to flip it and the jars next to it. The jar buttons on the board do the same, and are named by row and column.`,
      orbit: { azimuth, polar, distance },
      onContextLost: () => degrade('the graphics were lost'),
      onTap: ({ clientX, clientY }) => {
        if (locked || !view) return;
        const hit = view.stage.pick(clientX, clientY, jars.flat().flatMap((j) => j.pickable))[0];
        const cell = hit?.object.userData.cell;
        if (!cell) return;
        controls.focusCell(cell[0], cell[1]);
        onTap(cell[0], cell[1]);
      },
    });
  } catch (error) {
    logError(error, 'lights-out:3d');
    degrade('3D could not start');
  }

  if (view) {
    const { scene, quality } = view.stage;
    scene.add(new AmbientLight('#aab4ff', Math.PI * 0.55));
    const moon = new DirectionalLight('#ffffff', Math.PI * 0.6);
    moon.position.set(4, 10, 6);
    scene.add(moon, createStarfield({ count: quality.detail === 'low' ? 80 : 160, seed: 11, minRadius: 70, spread: 20, size: 0.7, color: '#dfe6ff' }));
    kit = createJarKit(quality);
    scene.add(buildTable(kit, size));
    jars = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => {
      const model = buildJar(kit, r, c, size);
      scene.add(model.group);
      return model;
    }));
    arrow = buildArrow(kit);
    scene.add(arrow);
    // Fireflies that fly away when the puzzle is solved: a few made ahead of time, reused (nothing is made while the child plays).
    for (let i = 0; i < FLYERS_PER_BOARD; i++) {
      const firefly = buildFirefly(kit);
      firefly.visible = false;
      flyers.push({ firefly, active: false, age: 0, from: new Vector3(), flight: null });
      scene.add(firefly);
    }
    controls.el.classList.add('jars--overlay');
  }

  // The grid of jar buttons lives in the picture's box: over the picture while 3D runs, and as the board itself if it does not.
  container.append(controls.el);

  const projected = new Vector3();
  const nextTo = new Vector3();

  /** Puts each jar's button on top of its jar in the picture (so the focus ring and the hint outline are on the jar). */
  function placeControls() {
    const { width, height } = view.stage.size;
    const camera = view.stage.camera;
    const to = (x, y, z, into) => { into.set(x, y, z).project(camera); return into; };
    // Each button sits on its jar's lid: the lid is the part of a jar at the back that is not hidden by the jars in front of it, and a tap there
    // clears the lids of the jars in front with room to spare.
    const high = JAR_BASE + JAR_HEIGHT + 0.05;
    const first = cellPosition(0, 0, size);
    const a = to(first.x, high, first.z, projected);
    const ax = ((a.x + 1) / 2) * width;
    const ay = ((1 - a.y) / 2) * height;
    const b = to(first.x + CELL, high, first.z, nextTo);
    // The size of a button is the jar's size on screen (a bit under the gap between jars), never below the 48 pixels a finger needs.
    const side = Math.max(48, Math.min(110, Math.hypot(((b.x + 1) / 2) * width - ax, ((1 - b.y) / 2) * height - ay) * 0.86));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const { x, z } = cellPosition(r, c, size);
        to(x, high, z, projected);
        const style = controls.cell(r, c).style;
        style.left = `${(((projected.x + 1) / 2) * width).toFixed(1)}px`;
        style.top = `${(((1 - projected.y) / 2) * height).toFixed(1)}px`;
        style.width = style.height = `${side.toFixed(1)}px`;
      }
    }
  }

  /** Brings the picture in line with the board: flipped jars change and bounce; if the puzzle has just been solved, the fireflies fly away. */
  function apply(previous, justSolved) {
    const changed = changedCells(previous, board);
    for (const [r, c] of changed) {
      jars[r][c].age = 0;
      setJarLit(kit, jars[r][c], board[r][c]);
    }
    if (justSolved && !view.reducedMotion) {
      // The fireflies that were in the jars fly away: two from each jar that has just gone dark.
      const free = flyers.filter((f) => !f.active);
      const released = previous.flatMap((row, r) => row.map((lit, c) => (lit ? [r, c] : null))).filter(Boolean);
      const plan = fireflyFlights({ count: Math.min(free.length, released.length * 2), seed: 100 + flights++ });
      plan.forEach((flight, i) => {
        const [r, c] = released[i % released.length];
        const { x, z } = cellPosition(r, c, size);
        Object.assign(free[i], { active: true, age: 0, flight });
        free[i].from.set(x, JAR_BASE + JAR_HEIGHT * 0.45, z);
        free[i].firefly.visible = true;
      });
    }
    // The hint arrow stands over the hinted jar.
    arrow.visible = Boolean(hint);
    if (hint) {
      const { x, z } = cellPosition(hint[0], hint[1], size);
      arrow.position.set(x, 0, z);
    }
  }

  return {
    el: container,
    render(next, { hint: nextHint = null, locked: isLocked = false } = {}) {
      controls.render(next, { hint: nextHint, locked: isLocked });
      const previous = board;
      const justSolved = isLocked && !locked;
      board = next.map((row) => row.slice());
      hint = nextHint;
      locked = isLocked;
      if (view) apply(previous, justSolved);
    },
    focusCell: (r, c) => controls.focusCell(r, c),
    tick(dt) {
      if (!view) return;
      view.update(dt);
      clock += dt;
      const calm = view.reducedMotion;
      for (const row of jars) {
        for (const model of row) {
          model.age = Math.min(BOUNCE_SECONDS, model.age + dt);
          model.jar.position.y = calm ? 0 : bounce(model.age);
          model.glow = calm ? (model.lit ? 1 : 0) : approach(model.glow, model.lit ? 1 : 0, dt, GLOW_RATE);
          // The firefly in a lit jar drifts about a little, and its glow breathes with the jar's glow.
          const sway = calm ? 0 : Math.sin(clock * 2 + model.group.position.x * 3 + model.group.position.z) * 0.06;
          model.firefly.position.y = JAR_BASE + JAR_HEIGHT * 0.45 + sway;
          model.firefly.children.at(-1).scale.setScalar(0.3 + 0.8 * model.glow);
        }
      }
      for (const flyer of flyers) {
        if (!flyer.active) continue;
        flyer.age += dt;
        const t = flightProgress(flyer.age, flyer.flight.delay);
        flyer.firefly.position.set(
          flyer.from.x + flyer.flight.driftX * t + Math.sin(clock * 5 + flyer.flight.phase) * 0.12 * t,
          flyer.from.y + flyer.flight.rise * t,
          flyer.from.z + flyer.flight.driftZ * t,
        );
        // It fades out over the last stretch of its flight by shrinking, so nothing is left hanging in the sky.
        flyer.firefly.scale.setScalar(Math.max(0.001, 1 - Math.max(0, t - 0.55) / 0.45));
        if (flyer.age >= FLIGHT_SECONDS) { flyer.active = false; flyer.firefly.visible = false; flyer.firefly.scale.setScalar(1); }
      }
      if (arrow?.visible) arrow.position.y = JAR_HEIGHT + 1.05 + (calm ? 0 : Math.sin(clock * 6) * 0.14);
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
