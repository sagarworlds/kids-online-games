// The home page is where every visit starts: every game must be reachable from it and bring the child back. The list of
// games these checks know about (e2e/support/games.mjs) must also stay in step with the real one, so a new game cannot
// ship without its browser checks.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { GAMES as REGISTRY } from '../../src/hub/gamesRegistry.js';
import { launchBrowser } from '../support/browser.mjs';
import { GAMES } from '../support/games.mjs';
import { REPO } from '../support/headers.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { fitsWidth } from '../support/ui.mjs';

const available = REGISTRY.filter((game) => game.available);

describe('the games the browser checks know about', () => {
  it('are exactly the games on the home page, in the same order', () => {
    assert.deepEqual(GAMES.map((g) => g.slug), available.map((g) => g.slug),
      'add a game to e2e/support/games.mjs when it joins the registry (and remove it when it leaves)');
  });

  it('say whether a game has a 3D version exactly when it has one', () => {
    for (const game of GAMES) {
      const has3dFolder = existsSync(resolve(REPO, 'src/games', game.slug, 'three'));
      assert.equal(game.three !== null, has3dFolder, `${game.slug}: e2e/support/games.mjs ${game.three ? 'lists' : 'omits'} a 3D version, but src/games/${game.slug}/three/ ${has3dFolder ? 'exists' : 'does not'}`);
    }
  });
});

describe('the home page', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('shows a card for every game, and each card opens its game and the game\'s Home button comes back', { timeout: 300_000 }, () => scenario(env, 'hub cards', {}, async ({ page, site }) => {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    assert.equal(await page.locator('a.card').count(), available.length, 'one card per game');

    for (const game of GAMES) {
      const card = page.locator('a.card', { hasText: game.title });
      assert.equal(await card.count(), 1, `one card for ${game.title}`);
      await card.click();
      await page.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
      assert.match(page.url(), new RegExp(`/src/games/${game.slug}/`), `${game.title}'s card opens its page`);
      await page.getByRole('link', { name: 'Home' }).click();
      await page.locator('.hub__greeting').waitFor();
    }
  }));

  it('fits a small phone', () => scenario(env, 'hub phone', { screen: 'smallPhone' }, async ({ page, site }) => {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    assert.ok(await fitsWidth(page), 'the home page does not scroll sideways on a 360px phone');
  }));
});
