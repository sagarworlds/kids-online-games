const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What to tell the child about a wrong arrow. The words come from the organism data, so a new animal needs no new code.
 * - reversed: "The rabbit doesn't eat the fox — check the arrow direction!"
 * - a producer as eater: "The grass makes its own food from sunlight, so no arrow points to it."
 * - otherwise: "Frogs don't eat grass. Frogs eat insects, snails and worms."
 *
 * @param {import('./linkChecker.js').WrongLink} wrong
 * @param {ReadonlyMap<string, import('./organisms.js').Organism>} organisms
 * @returns {string}
 */
export function wrongMessage({ link, reason }, organisms) {
  const food = organisms.get(link.from);
  const eater = organisms.get(link.to);
  if (reason === 'reversed') {
    return `The ${eater.name.toLowerCase()} doesn't eat the ${food.name.toLowerCase()} — check the arrow direction! An arrow goes from the food to the one that eats it.`;
  }
  if (eater.role === 'producer') return `The ${eater.name.toLowerCase()} makes its own food from sunlight, so no arrow points to it.`;
  return `${capital(eater.plural)} don't eat ${food.plural}. ${eater.diet}`;
}

/**
 * A nudge for when arrows are still missing: it names a living thing that is food for something, without saying what.
 * @param {import('./whatIf.js').Link} missing The first arrow still missing.
 * @param {ReadonlyMap<string, import('./organisms.js').Organism>} organisms
 * @returns {string}
 */
export function missingHint(missing, organisms) {
  return `What eats the ${organisms.get(missing.from).name.toLowerCase()}? Draw one more arrow.`;
}

/**
 * The sentence after a Check.
 * @param {import('./linkChecker.js').CheckResult} result
 * @returns {string}
 */
export function checkSummary({ correct, wrong, missing, complete }) {
  if (complete) return 'The food web is complete and it comes alive!';
  const parts = [];
  if (correct.length) parts.push(`${correct.length} right ${correct.length === 1 ? 'arrow' : 'arrows'}`);
  if (wrong.length) parts.push(`${wrong.length} to fix`);
  if (missing.length) parts.push(`${missing.length} still to draw`);
  return `${capital(parts.join(', '))}.`;
}
