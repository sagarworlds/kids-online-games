/**
 * What to tell a child who was sent back to the home page because the game they opened was never saved for offline play: the service
 * worker sends them to `./?offline=<game>`. The home page shows this once and then tidies the address.
 *
 * Only the registry's own title is ever shown, never the text from the address, so a made-up link cannot put words on the screen.
 *
 * @param {string} search The page's query string, such as "?offline=lights-out" ("" or "?x=1" when there is nothing to say).
 * @param {readonly { slug: string, title: string }[]} games The registry.
 * @returns {string|null} The message, or null when the page was not opened this way.
 */
export function offlineNotice(search, games) {
  const slug = new URLSearchParams(search).get('offline');
  if (slug === null) return null;
  const name = games.find((game) => game.slug === slug)?.title ?? 'That game';
  return `${name} is not saved for offline play yet. Open it once while you are online and it will work offline too.`;
}
