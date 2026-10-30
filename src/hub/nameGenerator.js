import { invalidData } from '../engine/utils/errors.js';
import { pick } from '../engine/utils/random.js';
import { NAME_MAX } from './nameValidation.js';

/**
 * @typedef {{
 *   version: number, adjectives: string[], animals: { name: string, emoji: string }[]
 * }} NameLists
 */

const MIN_WORDS = 30;

/**
 * Validates the contents of `data/names.json`.
 * @param {any} data
 * @returns {NameLists}
 * @throws {GameError} Code 'INVALID_DATA' naming the bad field.
 */
export function validateNameLists(data) {
  const file = 'names.json';
  if (!Array.isArray(data?.adjectives) || data.adjectives.length < MIN_WORDS) {
    invalidData(file, 'adjectives', `must be an array of at least ${MIN_WORDS} words`);
  }
  if (!Array.isArray(data?.animals) || data.animals.length < MIN_WORDS) {
    invalidData(file, 'animals', `must be an array of at least ${MIN_WORDS} animals`);
  }
  data.adjectives.forEach((word, i) => {
    if (typeof word !== 'string' || !word.trim()) invalidData(file, `adjectives[${i}]`, 'must be a non-empty string');
  });
  data.animals.forEach((animal, i) => {
    if (typeof animal?.name !== 'string' || !animal.name.trim()) invalidData(file, `animals[${i}].name`, 'must be a non-empty string');
    if (typeof animal?.emoji !== 'string' || !animal.emoji) invalidData(file, `animals[${i}].emoji`, 'must be a non-empty string');
    if (`${data.adjectives.reduce((a, b) => (b.length > a.length ? b : a), '')} ${animal.name}`.length > NAME_MAX) {
      invalidData(file, `animals[${i}].name`, `makes a name longer than ${NAME_MAX} characters`);
    }
  });
  return data;
}

/**
 * Builds a friendly "Adjective Animal" name and the matching animal avatar.
 * @param {() => number} rng
 * @param {NameLists} lists
 * @returns {{ name: string, avatar: string }}
 */
export function randomName(rng, lists) {
  const adjective = pick(rng, lists.adjectives);
  const animal = pick(rng, lists.animals);
  return { name: `${adjective} ${animal.name}`, avatar: animal.emoji };
}
