// "Works offline after the first visit" is a promise to families with patchy connections. It is also easy to break quietly:
// forget one file in the build and a game fails only for a child on a train. So: visit once with the real service worker, cut
// the network, and play every game, 3D ones included.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launchBrowser, quietFrameWatch } from '../support/browser.mjs';
import { expectPicture, openGame, startRound } from '../support/flow.mjs';
import { selectGames } from '../support/games.mjs';
import { REPO } from '../support/headers.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { watchPage } from '../support/log.mjs';

const TIMEOUT = { timeout: 240_000 };

/** The list of files the build told the service worker to store, read from the built worker. */
function builtPrecacheList() {
  const worker = readFileSync(resolve(REPO, 'dist/sw.js'), 'utf8');
  const match = /const PRECACHE = (\[.*?\]);/s.exec(worker);
  assert.ok(match, 'dist/sw.js has the precache list the build fills in');
  return JSON.parse(match[1]);
}

describe('after one visit the whole site works with no network', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});
  /** @type {import('playwright').BrowserContext} */ let context;

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
    context = await env.browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
    await quietFrameWatch(context);
    const page = await context.newPage();
    const log = watchPage(page);
    await page.goto(`${env.site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    // `ready` resolves once the worker is active, which is after it has stored every file (the install waits for that).
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.close();
    log.assertClean();
    await context.setOffline(true);
  });
  after(async () => {
    await context?.close();
    await env.browser?.close();
    await env.site?.close();
  });

  it('the service worker stored every file the build listed', async () => {
    const wanted = builtPrecacheList();
    assert.ok(wanted.length > 300, `the build lists the whole site (${wanted.length} files)`);
    const page = await context.newPage();
    try {
      await page.goto(`${env.site.url}/`); // the cache is only reachable from a page of the site (a blank tab has none)
      const stored = await page.evaluate(async () => {
        const names = (await caches.keys()).filter((name) => name.startsWith('kidsgames-'));
        const cache = await caches.open(names[0]);
        return { names, count: (await cache.keys()).length };
      });
      assert.equal(stored.names.length, 1, 'one cache for this version of the site');
      assert.ok(!stored.names[0].endsWith('-dev'), 'the production worker, not the development one that does nothing');
      assert.equal(stored.count, wanted.length);
    } finally {
      await page.close();
    }
  });

  it('the home page opens', () => scenario(env, 'offline hub', { context }, async ({ page, site }) => {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    assert.ok((await page.locator('a.card').count()) > 0, 'the game cards are there');
  }));

  for (const game of selectGames()) {
    it(`${game.title} opens, starts and takes a first move`, TIMEOUT, () => scenario(env, `offline ${game.slug}`, { context }, async ({ page, site, touch }) => {
      const mode = game.three ? '3d' : '2d';
      await openGame(page, site, game);
      if (game.three?.menu) await expectPicture(page);
      await startRound(page, game, { mode, touch });
      if (game.three?.round) await expectPicture(page); // the three.js files came from the cache too
      await game.act(page, { mode, touch });
    }));
  }
});
