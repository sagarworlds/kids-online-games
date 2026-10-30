import { GameError } from '../../../engine/utils/errors.js';
import { FACTOR_MAX, FACTOR_MIN } from './levels.js';

/**
 * @typedef {{ key: string, table: number, x: number, y: number }} Fact
 * A multiplication fact. 6 × 7 and 7 × 6 are the same fact (same `key`), because knowing one is knowing the other.
 *
 * @typedef {{ key: string, table: number, a: number, b: number, answer: number, missing: 'answer'|'a'|'b' }} Question
 * One way of asking a fact: `a × b = answer`, with one of the three parts hidden.
 */

/** @param {number} a @param {number} b @returns {string} e.g. "7x8" for both 7 × 8 and 8 × 7. */
export const factKey = (a, b) => `${Math.min(a, b)}x${Math.max(a, b)}`;

/**
 * Every fact for the chosen tables (each table against 2 to 12), with duplicates removed: if both the 7 and the 8
 * table are chosen, 7 × 8 appears once. The fact is filed under the first table that produced it.
 *
 * @param {readonly number[]} tables
 * @returns {Fact[]}
 * @throws {GameError} 'NO_TABLES' for an empty or invalid selection.
 */
export function buildFacts(tables) {
  if (tables.length === 0 || tables.some((t) => !Number.isInteger(t) || t < FACTOR_MIN || t > FACTOR_MAX)) {
    throw new GameError('NO_TABLES', `Tables must be whole numbers from ${FACTOR_MIN} to ${FACTOR_MAX}`, { tables: [...tables] });
  }
  const seen = new Set();
  const facts = [];
  for (const table of tables) {
    for (let other = FACTOR_MIN; other <= FACTOR_MAX; other++) {
      const key = factKey(table, other);
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({ key, table, x: table, y: other });
    }
  }
  return facts;
}

/**
 * Asks a fact. The two factors appear in a random order (7 × 8 or 8 × 7), and with probability `missingChance` one
 * factor is hidden instead of the answer.
 *
 * @param {Fact} fact
 * @param {() => number} rng
 * @param {number} [missingChance]
 * @returns {Question}
 */
export function makeQuestion(fact, rng, missingChance = 0) {
  const swap = rng() < 0.5;
  const a = swap ? fact.y : fact.x;
  const b = swap ? fact.x : fact.y;
  let missing = 'answer';
  if (missingChance > 0 && rng() < missingChance) missing = rng() < 0.5 ? 'a' : 'b';
  return { key: fact.key, table: fact.table, a, b, answer: a * b, missing };
}

/** @param {Question} q @returns {number} The number the child has to find. */
export const correctValue = (q) => (q.missing === 'answer' ? q.answer : q[q.missing]);

/** @param {Question} q @returns {string} e.g. "7 × 8 = ?" or "? × 6 = 42". */
export function questionText(q) {
  const a = q.missing === 'a' ? '?' : q.a;
  const b = q.missing === 'b' ? '?' : q.b;
  const answer = q.missing === 'answer' ? '?' : q.answer;
  return `${a} × ${b} = ${answer}`;
}

/** @param {Question} q @returns {string} The whole fact, e.g. "7 × 8 = 56", shown after a wrong answer. */
export const fullText = (q) => `${q.a} × ${q.b} = ${q.answer}`;
