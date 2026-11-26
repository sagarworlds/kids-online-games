import { el, spaced } from '../engine/utils/dom.js';
import { describeGame, describeSubject, describeTotals } from './progressText.js';

/** @typedef {import('./progressSummary.js').ProgressSummary} ProgressSummary */
/** @typedef {import('./progressSummary.js').SubjectProgress} SubjectProgress */
/** @typedef {import('./progressSummary.js').GameProgress} GameProgress */

/**
 * The "Progress" part of the grown-ups' settings: one sentence with the totals, and under "Progress by game" the same numbers for each
 * subject and each game. A child who has played nothing gets the sentence only. The list is folded away until it is asked for, so the
 * dialog stays short; it is plain headings and lists, so a screen reader reads it as it is.
 *
 * @param {ProgressSummary} summary From `summarizeProgress`.
 * @param {{ name: string }} options `name` is the child's name as the home page shows it.
 * @returns {HTMLElement}
 */
export function buildProgressSection(summary, { name }) {
  const section = el('section', { class: 'field progress' },
    el('h3', { text: 'Progress' }),
    el('p', { class: 'progress__total', text: describeTotals(summary, name) }));
  if (summary.gamesPlayed === 0) return section;

  section.append(el('details', { class: 'progress__details' },
    el('summary', { text: 'Progress by game' }),
    ...summary.subjects.map(buildSubject)));
  return section;
}

/** @param {SubjectProgress} subject @returns {HTMLElement} */
function buildSubject(subject) {
  return el('div', { class: 'progress__subject' },
    el('h4', { class: 'progress__heading', text: subject.heading }),
    el('p', { class: 'progress__subtotal', text: describeSubject(subject) }),
    el('ul', { class: 'progress__games' }, ...subject.games.map(buildGame)));
}

/** @param {GameProgress} game @returns {HTMLElement} */
function buildGame(game) {
  return el('li', { class: `progress__game${game.played ? '' : ' is-unplayed'}`, data: { slug: game.slug } },
    ...spaced(
      el('span', { class: 'progress__icon', text: game.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'progress__title', text: game.title }),
      game.playedLast ? el('span', { class: 'progress__last', text: 'Played last' }) : null,
      el('span', { class: 'progress__facts', text: describeGame(game) })));
}
