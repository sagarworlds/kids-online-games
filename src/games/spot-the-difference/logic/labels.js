/** "a" or "an" for a word, by its first letter (all the object names here follow the simple vowel rule). @param {string} word */
export const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** "A cup" or "An apple", for the start of a sentence. @param {string} word */
export const withArticle = (word) => `${article(word).replace(/^./, (c) => c.toUpperCase())} ${word}`;

/** What each kind of difference is called on the results screen, with a picture to go with it. */
export const DIFFERENCE_TYPES = Object.freeze({
  recolor: Object.freeze({ icon: '🎨', name: 'Colour changes' }),
  remove: Object.freeze({ icon: '👻', name: 'Missing things' }),
  add: Object.freeze({ icon: '➕', name: 'Added things' }),
  resize: Object.freeze({ icon: '↕️', name: 'Size changes' }),
  flip: Object.freeze({ icon: '↔️', name: 'Flipped things' }),
  move: Object.freeze({ icon: '➡️', name: 'Moved things' }),
  rotate: Object.freeze({ icon: '🔄', name: 'Turned things' }),
});

/**
 * Counts the kinds of difference, in the order of DIFFERENCE_TYPES.
 * @param {readonly string[]} types
 * @returns {{ type: string, icon: string, name: string, count: number }[]} Only the kinds that were found.
 */
export function countTypes(types) {
  return Object.entries(DIFFERENCE_TYPES)
    .map(([type, info]) => ({ type, ...info, count: types.filter((t) => t === type).length }))
    .filter((row) => row.count > 0);
}

/** Seconds as minutes and seconds, like 1:05. @param {number} seconds */
export function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
