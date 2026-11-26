// A phone that cannot keep a 3D picture moving should not be left with a choppy game. Each 3D view times its own frames: it lowers its
// resolution first and, when frames stay slow, gives way to the flat game in place; then the device remembers, so the next visit opens
// flat. These make every animation frame expensive (see `makeFramesSlowable`) and check that every 3D game does exactly that.
//
// Every other check keeps this speed check off (see `quietFrameWatch`), because the software renderer on a test machine is slow on purpose.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { currentView, expectFlat, gameUrl, openGame, startRound } from '../support/flow.mjs';
import { GAMES, selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';
import { CANVAS, EXPECTED, makeFramesSlowable, setFrameCost } from '../support/webgl.mjs';

const TIMEOUT = { timeout: 240_000 };
const FLAT = { mode: '2d' };

describe('a 3D view that runs too slowly gives way to the flat game', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  /** Opens the game's 3D view at full speed and waits until the picture is there. */
  async function openThreeD(page, game, site, touch) {
    await openGame(page, site, game);
    if (game.three.round) await startRound(page, game, { mode: '3d', touch });
    await page.locator(CANVAS).first().waitFor({ state: 'attached', timeout: 25_000 });
  }

  for (const game of selectGames().filter((g) => g.three)) {
    it(`${game.title}: far too slow for 3D`, TIMEOUT, () => scenario(env, `${game.slug} slow`, {
      frameWatch: 'on', prepare: makeFramesSlowable, expected: EXPECTED.tooSlow,
    }, async ({ page, log, site, touch }) => {
      await openThreeD(page, game, site, touch);
      await setFrameCost(page, 250); // a few animation callbacks per frame: half a second or more for each frame

      await eventually(async () => (await page.locator(CANVAS).count()) === 0, { timeout: 90_000, interval: 250, message: 'the slow 3D view to give way to the flat game' });
      await setFrameCost(page, 0);
      await expectFlat(page);
      const inRound = game.three.round;
      await page.locator(inRound ? game.playing : game.menu).first().waitFor({ timeout: 20_000 });
      if (!inRound) await startRound(page, game, { ...FLAT, touch });
      await game.act(page, { ...FLAT, touch });
      assert.ok(log.sawExpected(/STAGE_TOO_SLOW/), 'the reason was logged for developers');

      // The device remembers, so the next visit opens flat from the first screen and never asks for the 3D library.
      const device = await page.evaluate(() => JSON.parse(localStorage.getItem('kidsgames:device')));
      assert.equal(device.slow3d, true, 'the device was marked slow');
      const visit = log.requests.length;
      await page.goto(gameUrl(site, game));
      await page.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
      assert.equal(await currentView(page), '2d', 'a device that was too slow opens the game flat');
      await expectFlat(page);
      assert.equal(log.loadedThree(visit), false, 'and does not download three.js');
    }));
  }

  const lightsOut = GAMES.find((g) => g.slug === 'lights-out');
  it('Lights Out: a view that is only a bit too slow gets a lower resolution first, then gives way if that is not enough', TIMEOUT, () => scenario(env, 'lights-out lowers', {
    frameWatch: 'on', prepare: makeFramesSlowable, expected: EXPECTED.tooSlow,
  }, async ({ page, log, site, touch }) => {
    await openThreeD(page, lightsOut, site, touch);
    const width = () => page.locator(CANVAS).evaluate((canvas) => canvas.width / canvas.clientWidth);
    assert.ok(Math.abs((await width()) - 1) < 0.02, 'the picture starts at full resolution on this test device'); // the buffer is rounded to whole pixels

    await setFrameCost(page, 30); // the whole frame comes to roughly 60 to 90 ms: choppy, but not hopeless
    await eventually(async () => (await width()) < 0.8, { timeout: 60_000, interval: 250, message: 'the first drop in resolution' });
    await eventually(async () => (await width()) < 0.55, { timeout: 60_000, interval: 250, message: 'the second drop in resolution' });
    // Lowering did not help (the cost is in every frame, not in the pixels), so it gives way.
    await eventually(async () => (await page.locator(CANVAS).count()) === 0, { timeout: 90_000, interval: 250, message: 'the view to give way after the last drop' });
    await setFrameCost(page, 0);
    await expectFlat(page);
    assert.ok(log.sawExpected(/resolution goes down to x0\.75/) && log.sawExpected(/resolution goes down to x0\.5/), 'both drops were logged');
    assert.ok(log.sawExpected(/STAGE_TOO_SLOW/), 'and so was the end');
  }));
});
