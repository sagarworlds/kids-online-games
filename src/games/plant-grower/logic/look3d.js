import { GameError } from '../../../engine/utils/errors.js';
import { createRng } from '../../../engine/utils/random.js';
import { STAGE_COUNT } from './plants.js';

/**
 * How the 3D garden looks for a given state of the game: how tall the plant is, how much it droops, what colour its leaves are, what
 * the sky and sun are doing and where the raindrops fall. Pure numbers and colours (no three.js), so each rule is tested without a
 * browser. The game's rules (what makes a plant grow or wilt, what the weather does) are in `simulation.js` and `weather.js`; this
 * only turns their results into a picture.
 */

/** How tall the main stem is at each stage (0 = seed), as a share of its full height: the same numbers as the flat picture. */
export const STAGE_GROWTH = Object.freeze([0, 0.26, 0.44, 0.62, 0.8, 1, 1, 1]);

/** @param {number} stage 0 to 7. @returns {number} The share of full height, 0 to 1 (a stage outside the range is held at its end). */
export function growthOf(stage) {
  const index = Math.min(STAGE_COUNT - 1, Math.max(0, Math.round(Number.isFinite(stage) ? stage : 0)));
  return STAGE_GROWTH[index];
}

/**
 * How the plant hangs: `lean` is how far the whole plant tips over (radians) and `leaf` is how much its leaves droop (0 to 1). A wilting
 * plant droops most, a thirsty one a good deal, a hungry one only its leaves, and a happy one not at all.
 *
 * @param {{ mood: 'happy'|'ok'|'wilting', problem?: string|null }} look
 * @returns {{ lean: number, leaf: number }}
 */
export function droopFor({ mood, problem = null }) {
  if (mood === 'wilting') return { lean: 0.5, leaf: 1 };
  if (problem === 'thirsty') return { lean: 0.22, leaf: 0.55 };
  if (problem === 'hungry') return { lean: 0, leaf: 0.3 };
  return { lean: 0, leaf: mood === 'ok' ? 0.12 : 0 };
}

/** @param {string} hex '#rrggbb' @returns {[number, number, number]} */
const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Mixes two colours.
 * @param {string} from '#rrggbb'
 * @param {string} to '#rrggbb'
 * @param {number} amount 0 gives `from`, 1 gives `to` (held between).
 * @returns {string} '#rrggbb'
 */
export function mixHex(from, to, amount) {
  const t = Math.min(1, Math.max(0, amount));
  const a = parse(from);
  const b = parse(to);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * What a problem does to the colour of the leaves and to the light: too much fertiliser browns the leaves, too little pales them, too
 * little sun darkens everything, too much sun yellows them.
 * @param {string|null} problem One of the ids in `messages.js`, or null.
 * @returns {{ leaf: string|null, amount: number, light: number }} `leaf` is the colour the leaves move towards (null for none), by `amount`;
 *   `light` is the strength of the garden's light, 1 for normal.
 */
export function tintFor(problem) {
  switch (problem) {
    case 'burnt': return { leaf: '#8a5a2b', amount: 0.85, light: 1 };
    case 'hungry': return { leaf: '#d8d77a', amount: 0.55, light: 1 };
    case 'sweaty': return { leaf: '#d9c25a', amount: 0.3, light: 1 };
    case 'shady': return { leaf: '#2f5d34', amount: 0.35, light: 0.6 };
    default: return { leaf: null, amount: 0, light: 1 };
  }
}

/**
 * @typedef {{ sky: string, sun: number, clouds: number, rain: boolean, haze: number }} WeatherLook
 * `sun` is how bright and big the sun is (0 hides it), `clouds` how much of the sky is cloud (0 to 1), `haze` how hot and hazy the air looks.
 */

/** @type {Readonly<Record<string, Readonly<WeatherLook>>>} */
const LOOKS = Object.freeze({
  sunny: Object.freeze({ sky: '#8fdcff', sun: 1, clouds: 0.15, rain: false, haze: 0 }),
  cloudy: Object.freeze({ sky: '#b9c6d4', sun: 0.25, clouds: 1, rain: false, haze: 0 }),
  rainy: Object.freeze({ sky: '#8f9db0', sun: 0, clouds: 1, rain: true, haze: 0 }),
  heat: Object.freeze({ sky: '#ffd9a0', sun: 1.6, clouds: 0, rain: false, haze: 1 }),
});

/**
 * @param {string} kind A weather from `weather.js`: sunny, cloudy, rainy or heat.
 * @returns {Readonly<WeatherLook>}
 * @throws {GameError} 'BAD_WEATHER' for anything else.
 */
export function weatherLook(kind) {
  const look = LOOKS[kind];
  if (!look) throw new GameError('BAD_WEATHER', `There is no weather "${kind}"`, { kind });
  return look;
}

/** How far behind the plant the sun's path is, and the half-width of that path: small enough that the whole arc fits in the picture. */
const SUN_DEPTH = 12;
const SUN_SPAN = 3.8;
/** The height of the sun's path above the ground at sunrise and sunset, and how far it climbs from there to noon. */
const SUN_HORIZON = 2.3;

/**
 * Where the sun is as the day goes by: it rises on the left, is highest at noon and sets on the right, behind the plant.
 * @param {number} progress 0 (sunrise) to 1 (sunset); held between.
 * @param {number} [turn] Radians to turn the whole path about the plant, so that "left" and "behind" match where the camera looks from
 *   (the camera starts a little to the right of the pot, and a sun path square to the pot would then seem to cross the sky at a slant).
 * @returns {{ x: number, y: number, z: number }}
 */
export function sunPosition(progress, turn = 0) {
  const angle = Math.PI * Math.min(1, Math.max(0, progress));
  const across = -Math.cos(angle) * SUN_SPAN;
  // A turn about the vertical axis: the screen's "right" (1, 0, 0) goes to (cos, 0, -sin) and "behind" (0, 0, -1) to (-sin, 0, -cos).
  return {
    x: across * Math.cos(turn) - SUN_DEPTH * Math.sin(turn),
    y: Math.sin(angle) * SUN_SPAN + SUN_HORIZON,
    z: -across * Math.sin(turn) - SUN_DEPTH * Math.cos(turn),
  };
}

/** The share of the day, 0 to 1, that the sun stands at in the morning, before the child has done anything. */
export const MORNING = 0.2;
/** The sky colour at the end of the day, which the day sky fades towards as the sun sets. */
const DUSK = '#2b2f6e';

/**
 * The sky colour as the day goes by: the weather's own sky until late afternoon, then fading towards dusk as the sun goes down.
 * @param {string} sky '#rrggbb', from `weatherLook`.
 * @param {number} progress 0 to 1.
 * @returns {string} '#rrggbb'
 */
export const skyAt = (sky, progress) => mixHex(sky, DUSK, Math.max(0, (progress - 0.7) / 0.3) * 0.85);

/**
 * Where each raindrop starts, deterministic for a seed so the rain looks the same every time.
 * @param {{ count: number, seed: number, width: number, depth: number, height: number }} options The box the rain falls in, centred on x = z = 0.
 * @returns {{ x: number, z: number, y: number, speed: number }[]}
 */
export function rainLayout({ count, seed, width, depth, height }) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({
    x: (rng() - 0.5) * width,
    z: (rng() - 0.5) * depth,
    y: rng() * height,
    speed: 9 + rng() * 5,
  }));
}
