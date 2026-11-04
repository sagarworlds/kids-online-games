import { GameError } from '../../../engine/utils/errors.js';
import { sample, shuffle } from '../../../engine/utils/random.js';
import { wordsFor } from './words.js';

/**
 * Builds the rounds of each activity. Each function takes the content (what is taught), the level's settings and a random
 * source, and returns plain data, so the same seed always gives the same round.
 *
 * @typedef {import('./levels.js').Syllable} Syllable
 * @typedef {import('./levels.js').Content} Content
 */

/**
 * Picks `count` different items, or all of them if there are fewer. @template T @param {() => number} rng @param {readonly T[]} items @param {number} count
 */
const take = (rng, items, count) => sample(rng, items, Math.min(count, items.length));

/**
 * Build: a syllable is spoken and the child picks the consonant and the vowel sign that make it.
 *
 * @typedef {{ target: Syllable, consonants: import('./devanagari.js').Consonant[], signs: import('./devanagari.js').Sign[] }} BuildRound
 *
 * @param {{ content: Content, choices: number, count: number, rng: () => number }} options
 * @returns {BuildRound[]} `count` rounds with different targets; each offers the right consonant and sign among others.
 * @throws {GameError} 'NOT_ENOUGH_CONTENT' if there is nothing to build.
 */
export function makeBuildRounds({ content, choices, count, rng }) {
  if (content.syllables.length === 0) throw new GameError('NOT_ENOUGH_CONTENT', 'There are no syllables to build');
  return take(rng, content.syllables, count).map((target) => ({
    target,
    consonants: shuffle(rng, [target.consonant, ...take(rng, content.consonants.filter((c) => c !== target.consonant), choices - 1)]),
    signs: shuffle(rng, [target.sign, ...take(rng, content.signs.filter((s) => s !== target.sign), choices - 1)]),
  }));
}

/** Checks a pick in Build. @param {BuildRound} round @returns {{ consonantOk: boolean, signOk: boolean, correct: boolean }} */
export function checkBuild(round, consonant, sign) {
  const consonantOk = consonant === round.target.consonant;
  const signOk = sign === round.target.sign;
  return { consonantOk, signOk, correct: consonantOk && signOk };
}

/**
 * Bubble pop: a syllable is called out and the child pops the bubble that shows it. About a third of the other bubbles have
 * the same consonant (to tell the signs apart), a third the same sign (to tell the consonants apart), the rest are anything.
 *
 * @typedef {{ target: Syllable, bubbles: Syllable[] }} BubbleRound
 *
 * @param {{ content: Content, bubbles: number, count: number, rng: () => number }} options
 * @returns {BubbleRound[]}
 */
export function makeBubbleRounds({ content, bubbles, count, rng }) {
  if (content.syllables.length < bubbles) throw new GameError('NOT_ENOUGH_CONTENT', `Need ${bubbles} syllables for the bubbles but there are ${content.syllables.length}`);
  return take(rng, content.syllables, count).map((target) => {
    const others = content.syllables.filter((s) => s !== target);
    const sameConsonant = others.filter((s) => s.consonant === target.consonant);
    const sameSign = others.filter((s) => s.sign === target.sign);
    const wanted = bubbles - 1;
    const picked = [...take(rng, sameConsonant, Math.ceil(wanted / 3)), ...take(rng, sameSign, Math.ceil(wanted / 3))];
    const chosen = new Set(picked.slice(0, wanted));
    for (const s of shuffle(rng, others)) {
      if (chosen.size >= wanted) break;
      chosen.add(s);
    }
    return { target, bubbles: shuffle(rng, [target, ...chosen]) };
  });
}

/**
 * Read words: a word is shown and the child picks its picture.
 *
 * @typedef {{ word: import('./words.js').Word, options: import('./words.js').Word[] }} WordRound
 *
 * @param {{ words: readonly import('./words.js').Word[], content: Content, choices: number, count: number, rng: () => number }} options
 * @returns {WordRound[]} Words made only of syllables in `content`; every option is a different picture.
 * @throws {GameError} 'NOT_ENOUGH_CONTENT' if fewer words than choices can be read yet.
 */
export function makeWordRounds({ words, content, choices, count, rng }) {
  const readable = wordsFor(words, content);
  if (readable.length < choices) throw new GameError('NOT_ENOUGH_CONTENT', `Only ${readable.length} words can be read with this content, and ${choices} choices are needed`);
  return take(rng, readable, count).map((word) => ({
    word,
    options: shuffle(rng, [word, ...take(rng, readable.filter((w) => w !== word), choices - 1)]),
  }));
}
