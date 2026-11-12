import {
  Group, Mesh, CylinderGeometry, SphereGeometry, ConeGeometry, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial,
} from '../../../engine/three/three.js';
import { createGlowTexture, createGlowSprite, FIREFLY_GLOW } from '../../../engine/three/glow.js';
import { CELL, JAR_RADIUS, JAR_HEIGHT, JAR_BASE, BOUNCE_SECONDS, boardWidth, cellPosition } from '../logic/look3d.js';

/**
 * The jars, the fireflies, the table and the hint arrow, built from simple shapes (no model files). The geometry, the materials and the glow
 * picture are made once for a board (`createJarKit`) and shared by all its jars.
 *
 * A jar that is lit has a firefly inside and a warm glow; a jar that is dark is empty and cool. They differ by shape and brightness, never by
 * colour alone, as in the flat grid.
 *
 * @typedef {ReturnType<typeof createJarKit>} JarKit
 * @typedef {{
 *   group: Group, jar: Group, pad: Mesh, glass: Mesh, firefly: Group, pickable: Mesh[],
 *   lit: boolean, glow: number, age: number
 * }} JarModel `jar` is the part that bounces (the pad stays put); `glow` runs 0 (dark) to 1 (lit) as the jar changes; `age` is the seconds
 *   since it was last flipped.
 */

const paint = (color) => new MeshLambertMaterial({ color });
const BASE = JAR_BASE; // the jar stands on its pad
const HIT_HEIGHT = BASE + JAR_HEIGHT + 0.16; // as tall as the jar with its lid

/** @param {{ detail: 'high'|'medium'|'low' }} quality */
export function createJarKit(quality = { detail: 'high' }) {
  const segments = quality.detail === 'low' ? 12 : 20;
  return {
    glassGeometry: new CylinderGeometry(JAR_RADIUS, JAR_RADIUS * 0.9, JAR_HEIGHT, segments),
    lidGeometry: new CylinderGeometry(JAR_RADIUS * 0.82, JAR_RADIUS * 0.82, 0.16, segments),
    padGeometry: new CylinderGeometry(CELL * 0.47, CELL * 0.47, BASE, segments + 8),
    hitGeometry: new CylinderGeometry(JAR_RADIUS, JAR_RADIUS, HIT_HEIGHT, 12),
    bodyGeometry: new SphereGeometry(0.1, 10, 8),
    wingGeometry: new SphereGeometry(0.1, 8, 6),
    arrowGeometry: new ConeGeometry(0.3, 0.6, 12),
    glowTexture: createGlowTexture(FIREFLY_GLOW),
    materials: {
      glassOff: new MeshLambertMaterial({ color: '#aab4f0', transparent: true, opacity: 0.3, depthWrite: false }),
      glassOn: new MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.5, depthWrite: false }),
      lid: paint('#9aa0d8'),
      padOff: paint('#2b3070'),
      padOn: paint('#7a6416'),
      body: new MeshBasicMaterial({ color: '#ffe066' }),
      wing: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
      arrow: new MeshBasicMaterial({ color: '#ffffff' }),
      wood: paint('#4a3320'),
      hit: new MeshBasicMaterial({ visible: false }),
    },
  };
}

const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

/** A firefly: a small body, two flat wings and a soft glow. @param {JarKit} kit @returns {Group} */
export function buildFirefly(kit) {
  const firefly = new Group();
  const body = at(new Mesh(kit.bodyGeometry, kit.materials.body), 0, 0, 0);
  body.scale.set(1, 1.5, 1);
  firefly.add(body);
  for (const side of [-1, 1]) {
    const wing = at(new Mesh(kit.wingGeometry, kit.materials.wing), side * 0.15, 0.06, 0);
    wing.scale.set(1.5, 0.25, 0.9);
    wing.rotation.z = side * 0.5;
    firefly.add(wing);
  }
  const glow = createGlowSprite(kit.glowTexture);
  glow.scale.setScalar(1.1);
  firefly.add(glow);
  return firefly;
}

/**
 * One jar: a coaster, a glass jar with a lid, and a firefly inside (shown only while the jar is lit).
 * @param {JarKit} kit
 * @param {number} r
 * @param {number} c
 * @param {number} size
 * @returns {JarModel}
 */
export function buildJar(kit, r, c, size) {
  const { x, z } = cellPosition(r, c, size);
  const group = new Group();
  group.position.set(x, 0, z);
  const pad = at(new Mesh(kit.padGeometry, kit.materials.padOff), 0, BASE / 2, 0);
  const jar = new Group();
  const glass = at(new Mesh(kit.glassGeometry, kit.materials.glassOff), 0, BASE + JAR_HEIGHT / 2, 0);
  glass.renderOrder = 2; // after the firefly inside, so the glass is drawn over it
  const lid = at(new Mesh(kit.lidGeometry, kit.materials.lid), 0, BASE + JAR_HEIGHT + 0.08, 0);
  const firefly = buildFirefly(kit);
  firefly.position.y = BASE + JAR_HEIGHT * 0.45;
  firefly.visible = false;
  jar.add(glass, lid, firefly);
  group.add(pad, jar);
  // What a tap can hit is the coaster and an invisible stand-in for the jar, the size of the jar with its lid. Neither moves when the jar bounces:
  // if the jars were picked where they are drawn, a bouncing jar in front could catch a tap meant for the jar behind it.
  const hitbox = at(new Mesh(kit.hitGeometry, kit.materials.hit), 0, HIT_HEIGHT / 2, 0);
  group.add(hitbox);
  const pickable = [pad, hitbox];
  for (const mesh of pickable) mesh.userData.cell = [r, c];
  return { group, jar, pad, glass, firefly, pickable, lit: false, glow: 0, age: BOUNCE_SECONDS };
}

/** Makes a jar look lit or dark (the glow animates between; this is the part that does not). @param {JarKit} kit @param {JarModel} model @param {boolean} lit */
export function setJarLit(kit, model, lit) {
  model.lit = lit;
  model.glass.material = lit ? kit.materials.glassOn : kit.materials.glassOff;
  model.pad.material = lit ? kit.materials.padOn : kit.materials.padOff;
  model.firefly.visible = lit;
}

/** The table the jars stand on. @param {JarKit} kit @param {number} size @returns {Mesh} */
export function buildTable(kit, size) {
  const width = boardWidth(size);
  return at(new Mesh(new BoxGeometry(width, 0.3, width), kit.materials.wood), 0, -0.15, 0);
}

/** The arrow that points down at the hinted jar. @param {JarKit} kit @returns {Mesh} */
export function buildArrow(kit) {
  const arrow = new Mesh(kit.arrowGeometry, kit.materials.arrow);
  arrow.rotation.x = Math.PI; // the cone's point faces down
  arrow.visible = false;
  return arrow;
}
