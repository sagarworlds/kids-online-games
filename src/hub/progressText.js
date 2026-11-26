/** @typedef {import('./progressSummary.js').ProgressSummary} ProgressSummary */
/** @typedef {import('./progressSummary.js').SubjectProgress} SubjectProgress */
/** @typedef {import('./progressSummary.js').GameProgress} GameProgress */

/** "1 star", "2 stars". */
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The sentence at the top of the progress section.
 * @param {ProgressSummary} summary
 * @param {string} name The child's name, as the home page shows it.
 * @returns {string}
 */
export function describeTotals(summary, name) {
  if (summary.gamesPlayed === 0) return `${name} has not played anything on this device yet.`;
  const badges = summary.badges > 0 ? ` and ${count(summary.badges, 'badge')}` : '';
  return `${name} has earned ${count(summary.stars, 'star')}${badges}, playing ${summary.gamesPlayed} of ${summary.gamesTotal} games.`;
}

/**
 * The line under a subject's heading.
 * @param {SubjectProgress} subject
 * @returns {string}
 */
export function describeSubject(subject) {
  return `${count(subject.stars, 'star')}, ${subject.gamesPlayed} of ${subject.gamesTotal} games played`;
}

/**
 * What one game's row says: its stars, levels and badges, leaving out what is nothing; or that it has not been played.
 * @param {GameProgress} game
 * @returns {string}
 */
export function describeGame(game) {
  if (!game.played) return 'Not played yet';
  const facts = [
    game.stars > 0 ? count(game.stars, 'star') : null,
    game.levelsDone > 0 ? count(game.levelsDone, 'level') : null,
    game.badges > 0 ? count(game.badges, 'badge') : null,
  ].filter(Boolean);
  return facts.length > 0 ? facts.join(', ') : 'Played';
}
