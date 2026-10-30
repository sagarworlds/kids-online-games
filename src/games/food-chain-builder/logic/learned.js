/**
 * The living things a child has met, and whether they have seen the "which way do arrows go" note. Both live in the
 * game's `save.extra`, which can hold anything, so every read treats it as untrusted.
 */

/**
 * @param {any} extra The save's `extra` object.
 * @param {readonly string[]} knownIds Every organism the game has; anything else in the save is ignored.
 * @returns {Set<string>}
 */
export function readLearned(extra, knownIds) {
  const known = new Set(knownIds);
  const stored = Array.isArray(extra?.learned) ? extra.learned : [];
  return new Set(stored.filter((id) => typeof id === 'string' && known.has(id)));
}

/**
 * @param {any} extra
 * @param {readonly string[]} ids Organisms just met.
 * @param {readonly string[]} knownIds
 * @returns {object} A new `extra` with them added (sorted, no repeats); the rest of `extra` is kept.
 */
export function withLearned(extra, ids, knownIds) {
  const learned = readLearned(extra, knownIds);
  for (const id of ids) if (knownIds.includes(id)) learned.add(id);
  return { ...(extra && typeof extra === 'object' ? extra : {}), learned: [...learned].sort() };
}

/** @param {any} extra @returns {boolean} */
export const introSeen = (extra) => extra?.introSeen === true;

/** @param {any} extra @returns {object} A new `extra` that remembers the note was read. */
export const withIntroSeen = (extra) => ({ ...(extra && typeof extra === 'object' ? extra : {}), introSeen: true });
