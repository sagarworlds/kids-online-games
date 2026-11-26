// Hindi–English Match in Marathi, through the real screens: the language is chosen on the menu and remembered, the cards say Marathi (in the word,
// the tag and the language the page declares), a pair found in Marathi matches, a whole round is played from the word file, the stars are kept
// apart from Hindi's (which keep the plain level ids earlier saves have), and the screens pass the accessibility checks on a phone.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { PAIRS, chooseLanguage, expectFaceUpBoardAccessible, faces, openMatchMenu, pairsOnBoard, startWithPeek, waitForGo } from '../support/matchBoard.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 180_000 };
const SAVE_KEY = 'kidsgames:hindi-english-match';
const MARATHI_WORDS = new Set(PAIRS.map((pair) => pair.mr).filter(Boolean));

const save = (bestStars, extra = {}) => JSON.stringify({ version: 1, bestStars, bestScore: 0, badges: [], extra });
/** Puts a save in the browser before any page runs, as if it had been played on this device. Only when there is none yet, so a reload keeps what the child changed. */
const saved = (value) => (context) => context.addInitScript(([key, text]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, text); }, [SAVE_KEY, value]);

describe('Hindi–English Match in Marathi', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('is Hindi until a language is chosen, and Marathi changes what the menu says and what the cards show', TIMEOUT, () => scenario(env, 'marathi cards', { screen: 'desktop' }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    assert.equal(await page.getByRole('radio', { name: /^Hindi/ }).isChecked(), true, 'a new child gets Hindi');
    assert.match(await textOf(page.locator('.menu__intro')), /Hindi word.*सेब and Apple/);

    await chooseLanguage(page, 'Marathi');
    assert.match(await textOf(page.locator('.menu__intro')), /Marathi word.*सफरचंद and Apple/, 'the menu says Marathi, with its own example');
    assert.equal(await page.locator('.menu__intro [lang="mr"]').count(), 1, 'and marks the example as Marathi');

    await startWithPeek(page);
    const cards = await faces(page);
    assert.equal(cards.length, 12);
    const marathi = cards.filter((card) => card.textLang === 'mr');
    assert.equal(marathi.length, 6, 'one Marathi card for each of the six pairs');
    assert.equal(cards.filter((card) => card.textLang === 'hi').length, 0, 'no Hindi card in a Marathi game');
    for (const card of marathi) {
      assert.equal(card.tag, 'मरा');
      assert.equal(card.tagLang, 'mr', 'the tag carries the language too');
      assert.equal(card.label, `Marathi card: ${card.text}`, 'the card is named for the language it shows');
      assert.ok(MARATHI_WORDS.has(card.text), `"${card.text}" is a Marathi word of the file`);
    }
    for (const card of cards.filter((candidate) => candidate.textLang === null)) {
      assert.equal(card.tag, 'EN');
      assert.match(card.label, /^English card: /);
    }
    assert.equal(pairsOnBoard(cards, 'mr').length, 6, 'every Marathi card has its English card on the board');
    await waitForGo(page);
    assert.match(await textOf(page.locator('.board__status')), /Find a Marathi word and its English match/);
  }));

  it('a Marathi card and its English card match, with the pair said in the status', TIMEOUT, () => scenario(env, 'marathi match', { screen: 'desktop' }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    await chooseLanguage(page, 'Marathi');
    await startWithPeek(page);
    const [{ pair, indic, english }] = pairsOnBoard(await faces(page), 'mr');
    await waitForGo(page);

    await page.locator('.card3d').nth(indic.index).click();
    await page.locator('.card3d').nth(english.index).click();
    await eventually(async () => (await page.locator('.card3d.is-matched').count()) === 2, { message: 'the two cards to be matched' });
    assert.equal(await textOf(page.locator('.board__status')), `✔ ${pair.mr} = ${pair.en}`);
    assert.match(await textOf(page.locator('.hud')), /Pairs\s*1\/6/, 'one pair of six is found');
  }));

  it('a whole round in Marathi ends on three stars, listed in Marathi, with the stars kept under their own key', TIMEOUT, () => scenario(env, 'marathi round', { screen: 'desktop' }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    await chooseLanguage(page, 'Marathi');
    await startWithPeek(page);
    const found = pairsOnBoard(await faces(page), 'mr');
    await waitForGo(page);
    for (const [done, { indic, english }] of found.entries()) {
      await page.locator('.card3d').nth(indic.index).click();
      await page.locator('.card3d').nth(english.index).click();
      await eventually(async () => (await page.locator('.card3d.is-matched').count()) === (done + 1) * 2, { message: `pair ${done + 1} to be matched` });
    }

    await page.locator('.result').waitFor({ timeout: 20_000 });
    assert.equal(await page.locator('.result__stars').getAttribute('aria-label'), '3 out of 3 stars', 'a move for each pair is perfect');
    const listed = await page.locator('.review__word.indic').evaluateAll((words) => words.map((word) => ({ text: word.textContent, lang: word.getAttribute('lang') })));
    assert.equal(listed.length, 6);
    for (const word of listed) {
      assert.equal(word.lang, 'mr', 'the review says each word is Marathi');
      assert.ok(MARATHI_WORDS.has(word.text), `"${word.text}" is a Marathi word of the file`);
    }

    const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY));
    assert.equal(stored.bestStars['mr-easy'], 3, 'Marathi Easy has its own stars');
    assert.equal(stored.bestStars.easy, undefined, 'and Hindi Easy has none it did not earn');
    assert.equal(stored.extra.language, 'mr', 'the language is remembered');

    // Play again keeps the language.
    await page.getByRole('button', { name: /Play again/ }).click();
    await page.locator('.card3d').first().waitFor();
    await waitForGo(page);
    assert.match(await textOf(page.locator('.board__status')), /Marathi/);
  }));

  it('remembers the language, and keeps Hindi\'s stars and Marathi\'s apart (Hindi under the plain level ids, as every earlier save has them)', TIMEOUT, () => scenario(env, 'marathi remembered', { screen: 'desktop', prepare: saved(save({ easy: 3, 'mr-easy': 2, 'mr-hard': 1 }, { language: 'mr', learned: ['kept'] })) }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    assert.equal(await page.getByRole('radio', { name: /^Marathi/ }).isChecked(), true, 'the language chosen last time is chosen again');
    assert.match(await textOf(page.locator('.menu__intro')), /Marathi word/);

    const stars = async () => page.locator('.menu__best li').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
    assert.deepEqual(await stars(), ['Easy: 2 of 3 stars', 'Medium: 0 of 3 stars', 'Hard: 1 of 3 stars'], 'Marathi shows Marathi\'s stars');
    assert.equal(await page.locator('.segmented__suggested').count(), 1);
    assert.match(await textOf(page.locator('.segmented__suggested').locator('xpath=ancestor::label')), /^Medium/, 'Easy done well in Marathi points at Medium');

    await chooseLanguage(page, 'Hindi');
    assert.deepEqual(await stars(), ['Easy: 3 of 3 stars', 'Medium: 0 of 3 stars', 'Hard: 0 of 3 stars'], 'Hindi shows the stars an older save has under the plain ids');
    assert.match(await textOf(page.locator('.menu__intro')), /Hindi word/);
    const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY));
    assert.equal(stored.extra.language, 'hi', 'the change is remembered');
    assert.deepEqual(stored.extra.learned, ['kept'], 'and the rest of the save is kept');

    await page.reload();
    await page.locator('.menu').waitFor();
    assert.equal(await page.getByRole('radio', { name: /^Hindi/ }).isChecked(), true);
  }));

  it('the menu, the board and the results, in Marathi on a phone, pass the accessibility checks, and every Marathi word says it is Marathi', TIMEOUT, () => scenario(env, 'marathi a11y', { screen: 'phone' }, async ({ page, site }) => {
    const report = async (where) => {
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `${where}: accessibility problems:\n${problems.join('\n')}`);
    };
    await openMatchMenu(page, site);
    await chooseLanguage(page, 'Marathi');
    await report('the menu');

    await startWithPeek(page);
    // With every face up this includes that each Marathi word says it is Marathi (WCAG 3.1.2), and that each card is named by its word.
    const found = pairsOnBoard(await faces(page), 'mr');
    await expectFaceUpBoardAccessible(page, 'the board with every card face up');
    await waitForGo(page);
    await report('the board with its cards face down');
    for (const [done, { indic, english }] of found.entries()) {
      await page.locator('.card3d').nth(indic.index).click();
      await page.locator('.card3d').nth(english.index).click();
      await eventually(async () => (await page.locator('.card3d.is-matched').count()) === (done + 1) * 2, { message: `pair ${done + 1} to be matched` });
    }
    await page.locator('.result').waitFor({ timeout: 20_000 });
    await report('the results');
  }));
});
