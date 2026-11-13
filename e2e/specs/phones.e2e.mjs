// The top bar (Home, title, stats, settings) is on every screen of every game, so on a small screen it decides how much room the game has.
// It used to wrap to two or three rows (a third of a 640px-tall screen) and, with four stats, ran off the side of a landscape phone.
// These keep it to one row where it can be, and never wider than the screen, on the small and landscape phones the games are meant for.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { openGame, startRound } from '../support/flow.mjs';
import { selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { fitsWidth, topBar } from '../support/ui.mjs';

const TIMEOUT = { timeout: 120_000 };

/**
 * The screens, and the tallest the bar may be (px) on the first screen and in a round. One row is about 63px; four stats may need a second
 * line on a narrow portrait phone, which makes it about 110px. `null` means only "nothing spills sideways" is checked.
 */
const SCREENS = [
  { screen: 'smallPhone', name: '360x640', menu: 80, round: 120 },
  { screen: 'landscapePhone', name: '667x375, landscape', menu: 80, round: 80 },
  { screen: 'tinyPhone', name: '320x568', menu: 80, round: null },
];

describe('the top bar on small and landscape phones', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  for (const game of selectGames()) {
    for (const { screen, name, menu, round } of SCREENS) {
      it(`${game.title} at ${name}`, TIMEOUT, () => scenario(env, `${game.slug} bar ${screen}`, { screen }, async ({ page, site, touch }) => {
        await openGame(page, site, game);
        const first = await topBar(page);
        assert.ok(first.inside && await fitsWidth(page), 'the first screen fits across the screen');
        assert.ok(first.height <= menu, `the first screen's bar is ${first.height}px tall, at most ${menu}px`);

        await startRound(page, game, { mode: game.three ? '3d' : '2d', touch });
        const bar = await topBar(page);
        assert.ok(bar.inside && await fitsWidth(page), 'everything in the bar is inside the screen, and the page does not scroll sideways');
        assert.ok(bar.hasTitleText, 'the bar still holds the name for screen readers, even where it is not shown');
        if (round !== null) assert.ok(bar.height <= round, `the bar is ${bar.height}px tall in a round, at most ${round}px`);
      }));
    }
  }
});
