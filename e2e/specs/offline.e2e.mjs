// "Works offline" is a promise to families with patchy connections, and it is easy to break quietly: forget one file in the build and a game
// fails only for a child on a train. The site no longer downloads everything on the first visit (about 8 MB, to people who may open two
// games): the worker stores the home page and the shared engine, and saves each game, whole, the first time it is opened. So these check
// the whole story with the real service worker: a small first visit, a complete saved game, and playing it with the network cut.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launchBrowser, quietFrameWatch } from '../support/browser.mjs';
import { expectPicture, gameUrl, openGame, startRound } from '../support/flow.mjs';
import { selectGames } from '../support/games.mjs';
import { REPO } from '../support/headers.mjs';
import { watchPage } from '../support/log.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';

const TIMEOUT = { timeout: 240_000 };

/** Every file the build told the worker it may store, read from the built worker (the same list the worker sorts into core and games). */
function builtFiles() {
  const worker = readFileSync(resolve(REPO, 'dist/sw.js'), 'utf8');
  const match = /^const FILES = (\[.*\]);$/m.exec(worker);
  assert.ok(match, 'dist/sw.js has the list of files the build fills in');
  return JSON.parse(match[1]);
}

/** What the worker stores at install: everything except the games and the 3D library (the same rule as in sw.js). */
const isCore = (file) => !file.startsWith('src/games/') && !file.startsWith('src/vendor/');

/** The files the worker has stored so far, as paths relative to the site (the form of the build's list). */
async function savedFiles(page) {
  return new Set(await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('kidsgames-'));
    const saved = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) saved.push(new URL(request.url).pathname.replace(/^\//, '') || './');
    }
    return saved;
  }));
}

describe('the site works offline, and saves each game the first time it is opened', () => {
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
    // `ready` resolves once the worker is active, which is after it has stored what it stores at install.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.close();
    log.assertClean();
  });
  after(async () => {
    await context?.close();
    await env.browser?.close();
    await env.site?.close();
  });

  it('the first visit stores only the home page and the shared engine, a small part of the site', async () => {
    const files = builtFiles();
    const core = files.filter(isCore);
    assert.ok(files.length > 300, `the build lists the whole site (${files.length} files)`);
    assert.ok(core.length < files.length / 5, `the core is a small part of it (${core.length} of ${files.length} files)`);
    const page = await context.newPage();
    try {
      await page.goto(`${env.site.url}/`); // the cache is only reachable from a page of the site (a blank tab has none)
      const saved = await savedFiles(page);
      assert.deepEqual([...saved].filter((file) => !isCore(file)), [], 'no game and no 3D library yet');
      assert.deepEqual(core.filter((file) => !saved.has(file)), [], 'every core file is stored');
      const names = await page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('kidsgames-')));
      assert.equal(names.length, 1, 'one cache for this version of the site');
      assert.ok(!names[0].endsWith('-dev'), 'the production worker, not the development one that does nothing');
    } finally {
      await page.close();
    }
  });

  it('the home page opens with no network', () => scenario(env, 'offline hub', { context }, async ({ page, site }) => {
    await context.setOffline(true);
    try {
      await page.goto(`${site.url}/`);
      await page.locator('.hub__greeting').waitFor();
      assert.ok((await page.locator('a.card').count()) > 0, 'the game cards are there');
    } finally {
      await context.setOffline(false);
    }
  }));

  it('a game that was never saved sends the child home with a note, instead of a broken page', () => scenario(env, 'offline unsaved', { context }, async ({ page, site }) => {
    const [game] = selectGames();
    await context.setOffline(true);
    try {
      await page.goto(gameUrl(site, game));
      await page.locator('.hub__greeting').waitFor();
      assert.match(await page.locator('.toast').textContent(), new RegExp(`${game.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is not saved for offline play yet`));
      assert.equal(new URL(page.url()).search, '', 'the address is tidied, so a refresh does not say it again');
    } finally {
      await context.setOffline(false);
    }
  }));

  for (const game of selectGames()) {
    it(`${game.title}: saved whole the first time it is opened, then plays with no network`, TIMEOUT, async () => {
      const wanted = builtFiles().filter((file) => file.startsWith(`src/games/${game.slug}/`));
      const mode = game.three ? '3d' : '2d';

      // Online: open it as a child would (the page itself comes from the network), and play a moment, so a 3D game loads the 3D library.
      await scenario(env, `save ${game.slug}`, { context }, async ({ page, site, touch }) => {
        await openGame(page, site, game);
        if (game.three?.menu) await expectPicture(page);
        await startRound(page, game, { mode, touch });
        if (game.three?.round) await expectPicture(page);
        // The worker saves the rest of the game in the background; its page goes in last, so a stored page means a complete game.
        await eventually(async () => (await savedFiles(page)).has(`src/games/${game.slug}/index.html`), { timeout: 60_000, message: 'the game to be saved' });
        const saved = await savedFiles(page);
        assert.deepEqual(wanted.filter((file) => !saved.has(file)), [], `every file of ${game.title} is stored (flags, words, levels and 3D files included, not only what was on screen)`);
      });

      // Offline: the whole thing again from the stored copy.
      await context.setOffline(true);
      try {
        await scenario(env, `offline ${game.slug}`, { context }, async ({ page, site, touch }) => {
          await openGame(page, site, game);
          if (game.three?.menu) await expectPicture(page);
          await startRound(page, game, { mode, touch });
          if (game.three?.round) await expectPicture(page); // the three.js files came from the cache too
          await game.act(page, { mode, touch });
        });
      } finally {
        await context.setOffline(false);
      }
    });
  }
});
