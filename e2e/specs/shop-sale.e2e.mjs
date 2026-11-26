// Shop Keeper's Sale day, through the real screens: the menu offers it and keeps its stars apart, the price tags show the price before the discount
// and the percent off, the child works out the bill after the discounts (wrong answers get hints about the discount), gives the change from that
// bill, a whole round is recorded under its own key, and the screens pass the accessibility checks on a phone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { minBreakdown } from '../../src/games/shop-keeper/logic/change.js';
import { validateCurrency } from '../../src/games/shop-keeper/logic/currency.js';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 180_000 };
const GAME = '/src/games/shop-keeper/index.html';
const SAVE_KEY = 'kidsgames:shop-keeper';
const INR = validateCurrency(JSON.parse(readFileSync(new URL('../../src/games/shop-keeper/data/currency.inr.json', import.meta.url), 'utf8')));

const save = (bestStars) => JSON.stringify({ version: 1, bestStars, bestScore: 0, badges: [], extra: {} });
/** Puts a save in the browser before any page runs, as if it had been played on this device. Only when there is none yet. */
const saved = (value) => (context) => context.addInitScript(([key, text]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, text); }, [SAVE_KEY, value]);

async function openMenu(page, site) {
  await page.goto(`${site.url}${GAME}`);
  await page.locator('.menu').waitFor();
}

/** From the menu to the first customer, on Sale day or not. */
async function openShop(page, { level, saleDay }) {
  if (saleDay) await page.locator('#sale-day').check();
  await page.locator(`fieldset.segmented input[value="${level}"]`).check({ force: true });
  await page.getByRole('button', { name: /Open the shop/ }).click();
  await page.locator('.counter').waitFor();
}

/** The price tags on the counter, from what a screen reader hears ("Paint set, ₹52, 25% off"). */
async function tagsOnCounter(page) {
  const labels = await page.locator('.item').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
  return labels.map((label) => {
    const found = /^(.+), ₹(\d+), (\d+)% off$/.exec(label);
    assert.ok(found, `"${label}" is a Sale day tag: a name, the price before the discount and the percent off`);
    return { name: found[1], marked: Number(found[2]), percentOff: Number(found[3]) };
  });
}

/** What the bill is when each tag's percent is taken off its price. */
const billOf = (tags) => tags.reduce((total, tag) => total + tag.marked - (tag.marked * tag.percentOff) / 100, 0);

const typeTotal = async (page, text) => {
  await page.locator('#till-total').fill(text);
  await page.getByRole('button', { name: 'Check total' }).click();
};

/** Gives exact change in the fewest pieces by tapping the cash drawer, then presses "Give change". */
async function giveChange(page, amount) {
  for (const value of minBreakdown(amount, INR.denominations)) {
    const before = await page.locator('.tray__pieces .piece').count();
    await page.getByRole('button', { name: new RegExp(`^₹${value} (coin|note)`) }).first().click();
    await eventually(async () => (await page.locator('.tray__pieces .piece').count()) === before + 1, { message: `a ₹${value} piece to land in the tray` });
  }
  await page.getByRole('button', { name: 'Give change' }).click();
}

const paidBy = async (page) => Number(/₹(\d+)/.exec(await textOf(page.locator('.payment h2')))[1]);

describe('Shop Keeper on Sale day', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('is off until it is chosen, and choosing it changes the words, the level lines and which stars are shown and suggested', TIMEOUT, () => scenario(env, 'sale menu', { screen: 'desktop', prepare: saved(save({ easy: 3, 'sale-medium': 2 })) }, async ({ page, site }) => {
    await openMenu(page, site);
    assert.equal(await page.locator('#sale-day').isChecked(), false, 'Sale day is off for a child who has not chosen it');
    assert.match(await textOf(page.locator('.menu__intro')), /Customers buy things and pay with a note/);
    const levelLines = () => page.locator('fieldset.segmented label').evaluateAll((labels) => labels.map((label) => label.textContent.replace(/\s+/g, ' ').trim()));
    const stars = () => page.locator('.menu__best li').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
    const chosen = () => page.locator('fieldset.segmented input:checked').getAttribute('value');
    assert.deepEqual(await stars(), ['Easy: 3 of 3 stars', 'Medium: 0 of 3 stars', 'Hard: 0 of 3 stars']);
    assert.equal(await chosen(), 'medium', 'Easy done well opens the menu on Medium');
    assert.match((await levelLines())[0], /One item, the total is shown/);

    await page.locator('#sale-day').check();
    assert.match(await textOf(page.locator('.menu__intro')), /It is Sale day! Every price tag has a percent off/);
    assert.match((await levelLines())[0], /One item, half price/);
    assert.match((await levelLines())[1], /Two items, 10% to 50% off/);
    assert.deepEqual(await stars(), ['Easy: 0 of 3 stars', 'Medium: 2 of 3 stars', 'Hard: 0 of 3 stars'], 'the stars of Sale day are shown');
    assert.equal(await textOf(page.locator('.menu__best h2')), 'Your best on Sale day');
    assert.equal(await chosen(), 'medium', 'the level the child had chosen is kept');
    assert.match(await textOf(page.locator('fieldset.segmented label', { hasText: /^Hard/ }).locator('.segmented__suggested')), /Suggested/, 'Medium done well on Sale day points at Hard');

    await page.locator('#sale-day').uncheck();
    assert.deepEqual(await stars(), ['Easy: 3 of 3 stars', 'Medium: 0 of 3 stars', 'Hard: 0 of 3 stars']);
    assert.match(await textOf(page.locator('.menu__intro')), /Customers buy things and pay with a note/);
  }));

  it('the tags show the price before the discount and the percent off, and the bill is what is left to pay after them', TIMEOUT, () => scenario(env, 'sale bill', { screen: 'desktop' }, async ({ page, site }) => {
    await openMenu(page, site);
    await openShop(page, { level: 'medium', saleDay: true });
    const tags = await tagsOnCounter(page);
    assert.equal(tags.length, 2, 'Medium has two items');
    assert.ok(tags.every((tag) => [10, 25, 50].includes(tag.percentOff)), 'with the discounts of Medium');
    assert.ok(tags.every((tag) => Number.isInteger((tag.marked * tag.percentOff) / 100)), 'each of which takes off whole rupees');
    const visible = await page.locator('.item').evaluateAll((items) => items.map((item) => ({ price: item.querySelector('.item__price').textContent, off: item.querySelector('.item__off').textContent })));
    assert.deepEqual(visible, tags.map((tag) => ({ price: `₹${tag.marked}`, off: `${tag.percentOff}% off` })), 'the tags show the same on screen');
    assert.match(await textOf(page.locator('.till__label')), /Take the discount off each price, then add up\. What is the bill/);
    assert.equal(await page.locator('.till__total').count(), 0, 'the till does not show the bill');

    // The price before the discounts is a natural mistake, and is not the bill.
    const full = tags.reduce((total, tag) => total + tag.marked, 0);
    const bill = billOf(tags);
    assert.notEqual(full, bill);
    await typeTotal(page, String(full));
    assert.match(await textOf(page.locator('.till__message')), /Not quite\. Take the discount off each price tag first, then add up what is left\./);
    await typeTotal(page, String(full));
    const first = tags[0];
    const off = (first.marked * first.percentOff) / 100;
    assert.equal(await textOf(page.locator('.till__message')), `Not quite. Start with the first one: ${first.percentOff}% off ₹${first.marked} takes off ₹${off}, so it costs ₹${first.marked - off}.`);
    assert.equal(await page.locator('.shop__change').isHidden(), true, 'the change is not given until the bill is right');

    await typeTotal(page, String(bill));
    assert.equal(await textOf(page.locator('.till__message')), 'Yes! That is the bill. Now give the change.');
    await page.locator('.shop__change').waitFor();
    assert.equal(await textOf(page.locator('.till__total strong')), `₹${bill}`, 'the bill is on the till now');

    // The change is worked from the bill.
    const paid = await paidBy(page);
    assert.ok(paid > bill, 'the customer pays more than the bill');
    await giveChange(page, paid - bill);
    await eventually(async () => /^Ka-ching!/.test(await textOf(page.locator('.shop__status'))), { message: 'the change to be right' });
  }));

  it('after three wrong bills the till shows it, and the change is still worked from the bill after the discounts', TIMEOUT, () => scenario(env, 'sale revealed', { screen: 'desktop' }, async ({ page, site }) => {
    await openMenu(page, site);
    await openShop(page, { level: 'easy', saleDay: true });
    const tags = await tagsOnCounter(page);
    assert.equal(tags.length, 1);
    assert.equal(tags[0].percentOff, 50, 'Easy is half price');
    for (let i = 0; i < 3; i++) await typeTotal(page, '1');
    const bill = billOf(tags);
    assert.equal(await textOf(page.locator('.till__message')), `The bill is ₹${bill}. Now give the change.`);
    await giveChange(page, (await paidBy(page)) - bill);
    await eventually(async () => /^Ka-ching!/.test(await textOf(page.locator('.shop__status'))), { message: 'the change to be right' });
  }));

  it('a whole round is recorded under sale-<level>, leaves the plain level alone, and Play again is Sale day again', TIMEOUT, () => scenario(env, 'sale round', { screen: 'desktop' }, async ({ page, site }) => {
    await openMenu(page, site);
    await openShop(page, { level: 'easy', saleDay: true });
    // The quickest round: no bill is right (the third wrong one shows it) and no change is right (the third wrong one ends the customer).
    for (let customer = 1; customer <= 6; customer++) {
      assert.match(await textOf(page.locator('.hud')), new RegExp(`Customer\\s*${customer}/6`));
      assert.equal((await tagsOnCounter(page)).length, 1, 'every customer on Sale day has a discount tag');
      for (let i = 0; i < 3; i++) await typeTotal(page, '1');
      await page.getByRole('button', { name: new RegExp(`^₹1 coin`) }).click();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Give change' }).click();
      await page.getByRole('button', { name: customer === 6 ? /See results/ : /Next customer/ }).click();
    }
    await page.locator('.result').waitFor();
    assert.match(await textOf(page.locator('.result')), /Sale day: you worked out the bill after every discount/);
    const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY));
    assert.deepEqual(Object.keys(stored.bestStars), ['sale-easy'], 'only Sale day\'s Easy has stars');
    assert.equal(stored.bestStars.easy, undefined, 'and the plain Easy has none it did not earn');

    await page.getByRole('button', { name: /Play again/ }).click();
    await page.locator('.counter').waitFor();
    assert.equal((await tagsOnCounter(page)).length, 1, 'Play again is Sale day again: the tags have a percent off');
    assert.match(await textOf(page.locator('.till__label')), /What is the bill/, 'and the child works out the bill, as on Sale day, not the till');

    // The menu shows them where they belong.
    await page.goto(`${site.url}${GAME}`);
    await page.locator('.menu').waitFor();
    assert.equal(await page.locator('.menu__best li').first().getAttribute('aria-label'), 'Easy: 0 of 3 stars');
    await page.locator('#sale-day').check();
    assert.equal(await page.locator('.menu__best li').first().getAttribute('aria-label'), 'Easy: 1 of 3 stars');
  }));

  it('the menu, the counter and the till, on Sale day on a phone, pass the accessibility checks', TIMEOUT, () => scenario(env, 'sale a11y', { screen: 'phone' }, async ({ page, site }) => {
    const report = async (where) => {
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `${where}: accessibility problems:\n${problems.join('\n')}`);
    };
    await openMenu(page, site);
    await page.locator('#sale-day').check();
    await report('the menu on Sale day');
    await openShop(page, { level: 'hard', saleDay: true });
    await report('the counter on Hard, three tags');
    assert.equal((await tagsOnCounter(page)).length, 3);
    const bill = billOf(await tagsOnCounter(page));
    await typeTotal(page, String(bill));
    await page.locator('.shop__change').waitFor();
    await report('the till after the bill is right');
  }));
});
