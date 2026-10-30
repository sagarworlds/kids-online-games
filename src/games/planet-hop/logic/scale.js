/** The planet pictures are drawn between these sizes (in pixels) so the smallest one stays easy to see and to tap. */
export const MIN_DIAMETER = 24;
export const MAX_DIAMETER = 72;

/**
 * Makes a function that gives each planet's picture size.
 *
 * Normal view: a compressed (logarithmic) scale from MIN_DIAMETER for the smallest to MAX_DIAMETER for the largest, so
 * the order of the sizes is right but Mercury does not shrink to a dot. "Show real size": the true proportions, with
 * the largest at MAX_DIAMETER, which makes the point that Jupiter is about 29 times as wide as Mercury.
 *
 * @param {readonly { radiusKm: number }[]} bodies Every body that will be drawn.
 * @param {{ real?: boolean }} [options]
 * @returns {(body: { radiusKm: number }) => number} Diameter in pixels.
 */
export function createSizer(bodies, { real = false } = {}) {
  const radii = bodies.map((b) => b.radiusKm);
  const smallest = Math.min(...radii);
  const largest = Math.max(...radii);
  if (real) return (body) => (MAX_DIAMETER * body.radiusKm) / largest;
  if (smallest === largest) return () => MAX_DIAMETER;
  const span = Math.log(largest / smallest);
  return (body) => MIN_DIAMETER + (MAX_DIAMETER - MIN_DIAMETER) * (Math.log(body.radiusKm / smallest) / span);
}

/**
 * The top of the scale's dial: the largest weight it must show, rounded up to the next 10 so the tick marks are tidy.
 * @param {number} largest The heaviest weight the child can see (their weight on the strongest pull).
 * @returns {number} At least 10.
 */
export const dialMax = (largest) => Math.max(10, Math.ceil(largest / 10) * 10);

/**
 * Where the needle points: -90 degrees (far left) at 0 up to +90 (far right) at `max`. A value past the end is held
 * at the end rather than spinning the needle round.
 * @param {number} value
 * @param {number} max Above 0.
 * @returns {number} Degrees.
 */
export const needleAngle = (value, max) => -90 + 180 * Math.min(1, Math.max(0, value / max));
