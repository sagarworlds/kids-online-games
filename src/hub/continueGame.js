/**
 * Which game the home page offers to continue: the registry entry of the game played last, if that is still a game a child can open.
 *
 * Only the registry entry is ever returned, so nothing that came out of storage reaches the page or becomes a link: a made-up, mistyped or
 * out-of-date slug simply finds no game, and the page shows no card.
 *
 * @param {{ slug: string }|null} last What `LastPlayedService.current()` returned.
 * @param {readonly import('./gamesRegistry.js').GameEntry[]} games The registry.
 * @returns {import('./gamesRegistry.js').GameEntry|null}
 */
export function pickContinueGame(last, games) {
  if (!last || typeof last.slug !== 'string') return null;
  return games.find((game) => game.slug === last.slug && game.available) ?? null;
}
