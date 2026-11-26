import {
  Group, Mesh, SphereGeometry, MeshBasicMaterial, AmbientLight, DirectionalLight, Vector3, BackSide, AdditiveBlending,
} from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { createStarfield } from '../../../engine/three/starfield.js';
import { makeLabel } from '../../../engine/three/labels.js';
import { disposeObject } from '../../../engine/three/Stage3D.js';
import { easeInOut } from '../../../engine/three/motionMath.js';
import { orbitPosition } from '../../../engine/three/orbitMath.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { resolveTap } from '../logic/mapView.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../logic/projection.js';
import {
  FOV, MIN_DISTANCE, MAX_DISTANCE, POLAR_MARGIN, GLOBE_RADIUS, anchorToPoint, mapToLonLat, facingFor, homeFraming, dragSpeed,
  pixelsPerMapUnit, sceneUnitsPerPixel, uvToMapPoint, greatCirclePoint, angleBetween, flightSeconds, cruiseHeight, flightHeight,
} from '../logic/globe.js';
import { createGlobeSkin } from './globeSkin.js';
import { createPlane, createPin } from './globeParts.js';

/**
 * The world map as a globe: the same countries as the 2D `WorldMap`, wrapped round a sphere the child can spin and zoom,
 * with a plane that flies the great-circle route to each country and a pin on every country they have explored.
 *
 * It has the same interface as the 2D map (`setExplored`, `setHome`, `highlight`, `flyPlaneTo`, `destroy`, and the `onTap`
 * option), so the scenes use either one the same way, plus what a 3D picture needs (`update`, `render`). The globe only
 * shows what the scene tells it; which countries are explored, and what a tap means, is the quiz's business.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{
 *   el: HTMLElement,
 *   setExplored: (codes: ReadonlySet<string>) => void,
 *   setHome: (rect: Rect, options?: { animate?: boolean }) => void,
 *   highlight: (code: string|null, label?: string) => void,
 *   flyPlaneTo: (code: string) => Promise<void>,
 *   destroy: () => void,
 *   update: (dt: number) => void,
 *   render: () => void
 * }} GlobeMap
 */

const BUTTON_STEP = 1.6;
const LIMITS = Object.freeze({ minPolar: POLAR_MARGIN, maxPolar: Math.PI - POLAR_MARGIN, minDistance: MIN_DISTANCE, maxDistance: MAX_DISTANCE });
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
/** The whole flat map, which the globe shows until a scene says otherwise. */
const WHOLE_WORLD = Object.freeze({ x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT });
/** How high the plane hovers over a country once it has landed. */
const HOVER = 0.022;
/** On-screen sizes, in pixels, of the plane and of a country's name, however far the camera is. */
const PLANE_PIXELS = 38;
const LABEL_PIXELS = 24;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toUnit = (v) => { const length = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / length, y: v.y / length, z: v.z / length }; };

/**
 * @param {{
 *   world: import('../ui/worldData.js').World,
 *   label: string,
 *   onTap?: (code: string|null) => void,
 *   onContextLost: () => void
 * }} options `onTap` is called with the country that was tapped (null for the sea or space). Without it the globe is for looking.
 * @returns {GlobeMap}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' or 'CANVAS_UNAVAILABLE' when the
 *   device cannot do 3D; the caller opens the 2D map instead.
 */
export function createGlobeMap({ world, label, onTap, onContextLost }) {
  const anchors = world.countries.map(({ code, cx, cy, r }) => ({ code, cx, cy, r }));
  const anchorOf = new Map(anchors.map((a) => [a.code, a]));
  const stageEl = el('div', { class: 'map__stage' });
  const controls = el('div', { class: 'map__controls', attrs: { role: 'group', 'aria-label': 'Globe controls' } },
    createButton({ icon: '＋', ariaLabel: 'Zoom in', onClick: () => zoomBy(BUTTON_STEP) }),
    createButton({ icon: '－', ariaLabel: 'Zoom out', onClick: () => zoomBy(1 / BUTTON_STEP) }),
    createButton({ icon: '⤢', ariaLabel: 'Show the whole area again', onClick: () => setHome(home, { animate: true }) }));
  const root = el('div', { class: 'map map--globe', attrs: { role: 'group', 'aria-label': `${label}. Drag to spin the globe, pinch or use the plus and minus buttons to zoom.` } }, stageEl, controls);

  const view = new OrbitStage({
    container: stageEl, background: '#050a24', fov: FOV, far: 300, limits: LIMITS, target: ORIGIN, onContextLost, onTap: handleTap,
    label: `3D globe. ${label}`,
    speed: (orbit) => dragSpeed(orbit.distance),
    orbit: (stage) => homeFraming({ rect: WHOLE_WORLD, aspect: stage.size.width / stage.size.height }),
  });
  const { scene, quality } = view.stage;

  // ------------------------------------------------------------------------------------------ the picture
  const skin = createGlobeSkin({ world, detail: quality.detail });
  const segments = quality.detail === 'high' ? 64 : 32;
  const globe = new Mesh(new SphereGeometry(GLOBE_RADIUS, segments, segments / 2), new MeshBasicMaterial({ map: skin.texture }));
  // A soft blue rim a little outside the sphere makes it read as a planet against the dark sky, for one extra mesh.
  const rim = new Mesh(new SphereGeometry(GLOBE_RADIUS * 1.045, segments, segments / 2), new MeshBasicMaterial({ color: '#6fb8ff', transparent: true, opacity: 0.4, side: BackSide, blending: AdditiveBlending, depthWrite: false }));
  const headlight = new DirectionalLight('#ffffff', Math.PI * 0.8);
  const things = new Group();
  scene.add(globe, rim, new AmbientLight('#ffffff', Math.PI * 0.7), headlight, things, createStarfield({ count: quality.detail === 'high' ? 500 : 250, seed: 4242 }));

  const plane = createPlane(quality);
  plane.visible = false;
  things.add(plane);

  /** @type {Map<string, import('../../../engine/three/three.js').Group>} */
  const pins = new Map();
  const up = new Vector3(0, 1, 0);

  // ------------------------------------------------------------------------------------------- the camera
  let home = WHOLE_WORLD;
  let lastHomeDistance = 0;
  let lastAspect = 0;

  const aspectNow = () => view.stage.size.width / view.stage.size.height;

  /** Sets the area the globe goes back to, and turns to face it (gliding there when asked, unless less motion is wanted). */
  function setHome(rect, { animate = false } = {}) {
    home = rect;
    lastAspect = aspectNow();
    const frame = homeFraming({ rect, aspect: lastAspect });
    lastHomeDistance = frame.distance;
    if (animate && !view.reducedMotion) view.glideTo({ ...frame, target: ORIGIN });
    else view.snapTo({ ...frame, target: ORIGIN });
  }

  function zoomBy(factor) {
    view.glideTo({ distance: clamp(view.input.orbit.distance / factor, MIN_DISTANCE, MAX_DISTANCE), target: ORIGIN });
  }

  /** When the view changes shape (a phone turned on its side), keep the area in frame unless the child zoomed it themselves. */
  function refit() {
    const aspect = aspectNow();
    if (Math.abs(aspect - lastAspect) < 1e-6) return;
    lastAspect = aspect;
    const frame = homeFraming({ rect: home, aspect });
    if (Math.abs(view.input.orbit.distance - lastHomeDistance) < 1e-6) view.input.orbit = { ...view.input.orbit, distance: frame.distance };
    lastHomeDistance = frame.distance;
  }

  // ------------------------------------------------------------------------------------------- tapping
  /** A tap on the globe: find the country under the finger, with a bigger target for tiny ones, as on the flat map. */
  function handleTap({ clientX, clientY }) {
    if (!onTap) return;
    const hit = view.stage.pick(clientX, clientY, [globe])[0];
    if (!hit?.uv) { onTap(null); return; }
    const { x, y, onMap } = uvToMapPoint(hit.uv.x, hit.uv.y);
    if (!onMap) { onTap(null); return; }
    const scale = pixelsPerMapUnit({ distance: hit.distance, viewHeight: view.stage.size.height });
    onTap(resolveTap({ x, y }, skin.codeAt({ x, y }), anchors, scale));
  }

  // -------------------------------------------------------------------------------------- the interface
  let labelSprite = null;
  let labelCode = null;
  /** @type {{ from: object, to: object, t: number, seconds: number, cruise: number, resolve: () => void }|null} */
  let flight = null;
  let planeAt = null; // the unit vector of the country the plane is over; null until it has flown

  function clearLabel() {
    if (!labelSprite) return;
    labelSprite.removeFromParent();
    disposeObject(labelSprite);
    labelSprite = null;
    labelCode = null;
  }

  function setExplored(codes) {
    skin.setExplored(codes);
    for (const [code, pin] of pins) {
      if (codes.has(code)) continue;
      pin.removeFromParent();
      pins.delete(code);
    }
    for (const code of codes) {
      const anchor = anchorOf.get(code);
      if (!anchor || pins.has(code)) continue;
      const pin = createPin();
      const at = anchorToPoint(anchor);
      pin.position.set(at.x, at.y, at.z);
      pin.quaternion.setFromUnitVectors(up, new Vector3(at.x, at.y, at.z).normalize()); // stand it upright on the surface
      pins.set(code, pin);
      things.add(pin);
    }
  }

  /** Makes a country orange with its name above it, and turns the globe to show it (null clears both). */
  function highlight(code, text = '') {
    skin.setTarget(code);
    clearLabel();
    const anchor = code && anchorOf.get(code);
    if (!anchor) return;
    labelSprite = makeLabel(text, { worldHeight: 1, fontSize: 56, padding: 14 });
    labelCode = code;
    things.add(labelSprite);
    const { lon, lat } = mapToLonLat(anchor.cx, anchor.cy);
    // Turn to face it, keeping the child's zoom (but never so far out that it is a speck).
    view.glideTo({ ...facingFor(lon, lat), distance: Math.min(view.input.orbit.distance, 3.2), target: ORIGIN });
  }

  /** The plane flies the great-circle route from where it is (or from where the child is looking) to a country. */
  function flyPlaneTo(code) {
    const anchor = anchorOf.get(code);
    if (!anchor) return Promise.resolve();
    const to = toUnit(anchorToPoint(anchor));
    flight?.resolve(); // a new flight ends the old one
    // From the country it is over, or else from the middle of what the child is looking at.
    const from = planeAt ?? toUnit(orbitPosition(view.input.orbit, view.input.target));
    plane.visible = true;
    if (view.reducedMotion) {
      flight = null;
      planeAt = to;
      return Promise.resolve();
    }
    const angle = angleBetween(from, to);
    return new Promise((resolve) => {
      flight = { from, to, t: 0, seconds: flightSeconds(angle), cruise: cruiseHeight(angle), resolve };
    });
  }

  function placePlane(position, ahead) {
    plane.position.set(position.x, position.y, position.z);
    plane.up.set(position.x, position.y, position.z).normalize();
    plane.lookAt(ahead.x, ahead.y, ahead.z);
  }

  function movePlane(dt) {
    if (!flight) {
      if (planeAt) {
        const at = { x: planeAt.x * (GLOBE_RADIUS + HOVER), y: planeAt.y * (GLOBE_RADIUS + HOVER), z: planeAt.z * (GLOBE_RADIUS + HOVER) };
        // Parked: nose along the way it last flew (kept in the plane's own turn), so it does not spin when the view moves.
        plane.position.set(at.x, at.y, at.z);
      }
      return;
    }
    flight.t = Math.min(1, flight.t + dt / flight.seconds);
    const at = (t) => {
      const point = greatCirclePoint(flight.from, flight.to, easeInOut(t));
      const radius = GLOBE_RADIUS + HOVER + flightHeight(t, flight.cruise);
      return { x: point.x * radius, y: point.y * radius, z: point.z * radius };
    };
    const here = at(flight.t);
    const ahead = at(Math.min(1, flight.t + 0.03));
    // At the very end there is no "ahead": keep looking the way it was going.
    placePlane(here, flight.t < 1 ? ahead : { x: here.x * 2 - at(0.97).x, y: here.y * 2 - at(0.97).y, z: here.z * 2 - at(0.97).z });
    if (flight.t >= 1) {
      planeAt = flight.to;
      const done = flight.resolve;
      flight = null;
      done();
    }
  }

  // ------------------------------------------------------------------------------------------- each frame
  const screenUp = new Vector3();
  return {
    el: root,
    setExplored,
    setHome,
    highlight,
    flyPlaneTo,

    update(dt) {
      view.update(dt);
      refit();
      skin.flush();
      const camera = view.stage.camera;
      // A light at the camera shades the plane (the globe itself is unlit, so it is the same colour from every side).
      headlight.position.copy(camera.position);
      const { height } = view.stage.size;
      const surface = Math.max(0.05, camera.position.length() - GLOBE_RADIUS);
      const perPixel = sceneUnitsPerPixel({ distance: surface, viewHeight: height });
      // The plane and the name keep their size on screen, whether the whole globe or one country is in view.
      plane.scale.setScalar(clamp(PLANE_PIXELS * perPixel, 0.025, 0.14));
      if (labelSprite && labelCode) {
        const at = anchorToPoint(anchorOf.get(labelCode), 0.02);
        const h = LABEL_PIXELS * perPixel;
        labelSprite.scale.set(labelSprite.scale.x / labelSprite.scale.y * h, h, 1);
        // The name goes above the country *on the screen* (along the camera's up), clear of the plane that parks over it.
        screenUp.setFromMatrixColumn(camera.matrixWorld, 1);
        const lift = (PLANE_PIXELS * 0.55 + LABEL_PIXELS * 0.75) * perPixel;
        labelSprite.position.set(at.x + screenUp.x * lift, at.y + screenUp.y * lift, at.z + screenUp.z * lift);
      }
      movePlane(dt);
    },

    render: () => view.render(),

    destroy() {
      flight?.resolve();
      flight = null;
      view.dispose();
    },
  };
}
