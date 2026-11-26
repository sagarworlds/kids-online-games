import { GameError } from '../engine/utils/errors.js';

/**
 * @typedef {import('./gamesRegistry.js').GameEntry} GameEntry
 * @typedef {import('./gamesRegistry.js').SubjectId} SubjectId
 *
 * @typedef {{
 *   slug: string, title: string, icon: string, learningTag: string, subject: SubjectId,
 *   stars: number, levelsDone: number, badges: number, played: boolean, playedLast: boolean
 * }} GameProgress What one game's save says. `levelsDone` counts the levels (or modes, or activities: whatever the game saves stars for)
 *   that have at least one star.
 *
 * @typedef {{
 *   id: SubjectId, heading: string, stars: number, gamesPlayed: number, gamesTotal: number, games: GameProgress[]
 * }} SubjectProgress
 *
 * @typedef {{
 *   stars: number, gamesPlayed: number, gamesTotal: number, badges: number, subjects: SubjectProgress[]
 * }} ProgressSummary
 */

/**
 * What a grown-up sees of the child's progress: the totals, and the same numbers for each subject and each game. It only reads what the
 * games already save (stars per level, badges); nothing new is recorded and nothing leaves the device.
 *
 * A game counts as played by the rule the home page uses for its "New" badge: something has been saved for it (a star, a score or a badge).
 * Games that are not available yet are left out, and so are subjects with no available game.
 *
 * @param {{
 *   games: readonly GameEntry[],
 *   subjects: readonly { id: SubjectId, heading: string }[],
 *   saveOf: (slug: string) => import('../engine/services/schemas.js').SaveData,
 *   lastSlug?: string|null
 * }} input `saveOf` reads one game's save (`RewardService.getSave`); `lastSlug` is the game played last, if known, which is marked.
 * @returns {ProgressSummary}
 * @throws {GameError} With code 'UNKNOWN_SUBJECT' when a game names a subject that is not in `subjects` (a mistake in the registry).
 */
export function summarizeProgress({ games, subjects, saveOf, lastSlug = null }) {
  const bySubject = new Map(subjects.map(({ id, heading }) => [id, { id, heading, stars: 0, gamesPlayed: 0, gamesTotal: 0, games: [] }]));

  for (const game of games) {
    if (!game.available) continue;
    const subject = bySubject.get(game.subject);
    if (!subject) {
      throw new GameError('UNKNOWN_SUBJECT', `${game.slug} is in the subject "${game.subject}", which the home page does not list`, { slug: game.slug, subject: game.subject });
    }
    const save = saveOf(game.slug);
    const stars = Object.values(save.bestStars).reduce((sum, earned) => sum + earned, 0);
    const levelsDone = Object.keys(save.bestStars).length;
    const played = levelsDone > 0 || save.bestScore > 0 || save.badges.length > 0;

    subject.games.push({
      slug: game.slug, title: game.title, icon: game.icon, learningTag: game.learningTag, subject: game.subject,
      stars, levelsDone, badges: save.badges.length, played, playedLast: game.slug === lastSlug,
    });
    subject.stars += stars;
    subject.gamesTotal += 1;
    if (played) subject.gamesPlayed += 1;
  }

  const shown = [...bySubject.values()].filter((subject) => subject.gamesTotal > 0);
  return {
    stars: shown.reduce((sum, subject) => sum + subject.stars, 0),
    gamesPlayed: shown.reduce((sum, subject) => sum + subject.gamesPlayed, 0),
    gamesTotal: shown.reduce((sum, subject) => sum + subject.gamesTotal, 0),
    badges: shown.reduce((sum, subject) => sum + subject.games.reduce((count, game) => count + game.badges, 0), 0),
    subjects: shown,
  };
}
