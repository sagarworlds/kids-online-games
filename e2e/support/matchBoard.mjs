// What the browser specs of Hindi–English Match share: opening its menu, choosing a language, starting a round with Practice on (so every card
// shows its face for a few seconds and can be read), reading what the cards show, and pairing them up from the game's own word file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENGLISH, LANGUAGES } from '../../src/games/hindi-english-match/logic/languages.js';
import { problemsOnScreen } from './a11y.mjs';

export const MATCH_GAME = '/src/games/hindi-english-match/index.html';

/** Every pair of the game's word file. */
export const PAIRS = JSON.parse(readFileSync(new URL('../../src/games/hindi-english-match/data/pairs.json', import.meta.url), 'utf8')).pairs;

/** The tag a card of a language shows ("हिं", "मरा", "EN"). */
export const tagOf = (languageId) => (languageId === 'en' ? ENGLISH : LANGUAGES[languageId]).tag;

/** @param {import('playwright').Page} page @param {{ url: string }} site */
export async function openMatchMenu(page, site) {
  await page.goto(`${site.url}${MATCH_GAME}`);
  await page.locator('.menu').waitFor();
}

/** Chooses Hindi or Marathi by the name on its radio button. */
export const chooseLanguage = (page, name) => page.getByRole('radio', { name: new RegExp(`^${name}`) }).check({ force: true });

/** From the menu to a board with Practice on, so every card shows its face until "Go!". */
export async function startWithPeek(page, level = 'easy') {
  await page.locator(`fieldset.segmented input[value="${level}"]`).check({ force: true });
  await page.locator('#peek').check();
  await page.getByRole('button', { name: /Start/ }).click();
  await page.locator('.card3d').first().waitFor();
}

/** Waits for the end of Practice, when the cards turn face down and the clock starts. */
export const waitForGo = (page) => page.locator('.board__status').filter({ hasText: 'Go!' }).waitFor({ timeout: 20_000 });

/**
 * What each card shows and says right now, in board order. Read while every face is up (Practice), when the text and the tag can be read.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ index: number, label: string, tag: string|null, tagLang: string|null, text: string, textLang: string|null, hearable: boolean, describedBy: string|null, disabled: string|null }[]>}
 */
export const faces = (page) => page.evaluate(() => [...document.querySelectorAll('.card3d')].map((button, index) => {
  const tag = button.querySelector('.card3d__tag');
  const text = button.querySelector('.card3d__text');
  return {
    index,
    label: button.getAttribute('aria-label'),
    // The tag is drawn by the stylesheet from its data-text, so it is not text in the page.
    tag: tag.getAttribute('data-text'),
    tagLang: tag.getAttribute('lang'),
    text: text.textContent,
    textLang: text.getAttribute('lang'),
    hearable: button.classList.contains('is-hearable'),
    describedBy: button.getAttribute('aria-describedby'),
    disabled: button.getAttribute('aria-disabled'),
  };
}));

/**
 * The board's cards paired up, from what the faces show and the word file: the card of the language and the English card of each pair.
 * @param {Awaited<ReturnType<typeof faces>>} cards
 * @param {'hi'|'mr'} languageId
 */
export function pairsOnBoard(cards, languageId) {
  const pairFor = new Map(PAIRS.filter((pair) => pair[languageId]).map((pair) => [pair[languageId], pair]));
  return cards.filter((card) => card.textLang === languageId).map((card) => {
    const pair = pairFor.get(card.text);
    assert.ok(pair, `"${card.text}" is a ${LANGUAGES[languageId].name} word in the word file`);
    const english = cards.find((candidate) => candidate.textLang === null && candidate.text === pair.en);
    assert.ok(english, `the English card "${pair.en}" is on the board`);
    return { pair, indic: card, english };
  });
}

/**
 * The accessibility checks on the board while every card is face up. Practice lasts only a few seconds, so the keyboard walk (which takes
 * longer than that) is left out here and done with the cards face down; and if Practice ended before the check did, that is said, rather than
 * the check quietly looking at a board with its cards turned over.
 *
 * @param {import('playwright').Page} page A board in Practice.
 * @param {string} where Said in a failure message.
 */
export async function expectFaceUpBoardAccessible(page, where) {
  const problems = await problemsOnScreen(page, { keyboard: false });
  const status = (await page.locator('.board__status').textContent()) ?? '';
  assert.ok(status.startsWith('Remember the cards!'), `${where}: Practice ended before the check did ("${status}"), so it did not look at face-up cards`);
  assert.equal(problems.length, 0, `${where}: accessibility problems:\n${problems.join('\n')}`);
}
