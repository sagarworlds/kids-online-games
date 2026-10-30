/**
 * True when the player's OS asks for less motion. Canvas animations, shakes
 * and confetti check this because CSS media queries cannot reach them.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
