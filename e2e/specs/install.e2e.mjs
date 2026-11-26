// "Add to home screen" turns the site into an app icon on a child's tablet. Whether a browser offers it depends on the manifest, its
// icons, the service worker and the page all agreeing, and none of them breaks loudly when they do not. So ask Chromium itself, under the
// production headers, about the home page and about each game's page (a child may add whichever page they are on).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { GAMES, selectGames } from '../support/games.mjs';
import { gameUrl } from '../support/flow.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';

describe('the site can be installed as an app', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  /** What Chromium says stands in the way of installing the page it is showing (an empty list means nothing does). */
  async function installErrors(page) {
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    return installabilityErrors.map((error) => `${error.errorId} ${JSON.stringify(error.errorArguments)}`);
  }

  /** Opens a page with the real service worker (an installable app has one) and waits until it is active. */
  async function openWithWorker(page, url) {
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  }

  it('Chromium finds nothing in the way of installing the home page, and reads the manifest without complaint', () => scenario(env, 'install hub', { serviceWorkers: 'allow' }, async ({ page, site }) => {
    await openWithWorker(page, `${site.url}/`);
    await eventually(async () => (await installErrors(page)).length === 0, { timeout: 10_000, message: `the home page to be installable (${(await installErrors(page)).join(', ')})` });

    const cdp = await page.context().newCDPSession(page);
    const { url, data, errors } = await cdp.send('Page.getAppManifest');
    assert.deepEqual(errors, [], 'the manifest has no errors');
    assert.equal(url, `${site.url}/manifest.webmanifest`);
    const manifest = JSON.parse(data);
    assert.equal(manifest.display, 'standalone');
    assert.equal(new URL(manifest.start_url, url).href, `${site.url}/`, 'the app opens the home page');
  }));

  it('the manifest and every icon load, with the right types, under the production headers', () => scenario(env, 'install files', {}, async ({ site }) => {
    const manifestResponse = await fetch(`${site.url}/manifest.webmanifest`);
    assert.equal(manifestResponse.status, 200);
    assert.match(manifestResponse.headers.get('content-type'), /^application\/manifest\+json/);
    const manifest = await manifestResponse.json();
    for (const icon of manifest.icons) {
      const response = await fetch(new URL(icon.src, `${site.url}/`));
      assert.equal(response.status, 200, `${icon.src} loads`);
      assert.equal(response.headers.get('content-type'), icon.type, `${icon.src} is served as ${icon.type}`);
    }
    const touchIcon = await fetch(`${site.url}/icons/apple-touch-icon.png`);
    assert.equal(touchIcon.status, 200, 'the iOS home-screen icon loads');
  }));

  it('each game page can be installed too, because a child may add whichever page they are on', { timeout: 180_000 }, () => scenario(env, 'install games', { serviceWorkers: 'allow' }, async ({ page, context, site }) => {
    const problems = [];
    await openWithWorker(page, `${site.url}/`); // one visit installs the worker for the whole site
    for (const game of selectGames()) {
      // A fresh page for each game: the answer about a page can be left over from the one before it.
      const gamePage = await context.newPage();
      try {
        await gamePage.goto(gameUrl(site, game));
        await gamePage.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
        const cdp = await context.newCDPSession(gamePage);
        const { url, errors } = await cdp.send('Page.getAppManifest');
        if (url !== `${site.url}/manifest.webmanifest` || errors.length > 0) problems.push(`${game.title}: manifest "${url}" ${JSON.stringify(errors)}`);
        else await eventually(async () => (await installErrors(gamePage)).length === 0, { timeout: 8_000, message: 'installable' }).catch(async () => problems.push(`${game.title}: ${(await installErrors(gamePage)).join(', ')}`));
      } finally {
        await gamePage.close();
      }
    }
    assert.deepEqual(problems, [], `these pages cannot be installed (${GAMES.length} checked)`);
  }));
});
