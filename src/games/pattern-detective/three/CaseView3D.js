import { AmbientLight, DirectionalLight, Group, Mesh, BoxGeometry } from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { disposeObject } from '../../../engine/three/Stage3D.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import {
  SPACING, itemPosition, spinAngle, kickAngle, SPIN_SECONDS, dropHeight, DROP_SECONDS, startView, viewLimits, describeSolid,
} from '../logic/look3d.js';
import { createSolidKit, buildItem } from './solids.js';

/**
 * The case file in 3D: the items of the sequence stand on pedestals in a row, as solids (a sphere, a cube, a cone, a star, an arrow) or as blocks
 * with a number on them, which the child can turn and zoom. The solids turn slowly on the spot (an arrow never does: its angle is the case). A tap on a
 * solid turns it once and says what it is ("orange sphere"). The gap is an empty gold pedestal with a "?". After a wrong pick the hint appears in the
 * picture: a ring round the items to look at, and the jumps or sizes written between and under the items. When the case is solved the answer
 * drops into the gap.
 *
 * It only shows what the case scene tells it (`hint`, `solve`). The answers, the rules and the words stay in the page, and so does the flat
 * strip of items (the scene keeps it in step, and hides it only while this picture is showing). If 3D cannot run, the picture goes and the strip is
 * shown again.
 *
 * @typedef {{
 *   el: HTMLElement,
 *   hint: (hint: import('../logic/puzzle.js').Hint) => void,
 *   solve: (answer: import('../logic/equality.js').Item) => void,
 *   tick: (dt: number) => void,
 *   draw: () => void,
 *   dispose: () => void
 * }} CaseView3D
 */

const LIFT_PEDESTAL = 0.14; // the pedestal's top is this high, and items stand on it
const NAME_SECONDS = 2;

/**
 * @param {{
 *   puzzle: import('../logic/puzzle.js').Puzzle,
 *   onName: (text: string) => void,
 *   onFallBack: () => void
 * }} options `onName` is told what a tapped solid is (the scene says it aloud); `onFallBack` is told when 3D stops.
 * @returns {CaseView3D}
 */
export function createCaseView3D({ puzzle, onName, onFallBack }) {
  const container = el('div', { class: 'scene3d__stage case3d__stage' });
  const total = puzzle.items.length;
  let view = null;
  let clock = 0;
  let lastAspect = 0;
  let kit = null;
  /** @type {{ stand: Group, item: ReturnType<typeof buildItem>|null, base: Mesh, ring: Mesh, kick: number }[]} */
  const places = [];
  let marks = null; // the labels of the hint, replaced each time a hint is shown
  let name = null; // the label of the solid that was last tapped
  let nameAge = 0;
  let answer = null; // the answer dropping into the gap
  let sign = null; // the "?" over the gap

  function degrade(reason) {
    logError(new Error(`3D case file stopped: ${reason}`), 'pattern-detective:3d');
    view?.dispose();
    view = null;
    container.hidden = true;
    onFallBack();
  }

  const spans = () => (view ? view.stage.size.width / Math.max(1, view.stage.size.height) : 1);
  const framing = (aspect = spans()) => startView(total, aspect);

  try {
    view = new OrbitStage({
      container, background: '#26304f', fov: 40, near: 0.1, far: 120, limits: viewLimits(total, 0.9), target: framing(1).target,
      label: `3D case file: ${total} items standing in a row, one of them missing. Drag to turn it, tap a solid to see its name. The items and the answers are also written on the page.`,
      orbit: (stage) => { const { azimuth, polar, distance } = startView(total, stage.size.width / Math.max(1, stage.size.height)); return { azimuth, polar, distance }; },
      onContextLost: () => degrade('the graphics were lost'),
      onTap: ({ clientX, clientY }) => {
        if (!view) return;
        const pickables = places.flatMap((p) => (p.item ? p.item.pickable : [])).concat(places.flatMap((p) => [p.base]));
        const hit = view.stage.pick(clientX, clientY, pickables)[0];
        const index = hit?.object.userData.index;
        if (index !== undefined) say(index);
      },
    });
  } catch (error) {
    logError(error, 'pattern-detective:3d');
    degrade('3D could not start');
  }

  /** Turns a tapped item once and says what it is (and shows its name over it for a moment). */
  function say(index) {
    const place = places[index];
    const item = puzzle.items[index];
    const gap = index === puzzle.missingIndex && !answer;
    const text = gap ? 'The missing item' : typeof item === 'number' ? `The number ${item}` : describeSolid(item);
    if (!view.reducedMotion) place.kick = 0;
    onName(text);
    if (name) { name.removeFromParent(); disposeObject(name); }
    name = makeLabel(text, { fontSize: 52, worldHeight: 0.5, background: '#fffdf3' });
    const { x } = itemPosition(index, total);
    name.position.set(x, 2.4, 0);
    view.stage.scene.add(name);
    nameAge = 0;
  }

  if (view) {
    const { scene, quality } = view.stage;
    scene.add(new AmbientLight('#ffffff', Math.PI * 0.7));
    const lamp = new DirectionalLight('#ffffff', Math.PI * 0.85);
    lamp.position.set(3, 9, 8);
    scene.add(lamp);
    kit = createSolidKit(quality);
    const felt = new Mesh(new BoxGeometry((total - 1) * SPACING + 3.2, 0.2, 3.6), kit.plain.felt);
    felt.position.y = -0.1;
    scene.add(felt);
    puzzle.items.forEach((item, i) => {
      const { x } = itemPosition(i, total);
      const stand = new Group();
      stand.position.x = x;
      const gap = i === puzzle.missingIndex;
      const base = new Mesh(kit.geometries.pedestal, gap ? kit.plain.slot : kit.plain.pedestal);
      base.position.y = LIFT_PEDESTAL / 2;
      base.userData.index = i;
      const ring = new Mesh(kit.geometries.ring, gap ? kit.plain.slotRing : kit.plain.ring);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = LIFT_PEDESTAL + 0.02;
      ring.visible = gap; // the gap's pedestal is ringed from the start; the others when a hint circles them
      stand.add(base, ring);
      let built = null;
      if (!gap) {
        built = buildItem(kit, item, i);
        built.group.position.y = LIFT_PEDESTAL;
        stand.add(built.group);
      }
      scene.add(stand);
      places.push({ stand, item: built, base, ring, kick: SPIN_SECONDS });
    });
    sign = makeLabel('?', { fontSize: 96, worldHeight: 1.1, background: '#fffdf3', padding: 14 });
    sign.position.set(itemPosition(puzzle.missingIndex, total).x, 1.35, 0);
    scene.add(sign);
  }

  /** The row of items fits the picture's shape again when the picture changes shape (turning a phone). */
  function refit() {
    const aspect = spans();
    if (Math.abs(aspect - lastAspect) < 0.03) return;
    lastAspect = aspect;
    const { distance, target } = framing(aspect);
    view.snapTo({ distance, target });
  }

  return {
    el: container,
    hint({ highlight = [], labels = [], between = [] } = {}) {
      if (!view) return;
      places.forEach((place, i) => { if (i !== puzzle.missingIndex) place.ring.visible = highlight.includes(i); });
      if (marks) { marks.removeFromParent(); disposeObject(marks); }
      marks = new Group();
      labels.forEach((text, i) => {
        if (!text) return;
        const label = makeLabel(String(text), { fontSize: 48, worldHeight: 0.46, background: '#fffdf3' });
        label.position.set(itemPosition(i, total).x, 0.35, 1.55);
        marks.add(label);
      });
      between.forEach((text, i) => {
        if (!text || i >= total - 1) return;
        const label = makeLabel(String(text), { fontSize: 56, worldHeight: 0.58, background: '#7a5cff', color: '#ffffff' });
        label.position.set((itemPosition(i, total).x + itemPosition(i + 1, total).x) / 2, 1.3, 0);
        marks.add(label);
      });
      view.stage.scene.add(marks);
    },
    solve(item) {
      if (!view) return;
      const place = places[puzzle.missingIndex];
      place.base.material = kit.plain.solved;
      place.ring.visible = false;
      if (sign) { sign.removeFromParent(); disposeObject(sign); sign = null; }
      const built = buildItem(kit, item, puzzle.missingIndex);
      place.item = built;
      place.stand.add(built.group);
      answer = { built, age: view.reducedMotion ? DROP_SECONDS : 0 };
      built.group.position.y = LIFT_PEDESTAL + dropHeight(answer.age);
    },
    tick(dt) {
      if (!view) return;
      view.update(dt);
      refit();
      clock += dt;
      const calm = view.reducedMotion;
      places.forEach((place, i) => {
        place.kick = Math.min(SPIN_SECONDS, place.kick + dt);
        place.item?.spinners.forEach((piece) => { piece.rotation.y = calm ? 0 : spinAngle(clock, i) + kickAngle(place.kick); });
      });
      if (answer) {
        answer.age = Math.min(DROP_SECONDS, answer.age + dt);
        answer.built.group.position.y = LIFT_PEDESTAL + dropHeight(answer.age);
      }
      if (sign) sign.position.y = 1.35 + (calm ? 0 : Math.sin(clock * 3) * 0.08);
      if (name) {
        nameAge += dt;
        if (nameAge > NAME_SECONDS) { name.removeFromParent(); disposeObject(name); name = null; }
      }
    },
    draw() { view?.render(); },
    dispose() { view?.dispose(); view = null; },
  };
}
