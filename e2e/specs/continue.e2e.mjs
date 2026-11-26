// The home page offers to carry on with the game the child was last playing: a "Continue where you left off" card above the games, and only when
// there is such a game. A visitor who has not played, a game that was only opened and left, a reset, and a record the page does not trust all
// show no card. The checks follow what a child does (open a game, play, press Home) rather than writing the record by hand, apart from the
// ones about a record that should never be there.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { openGame, startRound } from '../support/flow.mjs';
import { GAMES } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { answerGrownUpCheck, button, eventually } from '../support/ui.mjs';

const TIMEOUT = { timeout: 120_000 };
const KEY = 'kidsgames:last-played';
const SHOP = GAMES.find((game) => game.slug === 'shop-keeper');
const PIZZA = GAMES.find((game) => game.slug === 'pizza-fractions');

/** The card, its link and its heading on the home page. */
const card = (page) => page.locator('section.hub__resume');
const cardLink = (page) => page.locator('a.resume');

/** Opens the home page and waits until it has drawn (the card is drawn with it, not later). */
async function openHub(page, site) {
  await page.goto(`${site.url}/`);
  await page.locator('.hub__greeting').waitFor();
}

/** Plays a game as far as starting a round, then goes home with the game's Home link, as a child does. */
async function playThenGoHome(page, site, game, touch) {
  await openGame(page, site, game);
  await startRound(page, game, { mode: '2d', touch });
  await page.getByRole('link', { name: 'Home' }).click();
  await page.locator('.hub__greeting').waitFor();
}

/** Puts a record in storage before any page script runs (only if there is none, so a record the game writes is not undone on the next load). */
const seeded = (raw) => (context) => context.addInitScript(([key, value]) => {
  try {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  } catch {
    // Storage is blocked: there is then nothing to show either, which is what the check wants to see.
  }
}, [KEY, raw]);

describe('the "Continue where you left off" card on the home page', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    // No WebGL: every game opens its flat screens at once, which is all these checks need and is the lightest way to play a round.
    env.browser = await launchBrowser({ webgl: false });
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('is not there for a visitor who has not played, and the games are all still there', () => scenario(env, 'continue fresh', {}, async ({ page, site }) => {
    await openHub(page, site);
    assert.equal(await card(page).count(), 0, 'no card');
    assert.equal(await page.getByRole('heading', { name: 'Continue where you left off' }).count(), 0, 'and no heading for it');
    assert.equal(await page.locator('a.card').count(), GAMES.length, 'one card for each game, as before');
  }));

  it('is not there when a game was only opened and left at once (a wrong tap must not replace the game being played)', TIMEOUT, () => scenario(env, 'continue stray open', {}, async ({ page, site }) => {
    await openGame(page, site, SHOP);
    await page.getByRole('link', { name: 'Home' }).click();
    await page.locator('.hub__greeting').waitFor();
    assert.equal(await card(page).count(), 0, 'nothing was played, so there is nothing to continue');
  }));

  it('names the game played last, opens it, and follows the next game the child plays', TIMEOUT, () => scenario(env, 'continue names the game', {}, async ({ page, site, touch }) => {
    await playThenGoHome(page, site, SHOP, touch);
    await cardLink(page).waitFor();
    assert.equal(await card(page).count(), 1, 'one card');
    assert.equal(await card(page).getByRole('heading', { name: 'Continue where you left off', level: 2 }).count(), 1, 'under a level-two heading');
    assert.equal(await page.getByRole('link', { name: 'Continue Shop Keeper' }).count(), 1, 'a link that says what it opens');
    assert.match(await cardLink(page).getAttribute('href'), /^src\/games\/shop-keeper\/index\.html$/, 'to that game\'s own page');
    assert.equal(await page.locator('a.card').count(), GAMES.length, 'the games below are all still there, and the card is not one of them');

    await cardLink(page).click();
    await page.locator(SHOP.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
    assert.match(page.url(), /\/src\/games\/shop-keeper\//, 'the card opens the game');
    await page.getByRole('link', { name: 'Home' }).click();
    await page.locator('.hub__greeting').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Continue Shop Keeper' }).count(), 1, 'opening the game again from the card does not lose it');

    await page.locator('a.card', { hasText: PIZZA.title }).click();
    await page.locator(PIZZA.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
    await startRound(page, PIZZA, { mode: '2d', touch });
    await page.getByRole('link', { name: 'Home' }).click();
    await page.locator('.hub__greeting').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Continue Pizza Fractions' }).count(), 1, 'the card follows the game played last');
    assert.equal(await card(page).count(), 1, 'and there is still just one');
  }));

  it('stays when a subject is chosen, and is not one of the cards the subject filters', TIMEOUT, () => scenario(env, 'continue subject chip', { prepare: seeded(JSON.stringify({ version: 1, slug: 'shop-keeper', at: 1 })) }, async ({ page, site }) => {
    await openHub(page, site);
    await cardLink(page).waitFor();
    const before = await card(page).elementHandle();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    assert.equal(await page.locator('.hub__sections h2').count(), 1, 'the games show only the chosen subject');
    assert.equal(await card(page).count(), 1, 'the card is still there');
    assert.equal(await card(page).evaluate((node, old) => node === old, before), true, 'and it is the same element, not one drawn again');
  }));

  it('keeps the keyboard focus when the page refreshes itself (it does on coming back and when another tab saves)', TIMEOUT, () => scenario(env, 'continue keeps focus', { prepare: seeded(JSON.stringify({ version: 1, slug: 'shop-keeper', at: 1 })) }, async ({ page, site }) => {
    await openHub(page, site);
    await cardLink(page).focus();
    await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('resume')), true, 'the link still has the focus');
  }));

  it('changes by itself when another tab plays a different game', TIMEOUT, () => scenario(env, 'continue other tab', { prepare: seeded(JSON.stringify({ version: 1, slug: 'shop-keeper', at: 1 })) }, async ({ page, context, site, touch }) => {
    await openHub(page, site);
    await page.getByRole('link', { name: 'Continue Shop Keeper' }).waitFor();

    const other = await context.newPage();
    await openGame(other, site, PIZZA);
    await startRound(other, PIZZA, { mode: '2d', touch });
    await eventually(async () => (await page.getByRole('link', { name: 'Continue Pizza Fractions' }).count()) === 1, { message: 'the home page to follow the other tab' });
    assert.equal(await card(page).count(), 1, 'still one card');
    await other.close();
  }));

  it('goes when the grown-ups reset all progress', TIMEOUT, () => scenario(env, 'continue reset', { prepare: seeded(JSON.stringify({ version: 1, slug: 'shop-keeper', at: 1 })) }, async ({ page, site }) => {
    await openHub(page, site);
    await cardLink(page).waitFor();

    await button(page, 'Grown-ups settings').click();
    await answerGrownUpCheck(page);
    await button(page, 'Reset all progress').click();
    await button(page, 'Yes, reset').click();
    await page.getByText('Progress cleared.').waitFor();
    assert.equal(await card(page).count(), 0, 'nothing is left to continue');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEY), null, 'and the record is gone from storage');
  }));

  it('is not there for a game the home page does not know, and makes no link from what it found', () => scenario(env, 'continue unknown game', { prepare: seeded(JSON.stringify({ version: 1, slug: 'javascript:alert(1)', at: 1 })) }, async ({ page, site }) => {
    await openHub(page, site);
    assert.equal(await card(page).count(), 0, 'no card');
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0, 'and no link built from the stored text');
  }));

  it('is not there for a damaged record, which is cleared and named in the log', () => scenario(env, 'continue damaged record', { prepare: seeded('{not json'), expected: [/last-played/] }, async ({ page, site, log }) => {
    await openHub(page, site);
    assert.equal(await card(page).count(), 0, 'no card');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEY), null, 'the damaged value was removed');
    assert.ok(log.sawExpected(/last-played/), 'and the log says which key it was');
  }));

  for (const screen of ['phone', 'desktop']) {
    it(`passes the accessibility checks with the card showing, on a ${screen}`, TIMEOUT, () => scenario(env, `continue a11y ${screen}`, { screen, prepare: seeded(JSON.stringify({ version: 1, slug: 'shop-keeper', at: 1 })) }, async ({ page, site }) => {
      await openHub(page, site);
      await cardLink(page).waitFor();
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `accessibility problems:\n${problems.join('\n')}`);
    }));
  }
});
