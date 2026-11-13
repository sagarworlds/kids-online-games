// 3D is a bonus, never a requirement. Phones lose their graphics, browsers have none, files fail to download. In every one
// of those cases the child must still get a working game, with the state they had and no error screen, and the reason must be
// logged for developers (no silent failures). Each 3D game is put through the four ways 3D can fail.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { currentView, expectFlat, expectPicture, gameUrl, openGame, startRound } from '../support/flow.mjs';
import { selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';
import { CANVAS, EXPECTED, failGraphicsAfterProbe, failThreeFiles, loseGraphics } from '../support/webgl.mjs';

const TIMEOUT = { timeout: 240_000 };
const FLAT = { mode: '2d' };

describe('when 3D cannot run, the game carries on flat', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser, noWebgl: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
    env.noWebgl = await launchBrowser({ webgl: false });
  });
  after(async () => {
    await env.browser?.close();
    await env.noWebgl?.close();
    await env.site?.close();
  });

  for (const game of selectGames().filter((g) => g.three)) {
    it(`${game.title}: a browser with no WebGL at all`, TIMEOUT, () => scenario({ ...env, browser: env.noWebgl }, `${game.slug} no webgl`, {}, async ({ page, log, site, touch }) => {
      await openGame(page, site, game);
      assert.equal(await page.locator('.view-toggle').count(), 0, 'a device that cannot do 3D is not offered 3D');
      await expectFlat(page);
      await startRound(page, game, { ...FLAT, touch });
      await expectFlat(page);
      await game.act(page, { ...FLAT, touch });
      assert.equal(log.loadedThree(), false, 'three.js is never downloaded where it cannot be used');
    }));

    it(`${game.title}: graphics lost in the middle of play`, TIMEOUT, () => scenario(env, `${game.slug} lost`, { expected: EXPECTED.graphicsLost }, async ({ page, log, site, touch }) => {
      await openGame(page, site, game);
      // Lose them wherever the 3D picture is: in the round if the round is 3D, otherwise on the first screen.
      const inRound = game.three.round;
      if (inRound) await startRound(page, game, { mode: '3d', touch });
      await expectPicture(page);
      await loseGraphics(page);

      await eventually(async () => (await page.locator(CANVAS).count()) === 0, { timeout: 15_000, message: 'the flat view to replace the lost 3D picture' });
      await expectFlat(page);
      await page.locator(inRound ? game.playing : game.menu).first().waitFor({ timeout: 10_000 });
      if (!inRound) await startRound(page, game, { ...FLAT, touch });
      await game.act(page, { ...FLAT, touch });
      assert.ok(log.sawExpected(/graphics were lost|WEBGL_CONTEXT_LOST/), 'the loss was logged for developers');

      // Losing graphics once does not change what the child chose: the next visit is 3D again.
      await page.goto(gameUrl(site, game));
      await page.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
      assert.equal(await currentView(page), '3d');
    }));

    it(`${game.title}: graphics that cannot start`, TIMEOUT, () => scenario(env, `${game.slug} unavailable`, { prepare: failGraphicsAfterProbe, expected: EXPECTED.graphicsUnavailable }, async ({ page, log, site, touch }) => {
      await openGame(page, site, game);
      assert.equal(await page.locator('.view-toggle').count(), 1, 'the device said yes to 3D, so the toggle is offered');
      await startRound(page, game, { ...FLAT, touch });
      await expectFlat(page);
      await game.act(page, { ...FLAT, touch });
      await eventually(() => log.sawExpected(/could not start|WEBGL_UNAVAILABLE|Error creating WebGL context/), { timeout: 5_000, message: 'the reason 3D could not start to be logged' });
    }));

    it(`${game.title}: 3D files that do not download`, TIMEOUT, () => scenario(env, `${game.slug} files`, {
      prepare: (context) => failThreeFiles(context, game.slug),
      expected: EXPECTED.filesFailed,
    }, async ({ page, log, site, touch }) => {
      await openGame(page, site, game);
      await startRound(page, game, { ...FLAT, touch });
      await expectFlat(page);
      await game.act(page, { ...FLAT, touch });
      await eventually(() => log.sawExpected(/Failed to fetch dynamically imported module/), { timeout: 5_000, message: 'the failed download to be logged' });
    }));
  }
});
