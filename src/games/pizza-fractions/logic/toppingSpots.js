/**
 * Where the pieces of a topping sit on one slice. This is the same for the flat pizza and the 3D one, so a child sees the same pizza in
 * both views, and it is pure so it can be tested without a screen.
 *
 * A spot is described in the slice's own terms: `distance` is a share of the pizza's radius from the centre, and `across` is how far across
 * the slice it sits (0 is the slice's clockwise-start edge, 1 its end edge, 0.5 the middle). A view turns that into a position.
 *
 * @typedef {{ distance: number, across: number, scale: number, spin: number }} ToppingSpot `scale` shrinks a piece on a thin slice so that
 *   it stays inside the slice (never below 0.5 or above 1); `spin` is the piece's turn in degrees, so the pieces do not all point one way.
 */

/** Where the pieces sit: [distance as a share of the radius, how far across the slice]. A wide slice has more pieces than a thin one. */
const PLACEMENTS = Object.freeze({
  wide: [[0.4, 0.5], [0.65, 0.25], [0.65, 0.75], [0.86, 0.5]],
  medium: [[0.4, 0.5], [0.7, 0.28], [0.7, 0.72]],
  narrow: [[0.45, 0.5], [0.76, 0.5]],
});

/** A piece is about this many units wide at full size (the flat pizza's 220-unit box); on a thin slice it is scaled down to fit. */
const PIECE_WIDTH = 28;

/**
 * The spots for one slice.
 * @param {number} index Which slice (only used to turn the pieces differently on each slice).
 * @param {number} count How many slices the pizza is cut into.
 * @param {number} radius The radius the distances are shares of, in the same units the view draws in (the width of a piece is compared with the
 *   arc of the slice at each spot, so this must be the view's own unit).
 * @returns {ToppingSpot[]}
 */
export function toppingSpots(index, count, radius) {
  const placements = count <= 4 ? PLACEMENTS.wide : count <= 8 ? PLACEMENTS.medium : PLACEMENTS.narrow;
  return placements.map(([distance, across], i) => {
    const arc = (2 * Math.PI * distance * radius) / count;
    return { distance, across, scale: Math.max(0.5, Math.min(1, arc / PIECE_WIDTH)), spin: (i * 67 + index * 0) % 360 };
  });
}
