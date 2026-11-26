// Lights Out played to the moment a puzzle is solved, which the generic checks do not reach. The flat board used to mark itself "solved"
// for a stylesheet that never matched, and by then every jar was empty anyway, so no firefly ever flew away. These keep that moment honest:
// in 2D the freed fireflies fly out over the "solved" card and are gone afterwards, nothing flies for a child who wants less motion, and in 3D
// the flat jars under the picture stay quiet because the picture flies its own.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { openGame, startRound, switchView } from '../support/flow.mjs';
import { GAMES } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually, textOf } from '../support/ui.mjs';

const game = GAMES.find((g) => g.slug === 'lights-out');
const TIMEOUT = { timeout: 120_000 };

/**
 * Solves the puzzle on screen with the Hint button (it names a jar that belongs to a solution) and presses each hinted jar with the keyboard,
 * which works the same in 2D and 3D.
 * @returns {Promise<string[]>} The jars (as "row,column") that held a firefly just before the last press, the ones that press set free.
 */
async function solveWithHints(page) {
  let litBeforeLastPress = [];
  for (let guard = 0; guard < 60; guard++) {
    if (await page.locator('.lo-solved:visible').count()) return litBeforeLastPress;
    await page.getByRole('button', { name: /Hint/ }).click();
    const hint = /row (\d+), column (\d+)/.exec(await textOf(page.locator('.lo-status')));
    assert.ok(hint, 'the hint names a row and a column');
    litBeforeLastPress = await page.locator('.jar[aria-pressed="true"]').evaluateAll((jars) => jars.map((jar) => `${jar.dataset.r},${jar.dataset.c}`));
    await page.locator(`.jar[data-r="${Number(hint[1]) - 1}"][data-c="${Number(hint[2]) - 1}"]`).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(30);
  }
  assert.fail('the puzzle was not solved by following the hints');
}

describe('Lights Out: the moment a puzzle is solved', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('2D: the freed fireflies fly out over the solved card, rise, and are gone afterwards', TIMEOUT, () => scenario(env, 'lights-out solved 2d', {}, async ({ page, site, touch }) => {
    await openGame(page, site, game);
    await switchView(page, '2d');
    await startRound(page, game, { mode: '2d', touch });
    const freed = await solveWithHints(page);

    const flights = page.locator('.firefly-flight');
    assert.ok(freed.length > 0, 'the last move freed at least one firefly');
    assert.equal(await flights.count(), freed.length, 'one flying firefly for each jar the last move emptied');
    assert.equal(await flights.first().evaluate((node) => getComputedStyle(node).animationName), 'drift', 'they fly with the drift animation');
    const { flight, card } = await page.evaluate(() => ({
      flight: Number(getComputedStyle(document.querySelector('.firefly-flight')).zIndex),
      card: Number(getComputedStyle(document.querySelector('.lo-solved')).zIndex),
    }));
    assert.ok(flight > card, 'they are drawn above the solved card, so the child sees them leave');

    // Sample inside the page, so the time between the two readings does not depend on the test machine.
    const path = await page.evaluate(() => new Promise((resolve) => {
      const firefly = document.querySelector('.firefly-flight');
      const first = firefly.getBoundingClientRect().y;
      setTimeout(() => resolve({ first, later: firefly.isConnected ? firefly.getBoundingClientRect().y : null }), 400);
    }));
    assert.ok(path.later !== null && path.later < path.first - 5, `they rise while flying (${path.first} then ${path.later})`);

    await eventually(async () => (await flights.count()) === 0, { timeout: 5_000, message: 'the fireflies to be gone once they have flown away' });
    assert.equal(await page.locator('.lo-solved:visible').count(), 1, 'the solved card is showing');
    assert.ok(await page.evaluate(() => document.activeElement?.closest('.lo-solved') !== null), 'and its button has the focus');
  }));

  it('2D with reduced motion: nothing flies, the solved card is there', TIMEOUT, () => scenario(env, 'lights-out solved reduced', { contextOptions: { reducedMotion: 'reduce' } }, async ({ page, site, touch }) => {
    await openGame(page, site, game);
    await switchView(page, '2d');
    await startRound(page, game, { mode: '2d', touch });
    await solveWithHints(page);
    assert.equal(await page.locator('.firefly-flight').count(), 0, 'no flying fireflies when the device asks for less motion');
    assert.equal(await page.locator('.lo-solved:visible').count(), 1, 'the solved card is showing');
  }));

  it('3D: the flat jars under the picture fly nothing, the picture does', TIMEOUT, () => scenario(env, 'lights-out solved 3d', {}, async ({ page, site, touch }) => {
    await openGame(page, site, game);
    await startRound(page, game, { mode: '3d', touch });
    await solveWithHints(page);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.firefly-flight').count(), 0, 'no flat fireflies drawn over the 3D picture');
    assert.equal(await page.locator('.lo-solved:visible').count(), 1, 'the solved card is showing');
  }));
});
