// Some families want every game on the tablet before a trip, not one game at a time. A grown-up can ask for that in the settings: "Save all
// games for offline play". These check it end to end with the real service worker: through the grown-ups' check, the progress, the
// result, and then every game (3D ones too) playing with the network cut. And that a game with a file that cannot be downloaded is not
// claimed to work offline.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launchBrowser, quietFrameWatch } from '../support/browser.mjs';
import { expectPicture, gameUrl, openGame, startRound } from '../support/flow.mjs';
import { GAMES, selectGames } from '../support/games.mjs';
import { REPO } from '../support/headers.mjs';
import { watchPage } from '../support/log.mjs';
import { startSite } from '../support/site.mjs';
import { answerGrownUpCheck, eventually } from '../support/ui.mjs';

const TIMEOUT = { timeout: 300_000 };
const TOTAL = GAMES.length;

/** Every file the build told the worker it may store. */
function builtFiles(root = resolve(REPO, 'dist')) {
  const match = /^const FILES = (\[.*\]);$/m.exec(readFileSync(resolve(root, 'sw.js'), 'utf8'));
  assert.ok(match, 'sw.js has the list of files');
  return JSON.parse(match[1]);
}

/** The files the worker has stored so far, as paths relative to the site. */
async function savedFiles(page) {
  return new Set(await page.evaluate(async () => {
    const saved = [];
    for (const name of (await caches.keys()).filter((n) => n.startsWith('kidsgames-'))) {
      for (const request of await (await caches.open(name)).keys()) saved.push(new URL(request.url).pathname.replace(/^\//, '') || './');
    }
    return saved;
  }));
}

/** Opens the grown-ups' settings from the home page, answering the grown-ups' check (a times-table question) correctly. */
async function openGrownUpSettings(page) {
  await page.getByRole('button', { name: 'Grown-ups settings' }).click();
  await answerGrownUpCheck(page);
  await page.getByRole('heading', { name: 'Offline play' }).waitFor();
}

describe('a grown-up can save every game for offline play', () => {
  /** @type {import('playwright').Browser} */ let browser;
  const sites = [];

  /** A site to test on; `without` names a built file to remove from a private copy, so downloading it fails with a 404. */
  async function siteWithout(without = null) {
    let root;
    if (without) {
      root = mkdtempSync(join(tmpdir(), 'kg-site-'));
      cpSync(resolve(REPO, 'dist'), root, { recursive: true });
      rmSync(join(root, without));
    }
    const site = await startSite(root ? { root } : {});
    sites.push({ site, root });
    return site;
  }

  before(async () => {
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    for (const { site, root } of sites) {
      await site.close();
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  /** A browser context with the real service worker, on a home page that has finished installing it. */
  async function visit(site) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
    await quietFrameWatch(context);
    const page = await context.newPage();
    const log = watchPage(page, { expected: [/offline|Failed to load resource/i] });
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    return { context, page, log };
  }

  it('the button saves every game, the settings then say so, and every game plays with no network', TIMEOUT, async () => {
    const site = await siteWithout();
    const { context, page, log } = await visit(site);
    try {
      await openGrownUpSettings(page);
      const status = page.locator('.offline__status');
      await eventually(async () => /^0 of \d+ games are saved for offline play\./.test(await status.textContent()), { timeout: 10_000, message: 'the settings to say nothing is saved yet' });
      assert.match(await status.textContent(), /Each game is also saved the first time it is opened while online/);

      await page.getByRole('button', { name: /Save all games for offline play/ }).click();
      await eventually(async () => /^All \d+ games are saved for offline play\.$/.test((await status.textContent()).trim()), { timeout: 120_000, interval: 250, message: 'everything to be saved' });
      assert.equal(await page.getByRole('button', { name: /Save all games for offline play/ }).count() === 0 || !(await page.getByRole('button', { name: /Save all games for offline play/ }).isVisible()), true, 'nothing is left to save, so the button goes away');

      const saved = await savedFiles(page);
      assert.deepEqual(builtFiles().filter((file) => !saved.has(file)), [], 'every file of the site is stored, the 3D library included');

      // Reopened, the settings still say so.
      await page.getByRole('button', { name: 'Done' }).click();
      await openGrownUpSettings(page);
      await eventually(async () => (await page.locator('.offline__status').textContent()).includes(`All ${TOTAL} games are saved`), { timeout: 10_000, message: 'the reopened settings to say all games are saved' });
      await page.getByRole('button', { name: 'Done' }).click();

      // The network goes away: every game opens and plays, and the 3D ones really draw (their library came from the cache).
      await context.setOffline(true);
      const problems = [];
      for (const game of selectGames()) {
        const gamePage = await context.newPage();
        const gameLog = watchPage(gamePage);
        try {
          const mode = game.three ? '3d' : '2d';
          await openGame(gamePage, site, game);
          if (game.three?.menu) await expectPicture(gamePage);
          await startRound(gamePage, game, { mode, touch: false });
          if (game.three?.round) await expectPicture(gamePage);
          await game.act(gamePage, { mode, touch: false });
          gameLog.assertClean();
        } catch (error) {
          problems.push(`${game.title}: ${String(error.message).split('\n')[0]}`);
        } finally {
          await gamePage.close();
        }
      }
      assert.deepEqual(problems, [], 'every game works offline after "save all"');
      void log;
    } finally {
      await context.close();
    }
  });

  it('a game with a file that cannot be downloaded is not claimed saved, the others are, and the grown-up is told', TIMEOUT, async () => {
    const broken = GAMES.find((g) => g.slug === 'robot-path');
    const fine = GAMES.find((g) => g.slug === 'lights-out');
    const site = await siteWithout('src/games/robot-path/data/levels.json'); // the build lists it, the server answers 404
    const { context, page } = await visit(site);
    try {
      await openGrownUpSettings(page);
      await page.getByRole('button', { name: /Save all games for offline play/ }).click();
      const status = page.locator('.offline__status');
      await eventually(async () => /Some games could not be saved/.test(await status.textContent()), { timeout: 120_000, interval: 250, message: 'the grown-up to be told something could not be saved' });
      assert.match(await status.textContent(), new RegExp(`${TOTAL - 1} of ${TOTAL} games are saved`), 'one game short');
      assert.ok(await page.getByRole('button', { name: /Save all games for offline play/ }).isVisible(), 'and the button is there to try again');
      await page.getByRole('button', { name: 'Done' }).click();

      const saved = await savedFiles(page);
      assert.ok(saved.has(`src/games/${fine.slug}/index.html`), 'a game that arrived whole is saved');
      assert.ok(!saved.has(`src/games/${broken.slug}/index.html`), 'the game with a missing file is not claimed to work offline');

      // Offline, the saved game plays and the broken one sends the child home with a note instead of a broken page.
      await context.setOffline(true);
      const gamePage = await context.newPage();
      try {
        await openGame(gamePage, site, fine);
        await startRound(gamePage, fine, { mode: '3d', touch: false });
        await gamePage.goto(gameUrl(site, broken));
        await gamePage.locator('.hub__greeting').waitFor();
        assert.match(await gamePage.locator('.toast').textContent(), /Robot Path is not saved for offline play yet/);
      } finally {
        await gamePage.close();
      }
    } finally {
      await context.close();
    }
  });
});
