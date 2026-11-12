import { AmbientLight, DirectionalLight, Group, Mesh, Vector3 } from '../../../engine/three/three.js';
import { Stage3D, disposeObject } from '../../../engine/three/Stage3D.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import {
  CARRIAGE_LENGTH, ROW_SPACING, rowsFor, placePosition, startView, trainOffset, wrongBounce, dropHeight, DROP_SECONDS, steamPuff,
} from '../logic/look3d.js';
import { createTrainKit, buildCarriage, setCarriageState, buildEngine, buildSlotPlate, buildTracks } from './trainModels.js';

/**
 * The yard of the toy train in 3D: the engine on the track with a place for each word of the sentence, which shows the carriages the child has put in the slots (a
 * word on each side), a padlock on a carriage that a hint locked, a red cross and a bounce on a carriage in the wrong place, a plate marking each empty slot, and, when
 * the sentence is right, the whole train rolling away along the rails with puffs of steam.
 *
 * The slots in the page (`slots`, with the carriage buttons in them: the ones the child drags, taps and moves with the arrow keys) are laid over the picture, one on
 * each place of the track, invisible except for the slot that a carriage is being dragged over and the focus ring. So the page's dragging, tapping and keys work as
 * before, and a carriage is still named by its word and its slot. If 3D cannot run, the picture goes and `onFallBack` is told, so the scene can put the slots back in
 * their ordinary place.
 *
 * The camera is fixed: this is a game of dragging carriages onto slots, and the picture must stay where the slots are.
 *
 * @typedef {{
 *   el: HTMLElement,
 *   show: (state: { words: readonly (string|null)[], locked: readonly boolean[], wrong: number }) => void,
 *   leave: () => void,
 *   tick: (dt: number) => void,
 *   draw: () => void,
 *   dispose: () => void
 * }} TrainView3D
 */

const FOV = 35;
const WHEEL_RADIUS = 0.33;
const PUFFS = 8;
const STEAM_SECONDS = 1.4;

/**
 * @param {{
 *   slots: readonly HTMLElement[],
 *   train: HTMLElement,
 *   onFallBack: () => void
 * }} options `slots` are the page's slot elements, in order; `train` is their container; `onFallBack` is told when 3D cannot run (at the start or later).
 * @returns {TrainView3D}
 */
export function createTrainView3D({ slots, train, onFallBack }) {
  const container = el('div', { class: 'scene3d__stage train3d' });
  const count = slots.length + 1; // the engine and a place for each word
  const reduced = prefersReducedMotion();
  let stage = null;

  function degrade(reason) {
    logError(new Error(`3D train stopped: ${reason}`), 'sentence-train:3d');
    stage?.dispose();
    stage = null;
    container.hidden = true;
    train.classList.remove('train--overlay');
    for (const slot of slots) Object.assign(slot.style, { left: '', top: '', width: '', height: '' });
    onFallBack();
  }

  try {
    stage = new Stage3D({
      container, background: '#bfe3ff', fov: FOV, near: 0.1, far: 300, onContextLost: () => degrade('the graphics were lost'),
      label: `3D toy train yard: the engine and a place for each of the ${slots.length} words of the sentence. The carriages and the places are also on the page.`,
    });
  } catch (error) {
    // 3D could not start: nothing was moved yet, so the slots are where they always are; the scene is told and carries on flat.
    logError(error, 'sentence-train:3d');
    container.hidden = true;
    onFallBack();
    return { el: container, show() {}, leave() {}, tick() {}, draw() {}, dispose() {} };
  }

  const { scene, camera, quality } = stage;
  scene.add(new AmbientLight('#ffffff', Math.PI * 0.8));
  const sun = new DirectionalLight('#ffffff', Math.PI * 0.75);
  sun.position.set(4, 12, 9);
  scene.add(sun);
  const kit = createTrainKit(quality);

  const engine = buildEngine(kit);
  const trainGroup = new Group(); // everything that rolls away: the engine and the carriages
  trainGroup.add(engine.group);
  scene.add(trainGroup);
  let tracks = null;
  /** @type {{ plate: Group, carriage: ReturnType<typeof buildCarriage>|null, word: string|null, dropAge: number, wrongAge: number }[]} */
  const places = slots.map((_, i) => {
    const plate = buildSlotPlate(kit, i + 1);
    scene.add(plate);
    return { plate, carriage: null, word: null, dropAge: DROP_SECONDS, wrongAge: 1 };
  });
  let state = { words: slots.map(() => null), locked: slots.map(() => false), wrong: -1 };
  let lastAspect = 0;
  let leaving = null;
  let clock = 0;
  let nextPuff = 0;
  let sinceSteam = 0;
  // The steam: a few puffs, each with a material of its own (so each can fade by itself), used one after another.
  const puffs = Array.from({ length: PUFFS }, () => {
    const mesh = new Mesh(kit.geometries.steam, kit.materials.steam.clone());
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, age: STEAM_SECONDS, origin: new Vector3() };
  });
  const chimney = new Vector3();

  train.classList.add('train--overlay');
  container.append(train);

  const spot = (place, aspect) => placePosition(place, count, aspect);

  /** Fits the camera and the track to the picture's shape (a narrow picture runs the train on in more rows), and puts everything on its place. */
  function relayout(aspect) {
    lastAspect = aspect;
    const { rows } = rowsFor(count, aspect);
    if (tracks) { tracks.removeFromParent(); disposeObject(tracks); }
    tracks = buildTracks(kit, Array.from({ length: rows }, (_, r) => (r - (rows - 1) / 2) * ROW_SPACING));
    scene.add(tracks);
    const { distance, polar, target } = startView(count, aspect);
    camera.position.set(target.x, target.y + distance * Math.cos(polar), target.z + distance * Math.sin(polar));
    camera.lookAt(target.x, target.y, target.z);
    camera.updateMatrixWorld();
    const e = spot(0, aspect);
    engine.group.position.set(e.x, 0, e.z);
    places.forEach((p, i) => {
      const s = spot(i + 1, aspect);
      p.plate.position.set(s.x, 0, s.z);
      p.carriage?.group.position.set(s.x, 0, s.z);
    });
  }

  const projected = new Vector3();
  /** Lays each page slot over its place in the picture. */
  function placeSlots(aspect) {
    const { width, height } = stage.size;
    const to = (x, y, z) => { projected.set(x, y, z).project(camera); return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * height]; };
    slots.forEach((slot, i) => {
      const s = spot(i + 1, aspect);
      const [cx, cy] = to(s.x, 1.0, s.z);
      const [lx] = to(s.x - CARRIAGE_LENGTH / 2, 1.0, s.z);
      const [rx] = to(s.x + CARRIAGE_LENGTH / 2, 1.0, s.z);
      const [, ty] = to(s.x, 1.75, s.z);
      const [, by] = to(s.x, 0.3, s.z);
      const style = slot.style;
      style.left = `${cx.toFixed(1)}px`;
      style.top = `${cy.toFixed(1)}px`;
      style.width = `${Math.max(48, rx - lx).toFixed(1)}px`;
      style.height = `${Math.max(48, by - ty).toFixed(1)}px`;
    });
  }

  function releaseCarriage(model) {
    model.group.removeFromParent();
    // The geometry and the word's picture are shared; only the cross is the carriage's own (and shares its picture too), so nothing is freed here.
  }

  function applyState() {
    places.forEach((p, i) => {
      const word = state.words[i];
      if (word !== p.word) {
        if (p.carriage) { releaseCarriage(p.carriage); p.carriage = null; }
        p.word = word;
        if (word) {
          p.carriage = buildCarriage(kit, word);
          const s = spot(i + 1, lastAspect || 1.5);
          p.carriage.group.position.set(s.x, 0, s.z);
          trainGroup.add(p.carriage.group);
          p.dropAge = reduced ? DROP_SECONDS : 0; // a carriage is lowered onto the track
        }
      }
      p.plate.visible = !word;
      if (p.carriage) {
        const wrong = state.wrong === i;
        if (wrong && !p.carriage.wasWrong) p.wrongAge = 0;
        p.carriage.wasWrong = wrong;
        setCarriageState(kit, p.carriage, { locked: Boolean(state.locked[i]), wrong });
      }
    });
  }

  function steamTick(dt) {
    sinceSteam += dt;
    const every = leaving ? 0.09 : 0.6;
    if (!reduced && sinceSteam >= every) {
      sinceSteam = 0;
      const puff = puffs[nextPuff++ % PUFFS];
      engine.chimney.getWorldPosition(chimney);
      puff.origin.copy(chimney);
      puff.age = 0;
    }
    for (const puff of puffs) {
      puff.age += dt;
      const { rise, scale, opacity } = steamPuff(puff.age);
      puff.mesh.visible = puff.age < STEAM_SECONDS;
      puff.mesh.position.set(puff.origin.x, puff.origin.y + rise, puff.origin.z);
      puff.mesh.scale.setScalar(scale);
      puff.mesh.material.opacity = opacity;
    }
  }

  return {
    el: container,
    show(next) {
      state = { words: [...next.words], locked: [...next.locked], wrong: next.wrong };
      applyState();
    },
    leave() {
      if (reduced || leaving) return;
      leaving = { age: 0 };
    },
    tick(dt) {
      if (!stage) return;
      clock += dt;
      const aspect = stage.size.width / Math.max(1, stage.size.height);
      if (Math.abs(aspect - lastAspect) > 0.02 || !tracks) relayout(aspect);
      let offset = 0;
      if (leaving) { leaving.age += dt; offset = trainOffset(leaving.age); }
      trainGroup.position.x = offset;
      const turn = -offset / WHEEL_RADIUS;
      for (const p of places) {
        if (!p.carriage) continue;
        p.dropAge = Math.min(DROP_SECONDS, p.dropAge + dt);
        p.wrongAge = Math.min(1, p.wrongAge + dt);
        p.carriage.group.position.y = dropHeight(p.dropAge) + (reduced ? 0 : wrongBounce(p.wrongAge));
        for (const wheel of p.carriage.wheels) wheel.rotation.y = turn;
      }
      for (const wheel of engine.wheels) wheel.rotation.y = turn;
      steamTick(dt);
      placeSlots(aspect);
    },
    draw() { stage?.render(); },
    dispose() {
      stage?.dispose();
      stage = null;
    },
  };
}
