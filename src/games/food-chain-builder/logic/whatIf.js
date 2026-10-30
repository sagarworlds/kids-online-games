import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {'up'|'down'|'same'} Effect
 * @typedef {{ from: string, to: string }} Link  `from` is the food, `to` the eater.
 */

/**
 * The one-step rule for "What if this living thing disappeared?":
 * whatever eats it goes **down** (it lost a food), whatever it eats goes **up** (one fewer eater), and everything else
 * stays about the **same**. Only direct links count (the real world has more steps; the answer screen says so).
 * Both the required and the allowed links are used, because both are true food relations of the habitat.
 *
 * @param {{ organisms: readonly string[], required: readonly Link[], allowed: readonly Link[] }} habitat
 * @param {string} removedId
 * @returns {Record<string, Effect>} An effect for every organism except the removed one.
 * @throws {GameError} 'UNKNOWN_ORGANISM'
 */
export function deriveEffects(habitat, removedId) {
  if (!habitat.organisms.includes(removedId)) throw new GameError('UNKNOWN_ORGANISM', `"${removedId}" is not in this habitat`, { removedId });
  const links = [...habitat.required, ...habitat.allowed];
  /** @type {Record<string, Effect>} */
  const effects = {};
  for (const id of habitat.organisms) {
    if (id === removedId) continue;
    const eatsRemoved = links.some((l) => l.from === removedId && l.to === id);
    const eatenByRemoved = links.some((l) => l.from === id && l.to === removedId);
    effects[id] = eatsRemoved ? 'down' : eatenByRemoved ? 'up' : 'same';
  }
  return effects;
}

/**
 * Scores a child's predictions against the right answers. A living thing the child did not answer counts as wrong.
 *
 * @param {Readonly<Record<string, Effect>>} prediction What the child chose for each card.
 * @param {Readonly<Record<string, Effect>>} effects The right answers, from the data.
 * @returns {{ correct: number, total: number, wrongIds: string[] }}
 * @throws {GameError} 'UNKNOWN_ORGANISM' if the prediction names something that is not being asked about.
 */
export function scorePrediction(prediction, effects) {
  for (const id of Object.keys(prediction)) {
    if (!(id in effects)) throw new GameError('UNKNOWN_ORGANISM', `"${id}" is not part of this question`, { id });
  }
  const ids = Object.keys(effects);
  const wrongIds = ids.filter((id) => prediction[id] !== effects[id]);
  return { correct: ids.length - wrongIds.length, total: ids.length, wrongIds };
}

/**
 * The sentence that explains one right answer, in the same simple rule.
 * @param {Effect} effect
 * @param {{ name: string, plural: string }} organism The one being asked about.
 * @param {{ name: string, plural: string }} removed The one that disappeared.
 * @returns {string}
 */
export function explainEffect(effect, organism, removed) {
  const subject = organism.plural.charAt(0).toUpperCase() + organism.plural.slice(1);
  switch (effect) {
    case 'down': return `${subject} would go down: they lose one of their foods, ${removed.plural}.`;
    case 'up': return `${subject} would go up: ${removed.plural} are gone, so there is nothing left to eat them.`;
    default: return `${subject} would stay about the same: they do not eat ${removed.plural} and ${removed.plural} do not eat them.`;
  }
}
