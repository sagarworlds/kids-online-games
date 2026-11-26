// The grown-ups' progress summary, in the settings on the home page: what the child has done, read from what the games saved. It is the
// part of the dialog a grown-up looks at to see how a child is getting on, so the numbers have to be the saved ones, and it has to be easy to use.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { GAMES } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { answerGrownUpCheck, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 120_000 };

/** A save in the shape the games write (`kidsgames:<slug>`): stars per level, a best score, badges. */
const save = ({ stars = {}, badges = [], score = 0 }) => JSON.stringify({ version: 1, bestStars: stars, bestScore: score, badges, extra: {} });

/**
 * Four games with progress, the way their saves look after play: Number Ninja has two levels (3 and 2 stars) and a badge, Pizza Fractions
 * one level (1 star), Simon Says one (3 stars), Lights Out only a badge. That is 9 stars and 2 badges in 4 of the games.
 */
const SAVES = {
  'number-ninja': save({ stars: { easy: 3, medium: 2 }, badges: ['streak-5'], score: 120 }),
  'pizza-fractions': save({ stars: { easy: 1 } }),
  'simon-says': save({ stars: { hard: 3 } }),
  'lights-out': save({ badges: ['curious'] }),
};

/** Puts the saves in the browser before any page runs, as if those games had been played on this device. */
const withSaves = (context) => context.addInitScript((saves) => {
  for (const [slug, value] of Object.entries(saves)) localStorage.setItem(`kidsgames:${slug}`, value);
}, SAVES);

describe('the grown-ups\' progress summary', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  /** Opens the home page and the grown-ups' settings; gives back the child's name and the progress section. */
  async function openProgress(page, site) {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    const name = (await textOf(page.locator('.hub__greeting'))).replace(/^Hi, /, '').replace(/!$/, '');
    await page.getByRole('button', { name: 'Grown-ups', exact: true }).click();
    await answerGrownUpCheck(page);
    const section = page.locator('dialog[open] .progress');
    await section.waitFor();
    return { name, section };
  }

  it('says a child who has played nothing has played nothing, with no empty list', TIMEOUT, () => scenario(env, 'progress none', { screen: 'phone' }, async ({ page, site }) => {
    const { name, section } = await openProgress(page, site);
    assert.equal(await textOf(section.locator('.progress__total')), `${name} has not played anything on this device yet.`);
    assert.equal(await section.locator('details').count(), 0, 'there is nothing to list');
  }));

  it('adds up what the games saved: the totals, each subject and each game', TIMEOUT, () => scenario(env, 'progress seeded', { screen: 'phone', prepare: withSaves }, async ({ page, site }) => {
    const { name, section } = await openProgress(page, site);
    const games = GAMES.length;
    assert.equal(await textOf(section.locator('.progress__total')), `${name} has earned 9 stars and 2 badges, playing 4 of ${games} games.`);

    // The list is folded away until it is asked for.
    const details = section.locator('details');
    assert.equal(await details.evaluate((element) => element.open), false, 'the list starts folded');
    await details.locator('summary').click();
    assert.equal(await details.evaluate((element) => element.open), true, 'and opens');

    const row = (slug) => section.locator(`.progress__game[data-slug="${slug}"]`);
    assert.match(await textOf(row('number-ninja')), /Number Ninja\s+5 stars, 2 levels, 1 badge$/, 'two levels, the best of each: 3 + 2');
    assert.match(await textOf(row('pizza-fractions')), /Pizza Fractions\s+1 star, 1 level$/);
    assert.match(await textOf(row('simon-says')), /Simon Says\s+3 stars, 1 level$/);
    assert.match(await textOf(row('lights-out')), /Lights Out\s+1 badge$/, 'a game with only a badge is played, with no stars made up');
    assert.match(await textOf(row('robot-path')), /Robot Path\s+Not played yet$/);

    const subject = (heading) => section.locator('.progress__subject', { has: page.getByRole('heading', { name: heading, exact: true }) });
    // The number of games in a subject is however many the list shows under it, so adding a game does not break this.
    const listed = (heading) => subject(heading).locator('.progress__game').count();
    assert.equal(await textOf(subject('Math').locator('.progress__subtotal')), `6 stars, 2 of ${await listed('Math')} games played`, 'Number Ninja 5 + Pizza Fractions 1');
    assert.equal(await textOf(subject('Memory & focus').locator('.progress__subtotal')), `3 stars, 1 of ${await listed('Memory & focus')} games played`);
    assert.equal(await section.locator('.progress__game').count(), games, 'every game is listed once');
  }));

  it('passes the accessibility checks with the list open, on a phone', TIMEOUT, () => scenario(env, 'progress a11y', { screen: 'phone', prepare: withSaves }, async ({ page, site }) => {
    const { section } = await openProgress(page, site);
    await section.locator('summary').click();
    const problems = await problemsOnScreen(page);
    assert.equal(problems.length, 0, `accessibility problems:\n${problems.join('\n')}`);
  }));

  it('is brought up to date when the grown-up resets progress with the settings open', TIMEOUT, () => scenario(env, 'progress reset', { screen: 'phone', prepare: withSaves }, async ({ page, site }) => {
    const { name, section } = await openProgress(page, site);
    assert.match(await textOf(section.locator('.progress__total')), /has earned 9 stars/);

    await page.getByRole('button', { name: 'Reset all progress' }).click();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    const fresh = page.locator('dialog[open] .progress');
    await fresh.locator('.progress__total').filter({ hasText: 'has not played anything' }).waitFor();
    assert.equal(await textOf(fresh.locator('.progress__total')), `${name} has not played anything on this device yet.`);
    assert.equal(await fresh.locator('details').count(), 0, 'and the list is gone with the progress');
    assert.equal(await page.locator('dialog[open] .progress').count(), 1, 'one section, not two');
  }));
});
