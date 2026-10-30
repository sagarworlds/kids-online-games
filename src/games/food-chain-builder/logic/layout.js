/**
 * @typedef {'horizontal'|'vertical'} Orientation
 * @typedef {{ x: number, y: number }} Point  Percentages (0 to 100) of the board's width and height.
 */

/**
 * How far each living thing is from the sun: producers are level 0, and anything else is one more than the highest
 * level among its foods (by the required links). A grass-rabbit-fox chain is 0, 1, 2.
 *
 * @param {{ organisms: readonly string[], required: readonly import('./whatIf.js').Link[] }} habitat
 * @returns {Map<string, number>}
 */
export function trophicLevels(habitat) {
  const levels = new Map();
  const levelOf = (id) => {
    if (!levels.has(id)) {
      const foods = habitat.required.filter((l) => l.to === id).map((l) => l.from);
      levels.set(id, foods.length === 0 ? 0 : 1 + Math.max(...foods.map(levelOf)));
    }
    return levels.get(id);
  };
  habitat.organisms.forEach(levelOf);
  return levels;
}

/**
 * Where each card goes on the board, worked out from the food links so the arrows mostly point one way and rarely
 * cross: one column per level, producers first (left to right on a wide board; bottom to top on a tall one, so on a
 * phone the energy flows up), and inside a level the cards are ordered by where their foods sit.
 *
 * @param {{ organisms: readonly string[], required: readonly import('./whatIf.js').Link[] }} habitat
 * @param {Orientation} [orientation]
 * @returns {Map<string, Point>}
 */
export function computeLayout(habitat, orientation = 'horizontal') {
  const levels = trophicLevels(habitat);
  const top = Math.max(...levels.values());
  const along = new Map(); // each card's place across its level (0 to 1), used to order the next level
  const positions = new Map();

  for (let level = 0; level <= top; level++) {
    const ids = habitat.organisms.filter((id) => levels.get(id) === level);
    // Barycentre: the average place of a card's foods. Level 0 has no foods and keeps the data's order.
    const centre = (id) => {
      const foods = habitat.required.filter((l) => l.to === id && along.has(l.from)).map((l) => along.get(l.from));
      return foods.length ? foods.reduce((a, b) => a + b, 0) / foods.length : 0.5;
    };
    const ordered = level === 0 ? ids : [...ids].sort((a, b) => centre(a) - centre(b) || ids.indexOf(a) - ids.indexOf(b));
    ordered.forEach((id, i) => {
      const across = (i + 0.5) / ordered.length;
      const step = ((level + 0.5) / (top + 1));
      along.set(id, across);
      positions.set(id, orientation === 'horizontal'
        ? { x: step * 100, y: across * 100 }
        : { x: across * 100, y: (1 - step) * 100 });
    });
  }
  return positions;
}
