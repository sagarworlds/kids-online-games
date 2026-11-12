import {
  Group, Mesh, SphereGeometry, TorusGeometry, RingGeometry, MeshBasicMaterial, MeshLambertMaterial, AmbientLight, PointLight,
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, DoubleSide, AdditiveBlending, Sprite, SpriteMaterial, CanvasTexture,
} from '../../../engine/three/three.js';
import { createRng } from '../../../engine/utils/random.js';
import { approach } from '../logic/motion3d.js';
import { SUN_RADIUS, PICK_MIN_RADIUS, bodyRadius, moonPoint, orbitPoint, orbitRadius } from '../logic/space3d.js';
import { createPlanetTexture } from './planetTextures.js';

/**
 * The scenery both 3D scenes share: the Sun with its light, a field of stars, orbit rings, and a sphere for every
 * planet (and the Moon) that grows or shrinks when the child switches "Show real size".
 *
 * This class only builds and animates the picture. Which planet is where in a game round, and what a tap means, is the
 * scene's business, so the scenes can differ while the look stays the same in both.
 *
 * Everything is released by `Stage3D.dispose()`, which frees every geometry, material and texture in the scene.
 *
 * @typedef {import('../logic/space3d.js').Point} Point
 * @typedef {{
 *   body: { id: string, orbits?: string, order?: number },
 *   holder: import('../../../engine/three/three.js').Group,
 *   mesh: import('../../../engine/three/three.js').Mesh,
 *   pick: import('../../../engine/three/three.js').Mesh,
 *   radius: number, goal: number, spin: number
 * }} BodyEntry `holder` is where the body is (move this); `mesh` is the sphere that spins; `pick` is a larger,
 *   invisible sphere that makes a speck easy to tap; `radius` is the size now and `goal` the size it is growing to.
 * @typedef {'idle'|'target'|'wrong'|'filled'} OrbitState
 */

/** Saturn's and Uranus's rings, as multiples of the planet's radius, with the way each is tilted (x, y, z turns). */
const RINGS = {
  saturn: { inner: 1.35, outer: 2.0, color: '#c9a95a', turn: [-Math.PI / 2 + 0.35, 0, 0.2] },
  // Uranus spins on its side, so its thin ring stands up instead of lying flat (as in the 2D picture).
  uranus: { inner: 1.35, outer: 1.7, color: '#bfe9ec', turn: [0.15, 0.4, 0] },
};

const ORBIT_LOOKS = {
  idle: { color: '#8b96e8', opacity: 0.45 },
  target: { color: '#ffffff', opacity: 0.95 },
  wrong: { color: '#ff6b5e', opacity: 1 },
  filled: { color: '#ffd23f', opacity: 0.75 },
};

export class SolarSystem {
  /** The group everything is added to; the scene may add its own things to the Stage's scene too. */
  group = new Group();

  #quality;
  #sizer;
  /** @type {Map<string, BodyEntry>} */
  #bodies = new Map();
  /** @type {Map<number, { ring: import('../../../engine/three/three.js').Mesh, pick: import('../../../engine/three/three.js').Mesh }>} */
  #orbits = new Map();

  /**
   * @param {{
   *   scene: import('../../../engine/three/three.js').Scene,
   *   quality: import('../../../engine/three/support.js').Quality,
   *   sizer: (body: { radiusKm: number }) => number
   * }} options `sizer` gives a body's picture size in pixels (from `createSizer`), which becomes its radius here.
   */
  constructor({ scene, quality, sizer }) {
    this.#quality = quality;
    this.#sizer = sizer;
    scene.add(this.group);
    this.#addLights();
    this.#addSun();
    this.#addStars();
  }

  // -------------------------------------------------------------------------- building

  #addLights() {
    // The Sun lights every planet the same (decay 0): the farthest ones would otherwise be nearly black, and seeing
    // them clearly matters more here than the true brightness. The ambient light keeps the night side readable.
    this.group.add(new AmbientLight('#b8c4ff', 1.1), new PointLight('#fff1d0', Math.PI * 1.05, 0, 0));
  }

  #addSun() {
    const segments = this.#quality.detail === 'high' ? 32 : 16;
    const sun = new Mesh(new SphereGeometry(SUN_RADIUS, segments, segments / 2), new MeshBasicMaterial({ color: '#ffd23f' }));
    this.group.add(sun, this.#makeGlow());
  }

  /** A soft orange halo: a flat picture that fades from the middle to nothing, always facing the camera. Far cheaper than a real glow effect. */
  #makeGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    fade.addColorStop(0.25, 'rgba(255, 190, 70, 0.95)');
    fade.addColorStop(0.55, 'rgba(255, 140, 20, 0.35)');
    fade.addColorStop(1, 'rgba(255, 120, 0, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
    const glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    glow.scale.setScalar(SUN_RADIUS * 4.2);
    return glow;
  }

  #addStars() {
    // A fixed seed: the sky is the same every visit, so it never looks like something changed on the child.
    const rng = createRng(20240601);
    const count = this.#quality.detail === 'high' ? 500 : 250;
    const positions = [];
    for (let i = 0; i < count; i++) {
      const turn = rng() * Math.PI * 2;
      const lift = rng() * 2 - 1;
      const ring = Math.sqrt(1 - lift * lift);
      const distance = 110 + rng() * 25;
      positions.push(Math.cos(turn) * ring * distance, lift * distance, Math.sin(turn) * ring * distance);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.group.add(new Points(geometry, new PointsMaterial({ color: '#ffffff', size: 0.8, sizeAttenuation: true })));
  }

  /**
   * Draws the ring for an orbit and an invisible, wider ring to tap on.
   * @param {number} order The planet's number from the Sun, starting at 1.
   * @returns {{ ring: import('../../../engine/three/three.js').Mesh, pick: import('../../../engine/three/three.js').Mesh }}
   */
  addOrbit(order) {
    const radius = orbitRadius(order);
    const ring = new Mesh(new TorusGeometry(radius, 0.03, 4, 96), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
    const pick = new Mesh(new TorusGeometry(radius, 0.5, 6, 64), new MeshBasicMaterial({ visible: false }));
    pick.userData.orbit = order;
    // A torus is drawn standing up by default; the solar system lies flat.
    ring.rotation.x = pick.rotation.x = Math.PI / 2;
    this.group.add(ring, pick);
    this.#orbits.set(order, { ring, pick });
    this.setOrbitState(order, 'idle');
    return { ring, pick };
  }

  /** @param {number} order @param {OrbitState} state */
  setOrbitState(order, state) {
    const orbit = this.#orbits.get(order);
    if (!orbit) return;
    const look = ORBIT_LOOKS[state];
    orbit.ring.material.color.set(look.color);
    orbit.ring.material.opacity = look.opacity;
  }

  /** @returns {import('../../../engine/three/three.js').Mesh[]} The invisible rings to tap on, one for each orbit added. */
  orbitPickTargets() {
    return [...this.#orbits.values()].map((o) => o.pick);
  }

  /**
   * Adds a planet or the Moon at its starting place.
   * @param {{ id: string, color: string, radiusKm: number, order?: number, orbits?: string }} body
   * @returns {BodyEntry}
   */
  addBody(body) {
    const segments = this.#quality.detail === 'high' ? 28 : 14;
    const radius = bodyRadius(this.#sizer(body));
    const holder = new Group();
    const mesh = new Mesh(
      new SphereGeometry(1, segments, Math.max(8, segments / 2)),
      new MeshLambertMaterial({ map: createPlanetTexture(body, this.#quality) }),
    );
    const pick = new Mesh(new SphereGeometry(1, 8, 6), new MeshBasicMaterial({ visible: false }));
    pick.userData.bodyId = body.id;
    holder.add(mesh, pick);

    const ring = RINGS[body.id];
    if (ring) {
      const band = new Mesh(new RingGeometry(ring.inner, ring.outer, 48), new MeshBasicMaterial({ color: ring.color, side: DoubleSide, transparent: true, opacity: 0.85 }));
      band.rotation.set(...ring.turn);
      band.name = 'ring';
      holder.add(band);
    }
    // Spin speeds differ a little so the planets do not turn in step like a row of toys on one motor.
    const entry = { body, holder, mesh, pick, radius, goal: radius, spin: 0.12 + ((body.id.length * 7) % 5) * 0.05 };
    this.#bodies.set(body.id, entry);
    this.group.add(holder);
    this.#applySize(entry);
    if (body.order) {
      const start = orbitPoint(body.order);
      holder.position.set(start.x, start.y, start.z);
    }
    this.#placeMoons();
    return entry;
  }

  // -------------------------------------------------------------------------- asking

  /** @param {string} id @returns {BodyEntry|undefined} */
  entry(id) {
    return this.#bodies.get(id);
  }

  /** @param {string} id @returns {number} The body's radius right now (it grows and shrinks when the size switch changes). */
  radiusOf(id) {
    return this.#bodies.get(id)?.radius ?? 0;
  }

  /** @returns {import('../../../engine/three/three.js').Mesh[]} The bodies' invisible tap spheres. */
  bodyPickTargets() {
    return [...this.#bodies.values()].map((e) => e.pick);
  }

  // -------------------------------------------------------------------------- changing

  /**
   * Makes every body grow or shrink to the size for the compressed or the "real size" view. The change is smooth (see
   * `update`), or instant when `instant` is true (for a child who asked for less motion).
   * @param {boolean} real
   * @param {(body: { radiusKm: number }) => number} sizer The new size function from `createSizer(bodies, { real })`.
   * @param {boolean} [instant]
   */
  setSizer(real, sizer, instant = false) {
    this.#sizer = sizer;
    for (const entry of this.#bodies.values()) {
      entry.goal = bodyRadius(sizer(entry.body));
      if (instant) entry.radius = entry.goal;
      this.#applySize(entry);
    }
    this.#placeMoons();
  }

  /**
   * Advances the spin and the growing. Call it every frame.
   * @param {number} dt Seconds since the last frame.
   * @param {{ reducedMotion?: boolean }} [options] Spinning stops, and sizes jump, when motion is turned down.
   */
  update(dt, { reducedMotion = false } = {}) {
    for (const entry of this.#bodies.values()) {
      if (!reducedMotion) entry.mesh.rotation.y += entry.spin * dt;
      const next = reducedMotion ? entry.goal : approach(entry.radius, entry.goal, dt, 5);
      if (next !== entry.radius) {
        entry.radius = next;
        this.#applySize(entry);
      }
    }
    this.#placeMoons();
  }

  #applySize(entry) {
    const { radius } = entry;
    entry.mesh.scale.setScalar(radius);
    entry.pick.scale.setScalar(Math.max(radius, PICK_MIN_RADIUS));
    entry.holder.getObjectByName('ring')?.scale.setScalar(radius);
  }

  /** A body that orbits a planet (the Moon) stays beside it, even while the planet is growing or shrinking. */
  #placeMoons() {
    for (const entry of this.#bodies.values()) {
      const parent = entry.body.orbits ? this.#bodies.get(entry.body.orbits) : null;
      if (!parent) continue;
      const point = moonPoint(parent.holder.position, parent.radius, entry.radius);
      entry.holder.position.set(point.x, point.y, point.z);
    }
  }
}
