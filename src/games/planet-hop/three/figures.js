import {
  Group, Mesh, CylinderGeometry, ConeGeometry, SphereGeometry, BoxGeometry, CapsuleGeometry, MeshLambertMaterial,
} from '../../../engine/three/three.js';

/**
 * The rocket and the astronaut, built from a handful of simple shapes (no model files). Each is a group whose feet are
 * at y = 0, so putting one on a planet is just placing its group at the planet's surface.
 *
 * Both are made to be seen from far away: big flat colours and a dark outline-ish visor, not fine detail.
 */

const WHITE = '#f5f5f5';
const RED = '#e5483b';

/** @param {string} color @returns {MeshLambertMaterial} */
const paint = (color) => new MeshLambertMaterial({ color });

/** @param {import('../../../engine/three/three.js').BufferGeometry} geometry @param {string} color @param {[number, number, number]} at */
function part(geometry, color, at) {
  const mesh = new Mesh(geometry, paint(color));
  mesh.position.set(...at);
  return mesh;
}

/**
 * The rocket, about 0.9 units tall, pointing up (+y).
 * @param {{ detail: 'low'|'high' }} quality
 * @returns {import('../../../engine/three/three.js').Group}
 */
export function createRocket({ detail }) {
  const sides = detail === 'high' ? 14 : 8;
  const rocket = new Group();
  rocket.add(
    part(new CylinderGeometry(0.14, 0.14, 0.5, sides), WHITE, [0, 0.4, 0]),
    part(new ConeGeometry(0.14, 0.3, sides), RED, [0, 0.8, 0]),
    part(new ConeGeometry(0.09, 0.14, sides), '#ffb300', [0, 0.07, 0]),
    part(new SphereGeometry(0.07, sides, 6), '#6ecbff', [0, 0.5, 0.115]),
  );
  // Three fins, 120 degrees apart, so the rocket looks the same from every side as the child turns the view.
  for (let i = 0; i < 3; i++) {
    const fin = part(new BoxGeometry(0.04, 0.22, 0.2), RED, [0, 0.2, 0]);
    const angle = (i * Math.PI * 2) / 3;
    fin.position.set(Math.sin(angle) * 0.16, 0.2, Math.cos(angle) * 0.16);
    fin.rotation.y = angle;
    rocket.add(fin);
  }
  return rocket;
}

/**
 * The astronaut, about 0.7 units tall, facing +z (the visor is on that side).
 * @param {{ detail: 'low'|'high' }} quality
 * @returns {import('../../../engine/three/three.js').Group}
 */
export function createAstronaut({ detail }) {
  const sides = detail === 'high' ? 12 : 7;
  const astronaut = new Group();
  const visor = part(new SphereGeometry(0.1, sides, 6), '#243a73', [0, 0.57, 0.07]);
  visor.scale.set(1, 0.8, 0.7);
  astronaut.add(
    part(new CapsuleGeometry(0.12, 0.2, 2, sides), WHITE, [0, 0.3, 0]),
    part(new SphereGeometry(0.14, sides, 8), WHITE, [0, 0.58, 0]),
    visor,
    part(new BoxGeometry(0.2, 0.26, 0.1), '#d7dbe8', [0, 0.32, -0.14]),
    part(new BoxGeometry(0.08, 0.06, 0.14), '#8b96e8', [-0.07, 0.03, 0.02]),
    part(new BoxGeometry(0.08, 0.06, 0.14), '#8b96e8', [0.07, 0.03, 0.02]),
  );
  return astronaut;
}
