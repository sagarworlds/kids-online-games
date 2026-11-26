import {
  Mesh, CircleGeometry, SphereGeometry, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial, AmbientLight, DirectionalLight, Fog, Color,
  InstancedMesh, Object3D, Group,
} from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { createGlowSprite } from '../../../engine/three/glow.js';
import { approach } from '../../../engine/three/motionMath.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import {
  growthOf, droopFor, tintFor, mixHex, weatherLook, sunPosition, skyAt, rainLayout, MORNING,
} from '../logic/look3d.js';
import { buildPlant, buildPot, buildCloud } from './plantModels.js';

/**
 * The garden in 3D: the plant in its pot on the grass, which the child can turn and zoom. It shows what the game already decided: the plant
 * grows taller and puts out leaves, buds, flowers and fruit stage by stage; it droops when it is wilting or thirsty and its leaves change
 * colour when something is wrong; the pot smiles or frowns; the weather is in the sky (a bright sun, clouds, rain falling, a big hot sun with
 * haze); and when a day is lived the sun crosses the sky.
 *
 * It has the same `update` as the flat picture (`createPlantArt`), plus `setWeather`, `playDay`, `tick` and `render`. If 3D cannot start, or the
 * graphics are lost, it carries on in place with the flat picture, so the child's garden is never lost.
 *
 * @typedef {{ stage: number, mood: 'happy'|'ok'|'wilting', problem?: string|null }} Look
 * @typedef {{
 *   el: HTMLElement,
 *   update: (look: Look, options?: { animate?: boolean }) => void,
 *   setWeather: (kind: string) => void,
 *   playDay: () => void,
 *   tick: (dt: number) => void,
 *   render: () => void,
 *   dispose: () => void
 * }} PlantStage3D
 */

const DAY_SECONDS = 2.8;
const SOIL = '#5a3a22';
const DRY_SOIL = '#c9a27a';
const RAIN_DROPS = 160;
const RAIN_BOX = { width: 14, depth: 10, height: 9 };
const LIMITS = Object.freeze({ minPolar: 0.55, maxPolar: 1.5, minDistance: 5, maxDistance: 16 });
/** Where the camera starts: a little to the right of the pot's front and a little above it, with the pot's face and the sun's path both in view. */
const START_VIEW = Object.freeze({ azimuth: 0.4, polar: 1.36, distance: 9.5 });
const TARGET = Object.freeze({ x: 0, y: 2.3, z: 0 });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {{ plant: { id: string }, createFlat: () => { el: Element, update: Function }, onFallBack: () => void }} options `createFlat` makes the flat
 *   picture used if 3D cannot run; `onFallBack` is told when that happens (the game then stays flat for the visit).
 * @returns {PlantStage3D}
 */
export function createPlantStage3D({ plant, createFlat, onFallBack }) {
  const container = el('div', { class: 'scene3d__stage plant3d' });
  /** @type {Look} */
  let lastLook = { stage: 0, mood: 'happy', problem: null };
  let weather = 'sunny';
  let flat = null;
  let view = null;

  function degrade(reason) {
    logError(new Error(`3D garden stopped: ${reason}`), 'plant-grower:3d');
    view?.dispose();
    view = null;
    flat = createFlat();
    container.append(flat.el);
    container.classList.add('plant3d--flat', `weather--${weather}`);
    flat.update(lastLook, { animate: false });
    onFallBack();
  }

  try {
    view = new OrbitStage({
      container, background: '#8fdcff', fov: 40, near: 0.1, far: 200, limits: LIMITS, target: TARGET,
      label: `3D ${plant.id} growing in a pot. Drag to turn it. What the plant needs and how it is feeling are written on the page.`,
      orbit: { ...START_VIEW },
      onContextLost: () => degrade('the graphics were lost'),
    });
  } catch (error) {
    logError(error, 'plant-grower:3d');
    degrade('3D could not start');
  }

  // Everything below only runs with a 3D view; a flat garden returns the small interface at the end.
  let tickFn = () => {};
  let updateFn = null;
  let weatherFn = null;
  let dayFn = () => {};

  if (view) {
    const { scene } = view.stage;
    scene.fog = new Fog('#8fdcff', 18, 70);
    const ambient = new AmbientLight('#ffffff', Math.PI * 0.7);
    const sunLight = new DirectionalLight('#ffffff', Math.PI * 0.8);
    scene.add(ambient, sunLight);

    const ground = new Mesh(new CircleGeometry(40, 40), new MeshLambertMaterial({ color: '#7ccb73' }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const pot = buildPot();
    scene.add(pot.group);
    const model = buildPlant(plant.id);
    model.group.position.y = 1.3;
    scene.add(model.group);
    // Each part pops in when its stage comes; the stem is added to the group already.
    for (const part of model.parts) { part.object.visible = false; part.object.userData.pop = 0; model.group.add(part.object); }
    for (const material of model.leafMaterials) material.userData.base = `#${material.color.getHexString()}`;

    // The sun: a ball with a glow, which crosses the sky when a day is lived.
    const sun = new Group();
    sun.add(new Mesh(new SphereGeometry(1, 16, 12), new MeshBasicMaterial({ color: '#ffd23f' })), createGlowSprite());
    sun.children[1].scale.setScalar(4);
    sun.scale.setScalar(1.1);
    scene.add(sun);

    // Clouds, which drift across; how many show depends on the weather. They live in a group turned like the sun's path, so that "across"
    // is across the picture from where the camera starts.
    const sky = new Group();
    sky.rotation.y = START_VIEW.azimuth;
    scene.add(sky);
    const clouds = [[3.2, 6.2, -12, 1.15], [-4.5, 5.6, -10, 0.9], [-0.5, 4.8, -15, 1.0], [6, 4.9, -11, 0.8], [0.5, 6.9, -18, 1.3]].map(([x, y, z, size]) => {
      const cloud = buildCloud(size);
      cloud.position.set(x, y, z);
      sky.add(cloud);
      return cloud;
    });

    // Rain: short streaks that fall and start again at the top. One draw call for all of them.
    const layout = rainLayout({ count: RAIN_DROPS, seed: 5, ...RAIN_BOX });
    const rain = new InstancedMesh(new BoxGeometry(0.05, 0.55, 0.05), new MeshBasicMaterial({ color: '#3f83d4' }), layout.length);
    const placer = new Object3D();
    const placeRain = () => {
      layout.forEach((drop, i) => { placer.position.set(drop.x, drop.y, drop.z); placer.updateMatrix(); rain.setMatrixAt(i, placer.matrix); });
      rain.instanceMatrix.needsUpdate = true;
    };
    placeRain();
    rain.visible = false;
    rain.frustumCulled = false;
    scene.add(rain);

    // Drops of sweat on a plant that has had too much sun.
    const sweat = new Group();
    const dropGeometry = new SphereGeometry(0.1, 8, 6);
    for (let i = 0; i < 3; i++) sweat.add(new Mesh(dropGeometry, new MeshBasicMaterial({ color: '#4fc3f7' })));
    sweat.visible = false;
    scene.add(sweat);

    const state = {
      look: lastLook, growth: 0, lean: 0, leaf: 0, light: 1, dayProgress: MORNING, dayClock: -1, clock: 0,
    };
    const current = () => weatherLook(weather);

    function applyLook(snap) {
      const { stage, mood, problem = null } = state.look;
      model.stem.visible = stage > 0;
      for (const part of model.parts) part.object.visible = stage >= part.at && (part.until === undefined || stage < part.until);
      for (const [name, mouth] of Object.entries(pot.mouths)) mouth.visible = name === mood;
      pot.puddle.visible = problem === 'puddle';
      sweat.visible = problem === 'sweaty';
      const tint = tintFor(problem);
      for (const material of model.leafMaterials) material.color.set(tint.leaf ? mixHex(material.userData.base, tint.leaf, tint.amount) : material.userData.base);
      pot.soil.color.set(problem === 'thirsty' ? DRY_SOIL : SOIL);
      state.target = { growth: growthOf(stage), ...droopFor({ mood, problem }), light: tint.light };
      if (snap) Object.assign(state, state.target);
    }

    function applyWeather() {
      const look = current();
      rain.visible = look.rain;
      clouds.forEach((cloud, i) => { cloud.visible = i < Math.round(look.clouds * clouds.length); });
      sun.visible = look.sun > 0;
      sun.scale.setScalar(1.1 * Math.max(0.5, look.sun));
      scene.fog.near = look.haze > 0 ? 10 : 18;
      scene.fog.far = look.haze > 0 ? 36 : 70;
    }

    function applyDay() {
      const look = current();
      const p = sunPosition(state.dayProgress, START_VIEW.azimuth);
      sun.position.set(p.x, p.y, p.z);
      // The light comes from the sun's side and above but always from the front, so the plant's face is lit even when the sun is behind it.
      sunLight.position.set(p.x, p.y + 4, 8);
      sunLight.intensity = Math.PI * 0.8 * Math.max(0.35, look.sun) * state.light;
      ambient.intensity = Math.PI * (0.55 + 0.25 * state.light);
      const sky = skyAt(look.sky, state.dayProgress);
      scene.background = new Color(sky);
      scene.fog.color.set(sky);
    }

    updateFn = (look, { animate = true } = {}) => {
      lastLook = look;
      state.look = look;
      applyLook(!animate);
      for (const part of model.parts) if (!animate) part.object.userData.pop = 1;
    };
    weatherFn = (kind) => {
      weather = kind;
      state.dayProgress = MORNING;
      state.dayClock = -1;
      applyWeather();
      applyDay();
    };
    dayFn = () => {
      if (view.reducedMotion) { state.dayProgress = 0.5; applyDay(); return; }
      state.dayClock = 0;
    };

    tickFn = (dt) => {
      state.clock += dt;
      const calm = view.reducedMotion;
      view.update(dt);
      // Growing and drooping glide to where the state of the game says they should be.
      const t = state.target ?? { growth: 0, lean: 0, leaf: 0, light: 1 };
      state.growth = calm ? t.growth : approach(state.growth, t.growth, dt, 2.2);
      state.lean = calm ? t.lean : approach(state.lean, t.lean, dt, 2);
      state.leaf = calm ? t.leaf : approach(state.leaf, t.leaf, dt, 2.5);
      state.light = calm ? t.light : approach(state.light, t.light, dt, 3);
      model.stem.scale.y = Math.max(0.001, model.height * state.growth);
      model.stem.position.y = model.stem.scale.y / 2;
      const sway = !calm && state.look.mood === 'happy' ? Math.sin(state.clock * 1.5) * 0.035 : 0;
      model.group.rotation.z = -state.lean + sway;
      // Drooping turns each leaf from its healthy angle down past flat (a full droop hangs about 60 degrees below it).
      for (const leaf of model.leaves) leaf.pivot.rotation.z = leaf.side * (leaf.up - state.leaf * 1.4);
      for (const part of model.parts) {
        part.fit?.(state.growth);
        const s = part.object.visible ? (calm ? 1 : approach(part.object.userData.pop, 1, dt, 4)) : 0;
        part.object.userData.pop = part.object.visible ? s : 0;
        part.object.scale.setScalar(Math.max(0.001, s));
      }
      // The sun crosses the sky while a day is lived, then stays low in the evening until the next morning.
      if (state.dayClock >= 0) {
        state.dayClock += dt;
        state.dayProgress = clamp(MORNING + (1 - MORNING) * (state.dayClock / DAY_SECONDS), MORNING, 1);
        if (state.dayClock >= DAY_SECONDS) state.dayClock = -1;
      }
      applyDay();
      if (!calm) {
        clouds.forEach((cloud, i) => { cloud.position.x += dt * (0.2 + i * 0.04); if (cloud.position.x > 11) cloud.position.x = -11; });
      }
      if (rain.visible) {
        if (!calm) layout.forEach((drop) => { drop.y -= drop.speed * dt; if (drop.y < 0) drop.y += RAIN_BOX.height; });
        placeRain();
      }
      if (sweat.visible) sweat.children.forEach((drop, i) => {
        const phase = calm ? 0.4 : (state.clock * 0.7 + i / 3) % 1;
        drop.position.set(-0.9 + i * 0.9, 3.4 - phase * 1.4, 0.5);
        drop.visible = phase < 0.95;
      });
    };
    weatherFn('sunny');
    applyLook(true);
  }

  return {
    el: container,
    update(look, options) {
      lastLook = look;
      if (flat) flat.update(look, options);
      else updateFn?.(look, options);
    },
    setWeather(kind) {
      weather = kind;
      if (flat) {
        container.className = container.className.replace(/weather--\w+/g, '').trim();
        container.classList.add(`weather--${kind}`);
      } else weatherFn?.(kind);
    },
    playDay() { if (!flat) dayFn(); },
    tick(dt) { if (!flat) tickFn(dt); },
    render() { view?.render(); },
    dispose() { view?.dispose(); view = null; },
  };
}
