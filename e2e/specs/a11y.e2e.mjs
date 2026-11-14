// Accessibility, checked in a real browser on the screens a child reaches first: the home page, each game's first screen and a round in
// progress, in 2D and in 3D, and the grown-ups' dialogs. Every screen has to pass axe (WCAG 2.0 to 2.2 A and AA plus best practices),
// show where the keyboard focus is, keep what has the focus in sight, and have no control smaller than 48px to tap (support/a11y.mjs).
//
// The last block checks the checks: each one is shown a page with the mistake it is there for and must find it.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MIN_TARGET, axeViolations, problemsOnScreen, showWholeScreen, smallTargets, tabStops } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { expectPicture, openGame, startRound, switchView } from '../support/flow.mjs';
import { selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { answerGrownUpCheck } from '../support/ui.mjs';

const TIMEOUT = { timeout: 180_000 };

/** Fails with every problem found on every screen at once, so one run says everything that needs fixing. */
function assertNoProblems(found) {
  const lines = found.flatMap(({ screen, problems }) => problems.map((problem) => `[${screen}] ${problem}`));
  assert.equal(lines.length, 0, `accessibility problems:\n${lines.join('\n')}`);
}

/**
 * Lets a screen finish appearing. A pop-in or a banner changes colours while it runs, which would fool the contrast check, so the animations
 * that end are waited for (not the endless ones, and not for more than a few seconds: a paused one never ends).
 */
async function settled(page, { threeD = false } = {}) {
  if (threeD) await expectPicture(page);
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map((animation) => animation.finished.catch(() => {}))),
    new Promise((done) => setTimeout(done, 3000)),
  ]));
  await page.waitForTimeout(300);
}

describe('accessibility of what a child reaches first', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('the home page', TIMEOUT, () => scenario(env, 'a11y hub', { screen: 'phone' }, async ({ page, site }) => {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    await settled(page);
    assertNoProblems([{ screen: 'home page', problems: await problemsOnScreen(page) }]);
  }));

  for (const game of selectGames()) {
    for (const mode of game.three ? ['3d', '2d'] : ['2d']) {
      it(`${game.title}, ${mode.toUpperCase()}: the first screen and a round, on a phone`, TIMEOUT, () => scenario(env, `a11y ${game.slug} ${mode}`, { screen: 'phone' }, async ({ page, site, touch }) => {
        await openGame(page, site, game);
        if (game.three && mode === '2d') await switchView(page, '2d');
        await settled(page, { threeD: mode === '3d' && game.three?.menu });
        const found = [{ screen: 'first screen', problems: await problemsOnScreen(page) }];

        await startRound(page, game, { mode, touch });
        await settled(page, { threeD: mode === '3d' && game.three?.round });
        found.push({ screen: 'round', problems: await problemsOnScreen(page) });
        assertNoProblems(found);
      }));
    }
  }
});

describe('accessibility on a desktop', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  // The layout changes with the width (three columns instead of two, a picture beside the controls), so a mistake can hide at one size.
  // Only the first screens: the rounds are laid out for a phone first, and the phone checks above go through all of them.
  it('the home page', TIMEOUT, () => scenario(env, 'a11y hub desktop', { screen: 'desktop' }, async ({ page, site }) => {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    await settled(page);
    assertNoProblems([{ screen: 'home page', problems: await problemsOnScreen(page) }]);
  }));

  for (const game of selectGames()) {
    it(`${game.title}: the first screen`, TIMEOUT, () => scenario(env, `a11y ${game.slug} desktop`, { screen: 'desktop' }, async ({ page, site }) => {
      await openGame(page, site, game);
      await settled(page, { threeD: game.three?.menu });
      assertNoProblems([{ screen: 'first screen', problems: await problemsOnScreen(page) }]);
    }));
  }
});

describe('the grown-ups dialogs', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  /** The focus is inside the dialog that is open (a modal dialog traps it there). */
  const focusIsInDialog = (page) => page.evaluate(() => document.querySelector('dialog[open]')?.contains(document.activeElement) ?? false);

  /**
   * The gear opens the grown-ups' check, then the settings. Each is axe-clean, takes the keyboard focus, and Escape closes it and gives
   * the focus back to the gear.
   */
  async function checkDialogs(page, where) {
    const found = [];
    const gear = page.getByRole('button', { name: 'Grown-ups settings' });

    await gear.click();
    await page.locator('dialog[open]').waitFor();
    assert.ok(await focusIsInDialog(page), `${where}: the focus moves into the grown-ups' check`);
    found.push({ screen: `${where}: grown-ups check`, problems: await problemsOnScreen(page) });
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Grown-ups settings', `${where}: Escape gives the focus back to the gear`);

    await gear.click();
    await answerGrownUpCheck(page);
    await page.getByRole('heading', { name: 'Grown-ups settings', level: 2 }).waitFor();
    assert.ok(await focusIsInDialog(page), `${where}: the focus moves into the settings`);
    found.push({ screen: `${where}: settings`, problems: await problemsOnScreen(page) });
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    return found;
  }

  it('on the home page', TIMEOUT, () => scenario(env, 'a11y dialogs hub', { screen: 'phone' }, async ({ page, site }) => {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    assertNoProblems(await checkDialogs(page, 'home page'));
  }));

  for (const game of selectGames().filter((g) => ['shop-keeper', 'times-table-racing'].includes(g.slug))) {
    it(`in ${game.title}`, TIMEOUT, () => scenario(env, `a11y dialogs ${game.slug}`, { screen: 'phone' }, async ({ page, site }) => {
      await openGame(page, site, game);
      await settled(page, { threeD: game.three?.menu });
      assertNoProblems(await checkDialogs(page, game.title));
    }));
  }
});

describe('the accessibility checks themselves', () => {
  /** @type {import('playwright').Browser} */ let browser;
  /** @type {import('playwright').BrowserContext} */ let context;

  before(async () => {
    browser = await launchBrowser();
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  });
  after(async () => {
    await context?.close();
    await browser?.close();
  });

  /** A page made of `body`, with the styles the real pages share (a visible focus ring unless the page's own CSS says otherwise). */
  async function pageWith(body, css = '') {
    const page = await context.newPage();
    // The viewport meta matters: without it a phone lays the page out 980px wide and zooms out, and nothing is the size it looks.
    await page.setContent(`<!doctype html><html lang="en"><head><title>Test</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      body { margin: 0; font: 20px sans-serif; color: #1f2544; background: #fff; }
      .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
      ${css}
    </style></head><body><main>${body}</main></body></html>`);
    return page;
  }

  const ids = (violations) => violations.map((violation) => violation.id);

  it('axe finds a control with no name and a picture with no description', async () => {
    const page = await pageWith('<h1>Page</h1><button class="empty"></button><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">');
    const found = ids(await axeViolations(page));
    assert.ok(found.includes('button-name'), `a button with no name is reported (found: ${found})`);
    assert.ok(found.includes('image-alt'), `an image with no description is reported (found: ${found})`);
    await page.close();
  });

  it('a button whose name leaves out the words on it is found, even far below the fold', async () => {
    // The frame of a game page (ui.css): the page is as tall as the window and clips what lies beyond it, with the screen scrolling inside.
    // axe treats what the clip hides as not visible, so a mistake below the fold passes unless the window is made tall.
    const page = await pageWith(
      '<div class="game-root"><div class="scene"><div style="height:1500px;flex:none"></div><button style="min-height:48px;flex:none" aria-label="Go">Start the game</button></div></div>',
      `body { height: 100dvh; overflow: hidden; }
       main { height: 100%; }
       .game-root { position: relative; width: 100%; height: 100%; overflow: hidden; }
       .scene { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: auto; }`,
    );
    assert.ok(!ids(await axeViolations(page)).includes('label-content-name-mismatch'), 'in the window as it is, the button is out of sight, so axe says nothing');
    const restore = await showWholeScreen(page);
    try {
      assert.ok(ids(await axeViolations(page)).includes('label-content-name-mismatch'), 'once the whole screen is showing, the mismatch is reported');
    } finally {
      await restore();
    }
    assert.deepEqual(page.viewportSize(), { width: 390, height: 844 }, 'the window is put back as it was');
    await page.close();
  });

  it('the keyboard walk finds a control whose focus cannot be seen, and one that is hidden', async () => {
    const page = await pageWith(`
      <h1>Page</h1>
      <button class="fine">Fine</button>
      <button class="flat">No ring</button>
      <a class="skip sr-only" href="#x">Skip (never shown)</a>
      <a class="skip shown" href="#x">Skip (shown on focus)</a>
      <div class="stack"><button class="under">Under a picture</button><div class="picture"></div></div>
      <div class="stack"><button class="through">Over a picture, taps let through</button></div>
      <div class="picture-over" style="pointer-events:none"></div>
      <span id="x"></span>`,
    `.flat { outline: none; box-shadow: none; }
     :focus-visible { outline: 4px solid #1f2544; outline-offset: 2px; }
     .flat:focus-visible { outline: none; }
     .shown { position: absolute; top: -200px; left: 0; } .shown:focus { top: 0; }
     .stack { position: relative; height: 60px; }
     .under { position: absolute; left: 0; top: 0; width: 200px; height: 48px; }
     .picture { position: absolute; left: 0; top: 0; width: 200px; height: 48px; background: #cde; }
     .through { position: absolute; left: 0; top: 0; width: 240px; height: 48px; }
     .picture-over { position: absolute; left: 0; top: 350px; width: 240px; height: 48px; }`);
    const stops = await tabStops(page);
    const byName = (name) => stops.find((stop) => stop.name.startsWith(name));
    assert.equal(byName('Fine').indicator, true, 'a control with the ring has an indicator');
    assert.equal(byName('No ring').indicator, false, 'a control with its ring switched off has none');
    assert.equal(byName('Skip (never shown)').hidden, true, 'a link kept at one pixel cannot be seen when it has the focus');
    assert.equal(byName('Skip (shown on focus)').hidden, false, 'a skip link that appears when it has the focus is fine');
    assert.equal(byName('Under a picture').hidden, true, 'a control under a picture cannot be seen');
    assert.equal(byName('Fine').hidden, false);
    await page.close();
  });

  it('a control laid over a picture that lets taps through counts as seen, one under it does not', async () => {
    const page = await pageWith(`
      <h1>Page</h1>
      <div class="board"><canvas width="300" height="120"></canvas>
        <div class="overlay"><button class="pad">Over</button></div>
        <button class="buried">Buried</button>
      </div>`,
    `.board { position: relative; width: 300px; height: 120px; }
     canvas { position: absolute; inset: 0; }
     .overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
     .pad { position: absolute; left: 0; top: 0; width: 120px; height: 48px; pointer-events: none; }
     .buried { position: absolute; left: 150px; top: 0; width: 120px; height: 48px; z-index: 0; }
     canvas { z-index: 1; }`);
    const stops = await tabStops(page);
    assert.equal(stops.find((stop) => stop.name === 'Over').hidden, false, 'painted above the picture, so its ring shows');
    assert.equal(stops.find((stop) => stop.name === 'Buried').hidden, true, 'painted under the picture, so its ring is lost');
    await page.close();
  });

  it('the size check finds a small control and leaves out what a finger cannot hit', async () => {
    const page = await pageWith(`
      <h1>Page</h1>
      <button class="small" style="width:30px;height:30px">S</button>
      <button class="big" style="width:60px;height:60px">B</button>
      <label class="wide" style="display:block;min-height:56px;padding:12px"><input type="checkbox"> Peek at all cards</label>
      <button disabled style="width:20px;height:20px">D</button>
      <button hidden style="width:20px;height:20px">H</button>
      <button class="sr-only">Keeps for screen readers</button>
      <div style="position:relative;height:60px"><button style="position:absolute;left:0;top:0;width:20px;height:20px">Covered</button><div style="position:absolute;left:0;top:0;width:100px;height:60px;background:#cde"></div></div>`);
    const small = await smallTargets(page);
    assert.deepEqual(small.map((target) => target.name), ['S'], `only the 30px button is too small (found: ${JSON.stringify(small)})`);
    assert.ok(MIN_TARGET >= 48, 'the limit is the site\'s 48px, not the 24px WCAG minimum');
    await page.close();
  });
});
