/** @typedef {Record<string, number>} FactWeights  Fact key ("7x8") to how much more often it is asked than normal. */

/** A missed fact is asked this many times as often. */
export const MISS_FACTOR = 3;
/** Weights stop growing here (three misses in a row), so one hard fact cannot take over the whole race. */
export const MAX_WEIGHT = MISS_FACTOR ** 3;

const KEY = /^\d+x\d+$/;

/** @param {FactWeights} weights @param {string} key @returns {number} 1 for a fact that has never been missed. */
export const weightOf = (weights, key) => weights[key] ?? 1;

/**
 * Called when a fact is missed the first time it is asked in a race: it gets 3 times the weight (up to a cap).
 * @param {FactWeights} weights
 * @param {string} key
 * @returns {FactWeights} A new object.
 */
export function penalise(weights, key) {
  return { ...weights, [key]: Math.min(MAX_WEIGHT, weightOf(weights, key) * MISS_FACTOR) };
}

/**
 * Called when a fact is answered right the first time: the extra weight halves, so a fact that is now known fades
 * back to normal over a few races. Weights of 1 are removed to keep the saved data small.
 * @param {FactWeights} weights
 * @param {string} key
 * @returns {FactWeights} A new object.
 */
export function relax(weights, key) {
  if (!(key in weights)) return weights;
  const next = { ...weights };
  const halved = weights[key] / 2;
  if (halved <= 1) delete next[key];
  else next[key] = halved;
  return next;
}

/**
 * Cleans weights read from storage, which could have been edited or damaged: anything that is not a "7x8" key with a
 * sensible number is dropped.
 * @param {unknown} raw
 * @returns {FactWeights}
 */
export function sanitizeWeights(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KEY.test(key) && Number.isFinite(value) && value > 1) clean[key] = Math.min(MAX_WEIGHT, value);
  }
  return clean;
}
