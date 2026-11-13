// The other checks are only worth something while the harness under them really notices problems. These make sure it does:
// that errors, bad responses and policy violations are caught, that a blank 3D canvas is told from a picture, and that
// the pages are served with the headers production sends.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { productionHeaders } from '../support/headers.mjs';
import { watchPage } from '../support/log.mjs';
import { looksDrawn, measureCanvas } from '../support/pixels.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';

describe('the browser test harness', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  /** A fresh page on the home page, watched. */
  async function watched(options) {
    const context = await env.browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const log = watchPage(page, options);
    await page.goto(`${env.site.url}/`);
    return { context, page, log };
  }

  it('serves every page with the security headers production sends', async () => {
    const headers = productionHeaders();
    assert.match(headers['Content-Security-Policy'], /script-src 'self'/);
    for (const path of ['/', '/src/games/lights-out/index.html']) {
      const response = await fetch(`${env.site.url}${path}`);
      for (const [name, value] of Object.entries(headers)) {
        assert.equal(response.headers.get(name), value, `${name} on ${path}`);
      }
    }
  });

  const problems = [
    ['a console error', () => console.error('boom'), /boom/],
    ['an uncaught error', () => setTimeout(() => { throw new Error('late'); }), /late/],
    ['a missing file', () => fetch('/no-such-file.js'), /404/],
    ['a script the Content Security Policy forbids', () => {
      const script = document.createElement('script');
      script.textContent = 'window.sneaked = true';
      document.head.append(script);
    }, /Content Security Policy/],
  ];
  for (const [name, cause, pattern] of problems) {
    it(`fails a check when the page shows ${name}`, async () => {
      const { context, page, log } = await watched();
      try {
        await page.evaluate(cause);
        await eventually(() => log.unexpected.length > 0, { timeout: 5_000, message: `${name} to be noticed` });
        assert.match(log.unexpected.join('\n'), pattern);
        assert.throws(() => log.assertClean(), /the page reported problems/);
      } finally {
        await context.close();
      }
    });
  }

  it('lets a check expect the failure it causes on purpose, and only that one', async () => {
    const { context, page, log } = await watched({ expected: [/boom/] });
    try {
      await page.evaluate(() => console.error('boom'));
      await eventually(() => log.sawExpected(/boom/), { timeout: 5_000, message: 'the expected message to be seen' });
      log.assertClean();
      await page.evaluate(() => console.error('something else'));
      await eventually(() => log.unexpected.length === 1, { timeout: 5_000, message: 'the surprise to be noticed' });
    } finally {
      await context.close();
    }
  });

  it('tells a picture from a blank canvas', async () => {
    const context = await env.browser.newContext();
    const page = await context.newPage();
    try {
      await page.setContent(`
        <canvas id="blank" width="300" height="200"></canvas>
        <canvas id="picture" width="300" height="200"></canvas>
        <script>
          const blank = document.getElementById('blank').getContext('2d');
          blank.fillStyle = '#112233'; blank.fillRect(0, 0, 300, 200);
          const picture = document.getElementById('picture').getContext('2d');
          const sky = picture.createLinearGradient(0, 0, 0, 200);
          sky.addColorStop(0, '#102050'); sky.addColorStop(1, '#a0c0ff');
          picture.fillStyle = sky; picture.fillRect(0, 0, 300, 200);
          picture.fillStyle = '#ffcc33'; picture.beginPath(); picture.arc(150, 100, 60, 0, 7); picture.fill();
        </script>`);
      assert.equal(looksDrawn(await measureCanvas(page, '#blank')), false, 'one flat colour is not a picture');
      assert.equal(looksDrawn(await measureCanvas(page, '#picture')), true, 'a gradient with a shape is');
    } finally {
      await context.close();
    }
  });
});
