import {
  Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, PlaneGeometry, InstancedMesh, Object3D, MeshLambertMaterial, MeshBasicMaterial,
  CanvasTexture, SRGBColorSpace, LinearFilter,
} from '../../../engine/three/three.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { CARRIAGE_LENGTH, fitFontSize } from '../logic/look3d.js';

/**
 * The toy train and its yard, built from simple shapes (no model files): an engine with a chimney, carriages that carry a word on both sides, a gold padlock
 * and a red cross for the hint and for a carriage in the wrong place, a plate marking a slot that is empty, and rails with sleepers. Geometry and materials are
 * made once (`createTrainKit`) and shared. A carriage's word is drawn on a small canvas and cached, so putting the same word in a slot again costs nothing.
 *
 * @typedef {ReturnType<typeof createTrainKit>} TrainKit
 * @typedef {{ group: Group, body: Mesh, faces: Mesh[], wheels: Mesh[], lock: Group, cross: object, wasWrong: boolean }} CarriageModel
 */

const INK = '#1f2544';
const BODY_Y = 0.98;
const WIDTH = 1.1;
const WHEEL_R = 0.33;
const paint = (color) => new MeshLambertMaterial({ color });

/** @param {{ detail: 'high'|'medium'|'low' }} quality */
export function createTrainKit(quality = { detail: 'high' }) {
  const seg = quality.detail === 'low' ? 10 : 18;
  return {
    geometries: {
      body: new BoxGeometry(CARRIAGE_LENGTH, 1.0, WIDTH),
      roof: new BoxGeometry(CARRIAGE_LENGTH + 0.12, 0.14, WIDTH + 0.12),
      face: new PlaneGeometry(CARRIAGE_LENGTH * 0.88, 0.8),
      wheel: new CylinderGeometry(WHEEL_R, WHEEL_R, 0.12, seg),
      hook: new BoxGeometry(0.55, 0.12, 0.12),
      spoke: new BoxGeometry(0.54, 0.04, 0.1),
      plate: new BoxGeometry(CARRIAGE_LENGTH, 0.1, WIDTH),
      lockBody: new BoxGeometry(0.42, 0.32, 0.22),
      lockArc: new TorusGeometry(0.14, 0.05, 6, 12, Math.PI),
      boiler: new CylinderGeometry(0.62, 0.62, 1.9, seg),
      cab: new BoxGeometry(1.0, 1.35, 1.2),
      chimney: new CylinderGeometry(0.2, 0.28, 0.7, seg),
      nose: new ConeGeometry(0.62, 0.45, seg),
      steam: new SphereGeometry(0.4, 10, 8),
      rail: new BoxGeometry(1, 0.12, 0.12),
      sleeper: new BoxGeometry(0.28, 0.08, 1.5),
      ground: new PlaneGeometry(1, 1),
    },
    materials: {
      body: paint('#ffe9a8'), locked: paint('#d9f0df'), wrong: paint('#ffd2cc'),
      roof: paint('#d89b2b'), wheel: paint(INK), hook: paint('#4a4a4a'),
      plate: new MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }),
      gold: paint('#f2b705'), red: paint('#d84b4b'), dark: paint(INK), steel: paint('#7b8794'),
      steam: new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }),
      rail: paint('#8d949e'), sleeper: paint('#7a5530'), ground: paint('#94d58b'),
    },
    /** The texture for a word, made the first time it is asked for. */
    wordTextures: new Map(),
    /** The red cross, made once; each carriage shows a clone that shares its picture. */
    crossProto: makeLabel('✖', { fontSize: 64, worldHeight: 0.75, color: '#ffffff', background: '#d32f2f', padding: 10 }),
  };
}

function wordTexture(word) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 182);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const family = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
  ctx.font = `800 110px ${family}`;
  const size = fitFontSize(ctx.measureText(word).width, 110, 456, 44);
  ctx.font = `800 ${size}px ${family}`;
  ctx.fillText(word, 256, 100);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
}

/** @param {TrainKit} kit @param {string} word @returns {MeshBasicMaterial} */
function faceMaterial(kit, word) {
  if (!kit.wordTextures.has(word)) kit.wordTextures.set(word, new MeshBasicMaterial({ map: wordTexture(word) }));
  return kit.wordTextures.get(word);
}

const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

/** The four wheels of a carriage (two on each side) or of the engine. */
function addWheels(group, kit, xs) {
  const wheels = [];
  for (const x of xs) for (const z of [-WIDTH / 2 - 0.02, WIDTH / 2 + 0.02]) {
    const wheel = at(new Mesh(kit.geometries.wheel, kit.materials.wheel), x, WHEEL_R, z);
    wheel.rotation.x = Math.PI / 2; // the wheel turns about the z axis, along the track's width
    // A spoke across its face, so that a turning wheel can be seen to turn.
    wheel.add(at(new Mesh(kit.geometries.spoke, kit.materials.steel), 0, 0.07, 0));
    group.add(wheel);
    wheels.push(wheel);
  }
  return wheels;
}

/**
 * A carriage with a word on both sides.
 * @param {TrainKit} kit
 * @param {string} word
 * @returns {CarriageModel}
 */
export function buildCarriage(kit, word) {
  const group = new Group();
  const body = at(new Mesh(kit.geometries.body, kit.materials.body), 0, BODY_Y, 0);
  const roof = at(new Mesh(kit.geometries.roof, kit.materials.roof), 0, BODY_Y + 0.57, 0);
  const faces = [1, -1].map((side) => {
    const face = at(new Mesh(kit.geometries.face, faceMaterial(kit, word)), 0, BODY_Y, side * (WIDTH / 2 + 0.01));
    if (side < 0) face.rotation.y = Math.PI;
    return face;
  });
  const wheels = addWheels(group, kit, [-CARRIAGE_LENGTH * 0.32, CARRIAGE_LENGTH * 0.32]);
  const hooks = [-1, 1].map((side) => at(new Mesh(kit.geometries.hook, kit.materials.hook), side * (CARRIAGE_LENGTH / 2 + 0.2), 0.62, 0));
  // The padlock of a hint: a gold body and a shackle on the roof, shown only while the carriage is locked.
  const lock = new Group();
  lock.add(at(new Mesh(kit.geometries.lockBody, kit.materials.gold), 0, 0, 0), at(new Mesh(kit.geometries.lockArc, kit.materials.gold), 0, 0.16, 0));
  lock.position.set(0, BODY_Y + 0.85, 0);
  lock.visible = false;
  // The red cross of a carriage in the wrong place (a shape, not only a colour).
  const cross = kit.crossProto.clone();
  cross.position.set(0, BODY_Y + 1.35, 0);
  cross.visible = false;
  group.add(body, roof, ...faces, ...hooks, lock, cross);
  return { group, body, faces, wheels, lock, cross, wasWrong: false };
}

/** Shows what a carriage looks like when a hint locked it or it is in the wrong place. @param {TrainKit} kit @param {CarriageModel} model */
export function setCarriageState(kit, model, { locked, wrong }) {
  model.body.material = wrong ? kit.materials.wrong : locked ? kit.materials.locked : kit.materials.body;
  model.lock.visible = locked;
  model.cross.visible = wrong;
}

/** The engine, facing right, with its chimney. @param {TrainKit} kit @returns {{ group: Group, wheels: Mesh[], chimney: Object3D }} */
export function buildEngine(kit) {
  const group = new Group();
  const boiler = at(new Mesh(kit.geometries.boiler, kit.materials.red), 0.3, 0.98, 0);
  boiler.rotation.z = Math.PI / 2;
  const nose = at(new Mesh(kit.geometries.nose, kit.materials.dark), 1.45, 0.98, 0);
  nose.rotation.z = -Math.PI / 2;
  const cab = at(new Mesh(kit.geometries.cab, kit.materials.red), -0.85, 1.12, 0);
  const roof = at(new Mesh(kit.geometries.roof, kit.materials.dark), -0.85, 1.85, 0);
  roof.scale.x = 0.38;
  const chimney = at(new Mesh(kit.geometries.chimney, kit.materials.dark), 0.75, 1.88, 0);
  const wheels = addWheels(group, kit, [-0.9, 0.1, 1.0]);
  const hook = at(new Mesh(kit.geometries.hook, kit.materials.hook), -1.5, 0.62, 0);
  group.add(boiler, nose, cab, roof, chimney, hook);
  const smoke = new Object3D();
  smoke.position.set(0.75, 2.3, 0);
  group.add(smoke);
  return { group, wheels, chimney: smoke };
}

/** A plate on the track marking a slot with no carriage in it yet, with its number beside it. @param {TrainKit} kit @param {number} number @returns {Group} */
export function buildSlotPlate(kit, number) {
  const group = new Group();
  group.add(at(new Mesh(kit.geometries.plate, kit.materials.plate), 0, 0.2, 0));
  const label = makeLabel(String(number), { fontSize: 64, worldHeight: 0.62, background: '#ffffff', padding: 12 });
  label.position.set(0, 0.7, WIDTH / 2 + 0.55);
  group.add(label);
  return group;
}

/**
 * The rails and sleepers of every row of track, and the ground, running far past the yard so the train can roll away along them.
 * @param {TrainKit} kit
 * @param {number[]} rowZs The z of each row's track.
 * @returns {Group}
 */
export function buildTracks(kit, rowZs) {
  const group = new Group();
  const length = 150;
  const ground = new Mesh(kit.geometries.ground, kit.materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(length, 60, 1);
  group.add(ground);
  const sleepers = new InstancedMesh(kit.geometries.sleeper, kit.materials.sleeper, rowZs.length * Math.floor(length / 0.85));
  const placer = new Object3D();
  let n = 0;
  rowZs.forEach((z) => {
    for (const side of [-1, 1]) {
      const rail = at(new Mesh(kit.geometries.rail, kit.materials.rail), 0, 0.14, z + side * 0.5);
      rail.scale.x = length;
      group.add(rail);
    }
    for (let x = -length / 2; x < length / 2; x += 0.85) {
      placer.position.set(x, 0.06, z);
      placer.updateMatrix();
      sleepers.setMatrixAt(n++, placer.matrix);
    }
  });
  sleepers.count = n;
  sleepers.instanceMatrix.needsUpdate = true;
  group.add(sleepers);
  return group;
}

