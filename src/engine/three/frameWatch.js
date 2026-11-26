import { GameError } from '../utils/errors.js';

/**
 * Decides whether a 3D view runs smoothly enough, and what to do when it does not.
 *
 * It is pure: it is fed the time between animation frames and never reads a clock or the page, so it is unit-tested with made-up
 * numbers. `Stage3D` feeds it for real and carries out what it says.
 *
 * The plan for a device that is too slow for a picture, in the order a child would want it:
 *   1. lower the resolution (fewer pixels is the cheapest way to speed up a phone, and a low-poly picture hardly shows it), up to `steps` times;
 *   2. when that is not enough, or the picture is hopeless, give up, so the game can carry on with its flat version.
 *
 * @typedef {'fine'|'lower'|'giveUp'} FrameVerdict
 */

/**
 * @typedef {{
 *   warmupMs: number, settleMs: number, windowMs: number, slowMs: number, hopelessMs: number, maxGapMs: number, steps: number
 * }} FrameWatchOptions
 * All times are milliseconds of animation. `warmupMs`: a scene's first moments are slow on any device (shaders compile, models
 * upload), so they are not judged. `settleMs`: the same after the resolution changes. `windowMs`: how much play one verdict is based
 * on. `slowMs`: a typical frame slower than this (about 22 frames a second) is choppy. `hopelessMs`: slower than this (about 8 frames
 * a second) lowering the resolution cannot save it. `maxGapMs`: a longer gap between two frames is the page being hidden or paused,
 * not slowness. `steps`: how many times to lower the resolution before giving up.
 */

/** @type {Readonly<FrameWatchOptions>} */
export const FRAME_WATCH_DEFAULTS = Object.freeze({
  warmupMs: 1500,
  settleMs: 500,
  windowMs: 2500,
  slowMs: 45,
  hopelessMs: 120,
  maxGapMs: 1000,
  steps: 2,
});

/** @param {number[]} values Not empty. @returns {number} The middle value (the mean of the two middle ones for an even count). */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * @param {Partial<FrameWatchOptions>} [options]
 * @returns {{ frame: (intervalMs: number) => FrameVerdict, readonly lowered: number }} `frame` takes the time since the previous frame and
 *   says what to do now. `lowered` is how many times it has said `lower`. After `giveUp` it only ever says `fine`.
 * @throws {GameError} With code 'BAD_OPTIONS' when a setting is not a number of at least 0, `windowMs` or `slowMs` is 0, or `hopelessMs`
 *   is not above `slowMs`.
 */
export function createFrameWatch(options = {}) {
  const settings = { ...FRAME_WATCH_DEFAULTS, ...options };
  for (const [name, value] of Object.entries(settings)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new GameError('BAD_OPTIONS', `createFrameWatch: ${name} must be a number of at least 0`, { name, value });
    }
  }
  if (settings.windowMs === 0 || settings.slowMs === 0 || settings.hopelessMs <= settings.slowMs) {
    throw new GameError('BAD_OPTIONS', 'createFrameWatch: windowMs and slowMs must be above 0, and hopelessMs above slowMs', { ...settings });
  }

  let seen = 0; // animation time since the watch (re)started
  let quietUntil = settings.warmupMs; // frames before this are the scene settling in, and are not judged
  let windowTime = 0;
  let samples = [];
  let lowered = 0;
  let finished = false;

  return {
    get lowered() {
      return lowered;
    },

    frame(intervalMs) {
      if (finished || !Number.isFinite(intervalMs) || intervalMs <= 0) return 'fine';
      if (intervalMs > settings.maxGapMs) {
        // The page was hidden or paused: what comes next is a fresh start, so judge it only after a new warm-up.
        seen = 0;
        quietUntil = settings.warmupMs;
        windowTime = 0;
        samples = [];
        return 'fine';
      }
      seen += intervalMs;
      if (seen < quietUntil) return 'fine';

      samples.push(intervalMs);
      windowTime += intervalMs;
      if (windowTime < settings.windowMs) return 'fine';

      // One verdict per window, on the middle frame rather than the average, so a few hiccups (a garbage collection, a new puzzle being
      // made) never count as slowness but a steady crawl always does.
      const typical = median(samples);
      samples = [];
      windowTime = 0;
      if (typical <= settings.slowMs) return 'fine';
      if (typical >= settings.hopelessMs || lowered >= settings.steps) {
        finished = true;
        return 'giveUp';
      }
      lowered += 1;
      quietUntil = seen + settings.settleMs;
      return 'lower';
    },
  };
}

/**
 * The pixel ratios to try, from the one the view starts with downwards: each step takes another quarter off the starting ratio (1 gives
 * 1, 0.75, 0.5), and none goes below `floor` (below that the picture turns to mush).
 * @param {number} start The ratio the renderer starts with.
 * @param {number} steps How many lower ratios to offer.
 * @param {number} [floor]
 * @returns {number[]} Starts with `start`; fewer than `steps + 1` entries when the floor is reached first.
 */
export function pixelRatioSteps(start, steps, floor = 0.5) {
  const ratios = [start];
  for (let i = 1; i <= steps; i++) {
    const ratio = Math.round(start * (1 - 0.25 * i) * 100) / 100;
    if (ratio < floor) break;
    ratios.push(ratio);
  }
  return ratios;
}
