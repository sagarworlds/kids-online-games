/**
 * The geometry of the 3D tower on the menu: where each floor is, which floors are built, which one is being worked on, and
 * where the camera stands to look at it. Pure numbers (no three.js), so "is the floor the child should do next in view?" is
 * tested without a browser.
 *
 * Floors are numbered from the bottom: index 0 is the lowest floor shown (the first floor of the chosen level), and y is up.
 *
 * @typedef {'cleared'|'current'|'locked'} FloorState
 *   `cleared`: built (the Challenge was passed). `current`: the open floor being worked on. `locked`: not open yet, drawn as an
 *   empty frame so the child can see how tall the tower will be.
 */

export const FLOOR_HEIGHT = 1;
export const FLOOR_GAP = 0.08;
export const FLOOR_WIDTH = 3.2;
export const ROOF_HEIGHT = 0.9;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** @param {number} index @returns {number} The height of the bottom of a floor. */
export const floorBase = (index) => index * (FLOOR_HEIGHT + FLOOR_GAP);

/** @param {number} index @returns {number} The height of the middle of a floor. */
export const floorCenterY = (index) => floorBase(index) + FLOOR_HEIGHT / 2;

/** @param {number} count How many floors. @returns {number} The height of the whole tower, including its roof. */
export const towerHeight = (count) => floorBase(count) + ROOF_HEIGHT;

/**
 * What state each floor is in.
 * @param {{ floors: readonly number[], cleared: ReadonlySet<number>, isOpen: (floor: number) => boolean }} options `floors` are
 *   the floor numbers from the lowest up; `isOpen` is the game's own rule for which floors can be entered.
 * @returns {FloorState[]} One for each floor. At most one floor is `current`: the lowest open floor not yet cleared.
 */
export function floorStates({ floors, cleared, isOpen }) {
  let currentTaken = false;
  return floors.map((floor) => {
    if (cleared.has(floor)) return 'cleared';
    if (isOpen(floor) && !currentTaken) { currentTaken = true; return 'current'; }
    return 'locked';
  });
}

/**
 * Which floor the camera climbs to: the one being worked on, or the top of what has been built when every floor is cleared.
 * @param {readonly FloorState[]} states
 * @returns {number} An index into `states`.
 */
export function focusIndex(states) {
  const current = states.indexOf('current');
  if (current >= 0) return current;
  const lastCleared = states.lastIndexOf('cleared');
  return lastCleared >= 0 ? lastCleared : 0;
}

/**
 * The camera view for looking at a floor of the tower: close enough to read about five floors, and far enough back that the tower's
 * width fits on a narrow phone.
 *
 * @param {{ index: number, count: number, aspect: number, fovDegrees?: number }} options
 * @returns {{ target: { x: number, y: number, z: number }, distance: number }}
 */
export function climbFraming({ index, count, aspect, fovDegrees = 45 }) {
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  const wide = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const forHeight = (5.4 * (FLOOR_HEIGHT + FLOOR_GAP)) / (2 * half);
  const forWidth = (FLOOR_WIDTH * 1.5) / (2 * half * wide);
  // Look a little above the floor's middle, so the floor above it (the next goal) is in the picture too.
  const y = clamp(floorCenterY(index) + 0.3, FLOOR_HEIGHT / 2, towerHeight(count) - ROOF_HEIGHT);
  return { target: { x: 0, y, z: 0 }, distance: clamp(Math.max(forHeight, forWidth), 4, 30) };
}

/**
 * The camera view that shows the whole tower, for the "whole tower" button.
 * @param {{ count: number, aspect: number, fovDegrees?: number }} options
 * @returns {{ target: { x: number, y: number, z: number }, distance: number }}
 */
export function wholeTowerFraming({ count, aspect, fovDegrees = 45 }) {
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  const wide = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const height = towerHeight(count);
  const forHeight = (height * 1.25) / (2 * half);
  const forWidth = (FLOOR_WIDTH * 1.6) / (2 * half * wide);
  return { target: { x: 0, y: height / 2, z: 0 }, distance: clamp(Math.max(forHeight, forWidth), 5, 90) };
}
