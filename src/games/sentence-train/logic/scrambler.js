import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { acceptedOrders } from './sentences.js';

/**
 * @typedef {{ id: number, word: string }} Carriage
 */

const MAX_ATTEMPTS = 200;
const sameWords = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);

/**
 * Puts the carriages on the siding in a scrambled order that is never a correct sentence.
 *
 * The check is made on the words, not the carriages: a sentence with the same word twice has two carriages that look
 * identical, and swapping them still reads correctly, so "different from the answer" means different *words in
 * different places*. On Hard the extra carriage is ignored for this check, so the real words are never already in
 * order with the extra one merely sitting among them.
 *
 * @param {import('./sentences.js').SentenceEntry} entry
 * @param {() => number} rng
 * @returns {Carriage[]} Carriages with ids 1.. in siding order.
 * @throws {GameError} 'CANNOT_SCRAMBLE' if every order is accepted (all the words are the same).
 */
export function scramble(entry, rng) {
  const tokens = entry.distractor ? [...entry.words, entry.distractor] : [...entry.words];
  const accepted = acceptedOrders(entry);
  const isAnswer = (order) => {
    const real = entry.distractor ? order.filter((w) => w !== entry.distractor) : order;
    return accepted.some((a) => sameWords(a, real));
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const order = shuffle(rng, tokens);
    if (!isAnswer(order)) return order.map((word, i) => ({ id: i + 1, word }));
  }
  // A shuffle that keeps landing on an answer: a rotation changes the order unless every word is identical.
  for (let shift = 1; shift < tokens.length; shift++) {
    const order = [...tokens.slice(shift), ...tokens.slice(0, shift)];
    if (!isAnswer(order)) return order.map((word, i) => ({ id: i + 1, word }));
  }
  throw new GameError('CANNOT_SCRAMBLE', `Every order of "${entry.id}" is a correct sentence`, { id: entry.id });
}
