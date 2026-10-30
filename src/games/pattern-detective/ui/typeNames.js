/** Friendly names for the kinds of case, for the results screen. */
export const TYPE_NAMES = Object.freeze({
  repeating: 'Repeating pattern',
  growing: 'Growing groups',
  add: 'Adding',
  subtract: 'Subtracting',
  multiply: 'Doubling and tripling',
  'two-attributes': 'Two changes at once',
  alternating: 'Alternating jumps',
  'missing-middle': 'Gap in the middle',
  rotation: 'Turning arrow',
});

/** @param {string} type @returns {string} A readable name, falling back to the id for a type added later. */
export const typeName = (type) => TYPE_NAMES[type] ?? type;
