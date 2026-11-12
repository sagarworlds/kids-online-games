import {
  Group, Mesh, CylinderGeometry, ConeGeometry, BoxGeometry, SphereGeometry, MeshLambertMaterial,
} from '../../../engine/three/three.js';

/**
 * The small things on the globe, built from simple shapes (no model files): the plane that flies to each country and the
 * pin that marks a country the child has explored. A pin is a shape (not only a colour), so "visited" does not depend on seeing green.
 */

const paint = (color) => new MeshLambertMaterial({ color });

/** @param {import('../../../engine/three/three.js').BufferGeometry} geometry @param {string} color @param {[number, number, number]} at */
function part(geometry, color, at) {
  const mesh = new Mesh(geometry, paint(color));
  mesh.position.set(...at);
  return mesh;
}

/**
 * The plane, about 1 unit long with its nose along +z, so `lookAt` points it where it is going. The scene scales it.
 * @param {{ detail: 'low'|'high' }} quality
 * @returns {Group}
 */
export function createPlane({ detail }) {
  const sides = detail === 'high' ? 12 : 7;
  const plane = new Group();
  const body = part(new CylinderGeometry(0.11, 0.11, 0.85, sides), '#ffffff', [0, 0, -0.05]);
  body.rotation.x = Math.PI / 2; // a cylinder stands up by default; lay it along z
  const nose = part(new ConeGeometry(0.11, 0.26, sides), '#e5483b', [0, 0, 0.5]);
  nose.rotation.x = Math.PI / 2;
  plane.add(
    body, nose,
    part(new BoxGeometry(1.15, 0.035, 0.3), '#3b82f6', [0, -0.02, 0.05]),
    part(new BoxGeometry(0.4, 0.03, 0.14), '#3b82f6', [0, 0, -0.42]),
    part(new BoxGeometry(0.035, 0.26, 0.2), '#e5483b', [0, 0.14, -0.4]),
  );
  return plane;
}

/**
 * A pin that stands on the surface: a stem with a gold ball on top, pointing along +y (the caller turns it to point away
 * from the globe's middle).
 * @returns {Group}
 */
export function createPin() {
  const pin = new Group();
  pin.add(part(new CylinderGeometry(0.003, 0.003, 0.032, 5), '#6b4e16', [0, 0.016, 0]), part(new SphereGeometry(0.012, 8, 6), '#ffc43d', [0, 0.04, 0]));
  return pin;
}
