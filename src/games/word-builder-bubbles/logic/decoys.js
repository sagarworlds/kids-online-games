import { shuffle } from '../../../engine/utils/random.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** Letters that are easy to mix up, in print or when you write them back to front. */
const CONFUSABLE = {
  b: 'dpq', d: 'bqp', p: 'qbd', q: 'pdg', m: 'nwh', n: 'mhu', u: 'nvw', v: 'uwy', w: 'vmu', i: 'ljt',
  l: 'itj', f: 'tlj', t: 'fli', a: 'oec', o: 'aec', c: 'eoa', e: 'cao', g: 'qyj', h: 'nbm', k: 'xhy',
  s: 'zc', z: 's', x: 'ky', y: 'gvj', j: 'ilg', r: 'nm',
};

/**
 * Chooses wrong letters for the bubbles. A decoy is never a letter that is in the word, otherwise popping it would
 * (correctly) fill a slot and it would not be a decoy at all. They are all different from each other.
 *
 * With `similar` (Hard) the decoys are picked first from letters that look like letters of the word (b for d, m for n),
 * which is the real mix-up in spelling; any gap is filled with other letters.
 *
 * @param {string} word
 * @param {number} count
 * @param {() => number} rng
 * @param {{ similar?: boolean }} [options]
 * @returns {string[]} `count` distinct letters, none in `word`.
 */
export function chooseDecoys(word, count, rng, { similar = false } = {}) {
  const inWord = new Set(word);
  const decoys = [];
  const take = (letter) => {
    if (decoys.length < count && !inWord.has(letter) && !decoys.includes(letter)) decoys.push(letter);
  };
  if (similar) {
    const lookAlikes = shuffle(rng, [...inWord].flatMap((letter) => (CONFUSABLE[letter] ?? '').split('')));
    for (const letter of lookAlikes) take(letter);
  }
  for (const letter of shuffle(rng, ALPHABET)) take(letter);
  return decoys;
}
