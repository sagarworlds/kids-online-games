/**
 * @typedef {{
 *   kind: string, text: string, highlight?: number[], labels?: (string|null)[], between?: (string|null)[]
 * }} Hint
 * What the magnifying glass shows after a wrong pick. It differs by pattern type: `highlight` circles items (the
 * repeating unit), `between` writes the jump between neighbouring items (+4, ×2), `labels` writes something under each
 * item (the group size, the angle). A `null` entry is a position the child has to work out, so it is left blank.
 *
 * @typedef {{
 *   type: string, items: import('./equality.js').Item[], missingIndex: number,
 *   answer: import('./equality.js').Item, options: import('./equality.js').Item[], ruleText: string, hint: Hint
 * }} Puzzle
 * `items` is the whole sequence including the answer at `missingIndex`; the screen shows a "?" in that place.
 */
export {};
