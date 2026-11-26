/**
 * The geometry of the 3D race track: where the road, the cars and the posts are, and where the camera stands to watch from
 * behind the player's car while keeping the ghost in view. Pure numbers (no three.js), so "can the child see both cars?" is
 * tested without a browser.
 *
 * The scene's axes: the cars drive towards -z (the finish line is far down the -z axis), x is to the right, y is up.
 * Progress is 0 at the start line and 1 at the finish line, the same numbers the 2D track uses.
 *
 * @typedef {{ x: number, y: number, z: number }} Vector
 */

/** The distance from the start line to the finish line, in scene units. */
export const ROAD_LENGTH = 80;
/** The road behind the start line and past the finish line, so the camera never looks off the end of the world. */
export const LEAD_IN = 16;
export const RUN_OFF = 26;
export const LANE_WIDTH = 3.4;
/** The ghost drives in the left lane and the player in the right lane, as the ghost is in the top lane in 2D. */
export const GHOST_LANE_X = -LANE_WIDTH / 2;
export const PLAYER_LANE_X = LANE_WIDTH / 2;
export const ROAD_HALF_WIDTH = LANE_WIDTH;

/** The camera's field of view when cruising, and how much a boost widens it (a "rush" of speed). */
export const BASE_FOV = 55;
export const BOOST_FOV = 9;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Where a car is along the road.
 * @param {number} progress 0 (start line) to 1 (finish line); values outside are held at the ends.
 * @returns {number} Its z position.
 */
export const carZ = (progress) => -clamp(progress, 0, 1) * ROAD_LENGTH;

/**
 * Where the post for the `index`th question stands, so the child sees how far along the 20 questions each car is.
 * @param {number} index 1 to count - 1 (the start and the finish have their own lines).
 * @param {number} count How many questions are in the race.
 * @returns {number} Its z position.
 */
export const tickZ = (index, count) => -(ROAD_LENGTH * index) / count;

/**
 * Where the camera stands and what it looks at: behind the player's car, high enough to see over it, and pulled back and up
 * when the ghost is far ahead or behind so that both stay in view. A phone held upright is narrow, so the camera also stands
 * back far enough there that both lanes fit across the picture.
 *
 * @param {{ player: number, ghost: number, boost?: number, aspect?: number }} options Progress of each car (0 to 1), the
 *   boost after a right answer (0 to 1, fading), and the picture's width divided by its height.
 * @returns {{ position: Vector, target: Vector, fov: number }}
 */
export function cameraFor({ player, ghost, boost = 0, aspect = 1 }) {
  const playerZ = carZ(player);
  const ghostZ = carZ(ghost);
  const front = Math.min(playerZ, ghostZ);
  const back = Math.max(playerZ, ghostZ);
  const spread = back - front;
  const fov = BASE_FOV + BOOST_FOV * clamp(boost, 0, 1);

  // Mostly centred on the player's lane (they are the one driving), a little towards the middle of the road.
  const x = PLAYER_LANE_X * 0.45;
  // Both lanes must fit across the picture at the distance of the nearest car: half the width there is `distance * tan(fov / 2) * aspect`,
  // and the camera is a little to one side, so the far edge of the road is farther from the middle of the picture than the near one.
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const widthBack = (ROAD_HALF_WIDTH + Math.abs(x) + 0.6) / (Math.tan((BASE_FOV * Math.PI) / 360) * safeAspect);
  const distance = clamp(Math.max(7, widthBack), 7, 18) + spread * 0.3;
  const height = 2.6 + Math.min(spread * 0.12, 4) + Math.max(0, distance - 10) * 0.25;
  const middle = (front + back) / 2;
  return {
    position: { x, y: height, z: back + distance },
    target: { x, y: 0.9, z: middle - 6 },
    fov,
  };
}

/**
 * How much the player's car shakes after a wrong answer (the 3D version of the 2D "wobble"): a side-to-side sway that dies
 * away, and none at all when the child asked for less motion (a cross above the car says "oops" instead).
 * @param {{ time: number, wobble: number, reduced: boolean }} options `wobble` is 1 right after the mistake, fading to 0.
 * @returns {{ x: number, roll: number }} A sideways shift in scene units and a lean in radians.
 */
export function wobbleSway({ time, wobble, reduced }) {
  if (reduced || wobble <= 0) return { x: 0, roll: 0 };
  const shake = Math.sin(time * 45) * wobble;
  return { x: shake * 0.12, roll: shake * 0.05 };
}
