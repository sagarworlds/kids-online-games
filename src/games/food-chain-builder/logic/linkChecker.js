import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {import('./whatIf.js').Link} Link
 * @typedef {{ link: Link, reason: 'reversed'|'invalid' }} WrongLink
 * @typedef {{ correct: Link[], wrong: WrongLink[], missing: Link[], complete: boolean }} CheckResult
 */

/** @param {Link} link @returns {string} A string that is the same for the same arrow. */
export const linkKey = (link) => `${link.from}>${link.to}`;

/** @param {Link} a @param {Link} b */
export const sameLink = (a, b) => a.from === b.from && a.to === b.to;

/**
 * Adds an arrow the child drew. An arrow from a living thing to itself, or one that is already there, is ignored without
 * a word (the spec calls it "rejected silently"): the child just did not draw anything new.
 *
 * @param {readonly Link[]} links
 * @param {Link} link `from` is the food, `to` the eater.
 * @param {{ organisms: readonly string[] }} habitat
 * @returns {{ links: Link[], added: boolean }} The same list when nothing was added.
 * @throws {GameError} 'UNKNOWN_ORGANISM' if an end of the arrow is not in the habitat (a bug, the screen cannot draw that).
 */
export function addLink(links, link, habitat) {
  for (const id of [link.from, link.to]) {
    if (!habitat.organisms.includes(id)) throw new GameError('UNKNOWN_ORGANISM', `"${id}" is not in this habitat`, { id });
  }
  if (link.from === link.to || links.some((l) => sameLink(l, link))) return { links: [...links], added: false };
  return { links: [...links, { from: link.from, to: link.to }], added: true };
}

/** @param {readonly Link[]} links @param {Link} link @returns {Link[]} The list without that arrow. */
export const removeLink = (links, link) => links.filter((l) => !sameLink(l, link));

/**
 * Checks the arrows against a habitat.
 * - **correct**: required or allowed (extra correct arrows are fine);
 * - **wrong, reversed**: the food web has the same arrow the other way round ("check the arrow direction!");
 * - **wrong, invalid**: neither way is in the habitat;
 * - **missing**: required arrows the child has not drawn.
 * Arrows drawn twice count once. `complete` means nothing is wrong and nothing is missing.
 *
 * @param {readonly Link[]} userLinks
 * @param {{ organisms: readonly string[], required: readonly Link[], allowed: readonly Link[] }} habitat
 * @returns {CheckResult}
 * @throws {GameError} 'UNKNOWN_ORGANISM'
 */
export function check(userLinks, habitat) {
  const valid = new Set([...habitat.required, ...habitat.allowed].map(linkKey));
  const unique = [];
  for (const link of userLinks) {
    for (const id of [link.from, link.to]) {
      if (!habitat.organisms.includes(id)) throw new GameError('UNKNOWN_ORGANISM', `"${id}" is not in this habitat`, { id });
    }
    if (!unique.some((l) => sameLink(l, link))) unique.push({ from: link.from, to: link.to });
  }
  const correct = [];
  const wrong = [];
  for (const link of unique) {
    if (valid.has(linkKey(link))) correct.push(link);
    else wrong.push({ link, reason: valid.has(linkKey({ from: link.to, to: link.from })) ? 'reversed' : 'invalid' });
  }
  const missing = habitat.required.filter((r) => !unique.some((l) => sameLink(l, r)));
  return { correct, wrong, missing, complete: wrong.length === 0 && missing.length === 0 };
}
