import { equals, fromSlices, slicesFor, format } from './fraction.js';
import { countTopping } from './pizza.js';

/**
 * @typedef {import('./fraction.js').Fraction} Fraction
 * @typedef {{ topping: string, expected: Fraction, actual: Fraction, ok: boolean, needed: number, have: number }} LineResult
 * @typedef {{ ok: boolean, perLine: LineResult[], extras: string[] }} CheckResult
 */

/**
 * Checks a pizza against an order. A line is right when the share of slices with that topping equals the ordered
 * fraction (cross-multiplication, so 4 of 8 slices satisfies "1/2"). A topping that was not ordered at all makes
 * the pizza wrong too, and is reported in `extras`.
 *
 * @param {import('./orderGenerator.js').Order} order
 * @param {import('./pizza.js').PizzaState} pizza
 * @returns {CheckResult}
 */
export function checkOrder(order, pizza) {
  const perLine = order.lines.map((line) => {
    const have = countTopping(pizza, line.topping);
    const actual = fromSlices(have, order.slices);
    return { topping: line.topping, expected: line.amount, actual, ok: equals(actual, line.amount), needed: slicesFor(line.amount, order.slices), have };
  });
  const ordered = new Set(order.lines.map((l) => l.topping));
  const extras = [...new Set(pizza.filter((t) => t !== null && !ordered.has(t)))];
  return { ok: perLine.every((l) => l.ok) && extras.length === 0, perLine, extras };
}

/**
 * A kind hint for the first thing that is off, in the style "You have 2/8, the order is 3/8".
 * @param {CheckResult} result
 * @param {(toppingId: string) => string} label Turns a topping id into its display name.
 * @returns {string}
 */
export function hintFor(result, label) {
  const bad = result.perLine.find((l) => !l.ok);
  if (bad) {
    const have = `You have ${format(bad.actual)} ${label(bad.topping).toLowerCase()}, the order is ${format(bad.expected)}`;
    // For equivalent fractions the slice count is the helpful clue: "1/2 of 8 slices is 4 slices".
    return bad.expected.den === bad.actual.den ? `${have}.` : `${have}. That is ${bad.needed} of ${bad.actual.den} slices.`;
  }
  if (result.extras.length) return `Nobody asked for ${result.extras.map(label).join(' or ').toLowerCase()}. Take it off.`;
  return 'Perfect!';
}

/**
 * Which slices to pulse after a wrong serve, so the child sees where to look: topped slices that are not wanted
 * (too many of a topping, or a topping nobody ordered) or, when a topping is short, the bare slices.
 *
 * @param {import('./orderGenerator.js').Order} order
 * @param {import('./pizza.js').PizzaState} pizza
 * @returns {number[]} Slice indices, ascending.
 */
export function offSlices(order, pizza) {
  const result = checkOrder(order, pizza);
  const off = new Set();
  for (const line of result.perLine) {
    if (line.ok) continue;
    if (line.have > line.needed) {
      // Pulse the surplus slices (the last ones with this topping), not all of them.
      pizza.map((t, i) => (t === line.topping ? i : -1)).filter((i) => i >= 0).slice(line.needed).forEach((i) => off.add(i));
    } else {
      pizza.forEach((t, i) => { if (t === null) off.add(i); });
    }
  }
  pizza.forEach((t, i) => { if (t !== null && result.extras.includes(t)) off.add(i); });
  return [...off].sort((a, b) => a - b);
}
