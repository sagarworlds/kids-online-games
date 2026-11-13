// Every game, opened the way a child opens it: the first screen, a round, a first move, in 2D and (where there is one) 3D,
// on a desktop and on a phone. This catches what unit tests cannot: a broken page, a scene that throws when it starts,
// a 3D picture that stays blank, a layout that spills off a phone, three.js downloaded when nobody asked for 3D.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { currentView, expectFitsScreen, expectFlat, expectPicture, openGame, startRound, switchView } from '../support/flow.mjs';
import { selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { fitsWidth } from '../support/ui.mjs';

const TIMEOUT = { timeout: 240_000 };

describe('every game opens, starts a round and takes a first move', () => {
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
    if (game.three) {
      it(`${game.title}: 3D view`, TIMEOUT, () => scenario(env, `${game.slug} 3d`, {}, async ({ page, log, site, touch }) => {
        await openGame(page, site, game);
        assert.equal(await currentView(page), '3d', 'a device that can do 3D opens the game in 3D');
        if (game.three.menu) await expectPicture(page);
        else assert.equal(log.loadedThree(), false, 'a flat first screen does not download three.js');

        await startRound(page, game, { mode: '3d', touch });
        if (game.three.round) {
          await expectPicture(page);
          assert.equal(log.loadedThree(), true, 'the 3D round loaded three.js');
        } else {
          await expectFlat(page); // leaving a 3D screen for a flat one takes the 3D picture away with it
        }
        await game.act(page, { mode: '3d', touch });
      }));

      it(`${game.title}: 2D view, remembered, and three.js stays away`, TIMEOUT, () => scenario(env, `${game.slug} 2d`, {}, async ({ page, log, site, touch }) => {
        await openGame(page, site, game);
        await switchView(page, '2d');
        await expectFlat(page);

        // The choice is saved: a new visit opens flat from its very first screen, and never asks for the 3D library.
        const visit = log.requests.length;
        await page.reload();
        await page.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
        assert.equal(await currentView(page), '2d', 'the child\'s choice of 2D survives a reload');
        await expectFlat(page);
        await startRound(page, game, { mode: '2d', touch });
        await expectFlat(page);
        await game.act(page, { mode: '2d', touch });
        assert.equal(log.loadedThree(visit), false, 'the flat view never downloads three.js');
      }));

      it(`${game.title}: 3D view on a phone`, TIMEOUT, () => scenario(env, `${game.slug} phone`, { screen: 'phone' }, async ({ page, site, touch }) => {
        await openGame(page, site, game);
        assert.ok(await fitsWidth(page), 'the first screen fits the phone');
        if (game.three.menu) await expectFitsScreen(page);
        await startRound(page, game, { mode: '3d', touch });
        if (game.three.round) {
          await expectPicture(page);
          await expectFitsScreen(page);
        }
        assert.ok(await fitsWidth(page), 'the round fits the phone');
        await game.act(page, { mode: '3d', touch });
      }));
    } else {
      it(`${game.title}`, TIMEOUT, () => scenario(env, game.slug, {}, async ({ page, site, touch }) => {
        await openGame(page, site, game);
        await startRound(page, game, { mode: '2d', touch });
        await game.act(page, { mode: '2d', touch });
      }));

      it(`${game.title}: on a phone`, TIMEOUT, () => scenario(env, `${game.slug} phone`, { screen: 'phone' }, async ({ page, site, touch }) => {
        await openGame(page, site, game);
        assert.ok(await fitsWidth(page), 'the first screen fits the phone');
        await startRound(page, game, { mode: '2d', touch });
        assert.ok(await fitsWidth(page), 'the round fits the phone');
        await game.act(page, { mode: '2d', touch });
      }));
    }
  }
});
