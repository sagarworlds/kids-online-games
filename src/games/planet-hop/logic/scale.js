/** The planet pictures are drawn between these sizes (in pixels) so the smallest one stays easy to see and to tap. */
export const MIN_DIAMETER = 24;
export const MAX_DIAMETER = 88;

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
