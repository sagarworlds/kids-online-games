/**
 * Keyboard play: typing a letter pops the bubble with that letter that is nearest to a point (the slot that is being
 * filled), so with repeated letters the one closest to where it is going goes first.
 *
 * @param {readonly import('./bubbleFactory.js').Bubble[]} bubbles
 * @param {string} key What was typed (any case).
 * @param {{ x: number, y: number }} from
 * @returns {import('./bubbleFactory.js').Bubble|null} null if the key is not a letter or no bubble has it.
 */
export function nearestWithLetter(bubbles, key, from) {
  if (typeof key !== 'string' || !/^[a-zA-Z]$/.test(key)) return null;
  const letter = key.toLowerCase();
  let best = null;
  let bestDistance = Infinity;
  for (const bubble of bubbles) {
    if (bubble.letter !== letter) continue;
    const d = Math.hypot(bubble.x - from.x, bubble.y - from.y);
    if (d < bestDistance) {
      best = bubble;
      bestDistance = d;
    }
  }
  return best;
}
