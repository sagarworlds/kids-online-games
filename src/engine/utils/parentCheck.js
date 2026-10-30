import { randInt } from './random.js';

/** @typedef {{ text: string, answer: number }} ParentQuestion */

/**
 * Builds the simple "grown-up check" question, e.g. "7 × 8". It only needs to
 * stop a young child tapping through to reset or settings, not to be secure.
 * Factors are 6–9 so the answer is not guessable from a times-table everyone
 * learns first, yet still easy for an adult.
 * @param {() => number} rng
 * @returns {ParentQuestion}
 */
export function createParentQuestion(rng) {
  const a = randInt(rng, 6, 9);
  const b = randInt(rng, 6, 9);
  return { text: `${a} × ${b}`, answer: a * b };
}

/**
 * @param {ParentQuestion} question
 * @param {string|number} input Raw text typed by the user.
 * @returns {boolean} True when the input is exactly the integer answer.
 */
export function checkParentAnswer(question, input) {
  const text = String(input).trim();
  return /^\d{1,3}$/.test(text) && Number(text) === question.answer;
}
