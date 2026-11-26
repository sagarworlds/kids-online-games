// Hindi–English Match's cards with their faces up, on every kind of screen. A card is small on a phone (76px wide on a 360px screen) and the words in
// it differ ("Sun", "Pomegranate", "आजोबा"), so this keeps three things honest: every word of the game fits on its card (it is shrunk to fit, and
// no word is broken in the middle unless it has already been made as small as the game allows), a face-up card says its word when it is tapped
// (there is no speaker button on it to cover the word), and a card's name holds all the text it shows (the only text on a card is its word).
// What the cards look like is measured by position and size, so the machine's font does not matter.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ENGLISH, LANGUAGES, voiceOf } from '../../src/games/hindi-english-match/logic/languages.js';
import { LEAST_WORD_SCALE } from '../../src/games/hindi-english-match/logic/levels.js';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { PAIRS, chooseLanguage, expectFaceUpBoardAccessible, faces, openMatchMenu, pairsOnBoard, startWithPeek, tagOf, waitForGo } from '../support/matchBoard.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';

const TIMEOUT = { timeout: 180_000 };
const SCREEN_NAMES = { desktop: 'a desktop', phone: 'a phone', smallPhone: 'a small phone', tinyPhone: 'the smallest phone' };

/** Every word of the word file, in every language it has, as a card shows it. */
const WORDS = PAIRS.flatMap((pair) => [
  { text: pair.en, language: 'en', image: pair.image },
  { text: pair.hi, language: 'hi', image: pair.image },
  ...(pair.mr ? [{ text: pair.mr, language: 'mr', image: pair.image }] : []),
]);

/** A few frames, so that a layout the page asked for (after cards were added, or a resize) has been done. */
const settle = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));

/**
 * Adds a card for every word to the board (a copy of its first card with the word, the tag and the picture changed), so that every word the
 * game has is checked and not only the ones this round happened to deal. Runs in the page.
 * @param {{ words: typeof WORDS, tags: Record<string, string> }} input
 */
function putEveryWordOnACard({ words, tags }) {
  const grid = document.querySelector('.cards');
  const model = grid.querySelector('.card3d');
  for (const { text, language, image } of words) {
    const card = /** @type {HTMLElement} */ (model.cloneNode(true));
    const word = card.querySelector('.card3d__text');
    word.textContent = text;
    word.className = language === 'en' ? 'card3d__text' : 'card3d__text indic';
    const tag = /** @type {HTMLElement} */ (card.querySelector('.card3d__tag'));
    tag.dataset.text = tags[language];
    for (const part of [word, tag]) {
      if (language === 'en') part.removeAttribute('lang');
      else part.setAttribute('lang', language);
    }
    const picture = /** @type {HTMLElement|null} */ (card.querySelector('.card3d__image'));
    if (picture) picture.dataset.text = image ?? '🍎';
    card.classList.add('is-up');
    card.removeAttribute('data-id');
    grid.append(card);
  }
}

/**
 * Where everything on every card is, and whether any word is broken in the middle. Runs in the page.
 * @returns {{ word: string, size: number, natural: number, problems: string[], broken: string[] }[]}
 */
function measureEveryCard() {
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  return [...document.querySelectorAll('.cards .card3d')].map((card) => {
    const front = card.querySelector('.card3d__front').getBoundingClientRect();
    const word = /** @type {HTMLElement} */ (card.querySelector('.card3d__text'));
    const parts = { tag: card.querySelector('.card3d__tag'), word, picture: card.querySelector('.card3d__image') };
    const problems = [];
    const rects = {};
    for (const [name, part] of Object.entries(parts)) {
      if (!part) continue;
      const rect = part.getBoundingClientRect();
      rects[name] = rect;
      if (rect.left < front.left - 0.5 || rect.right > front.right + 0.5 || rect.top < front.top - 0.5 || rect.bottom > front.bottom + 0.5) problems.push(`the ${name} leaves the card`);
    }
    if (word.scrollWidth > word.clientWidth + 1) problems.push('the word is wider than its box');
    for (const [a, b] of [['tag', 'word'], ['word', 'picture'], ['tag', 'picture']]) {
      if (rects[a] && rects[b] && overlap(rects[a], rects[b])) problems.push(`the ${a} and the ${b} overlap`);
    }

    // The size the stylesheet gives the word, and the size it has now (the script shrinks a word that is too wide).
    const inline = word.style.fontSize;
    word.style.fontSize = '';
    const natural = parseFloat(getComputedStyle(word).fontSize);
    word.style.fontSize = inline;

    // A piece of a word (a word, or a part of a hyphenated one) that is on two lines has been broken in the middle.
    const text = word.textContent ?? '';
    const broken = [];
    let from = 0;
    for (const piece of text.trim().split(/(?<=-)|\s+/).filter(Boolean)) {
      const start = text.indexOf(piece, from);
      from = start + piece.length;
      const range = document.createRange();
      range.setStart(word.firstChild, start);
      range.setEnd(word.firstChild, from);
      if (new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1) broken.push(piece);
    }
    return { word: text, size: parseFloat(getComputedStyle(word).fontSize), natural, problems, broken };
  });
}

/**
 * Stands in for the browser's speech: records what is said, and says which languages have a voice.
 * @param {string[]} languages Voices the device has, such as 'hi-IN'.
 */
const withVoices = (languages) => (context) => context.addInitScript((have) => {
  const spoken = [];
  const voices = have.map((lang) => ({ lang, name: lang }));
  const synth = { getVoices: () => voices, speak: (utterance) => spoken.push({ lang: utterance.lang, text: utterance.text }), cancel() {}, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  window.__spoken = spoken;
}, languages);

const spoken = (page) => page.evaluate(() => window.__spoken.slice());

/** The mark in the corner of every card, which the stylesheet draws: "🔊", "✔", or nothing (`none`). */
const cornerMarks = (page) => page.evaluate(() => [...document.querySelectorAll('.card3d')].map((card) => getComputedStyle(card.querySelector('.card3d__front'), '::after').content));

describe('the cards of Hindi–English Match', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  for (const screen of Object.keys(SCREEN_NAMES)) {
    it(`every word of the game fits its card at every level, on ${SCREEN_NAMES[screen]}`, TIMEOUT, () => scenario(env, `match words ${screen}`, { screen }, async ({ page, site }) => {
      const problems = [];
      let shrunk = 0;
      for (const level of ['easy', 'medium', 'hard']) {
        await openMatchMenu(page, site);
        await page.locator(`fieldset.segmented input[value="${level}"]`).check({ force: true });
        await page.getByRole('button', { name: /Start/ }).click();
        await page.locator('.card3d').first().waitFor();
        await page.evaluate(putEveryWordOnACard, { words: WORDS, tags: { en: ENGLISH.tag, hi: LANGUAGES.hi.tag, mr: LANGUAGES.mr.tag } });
        await settle(page);
        await page.evaluate(() => document.fonts.ready);
        await settle(page);

        for (const card of await page.evaluate(measureEveryCard)) {
          if (card.size < card.natural) shrunk += 1;
          for (const problem of card.problems) problems.push(`${level}: "${card.word}": ${problem}`);
          // A word that has been made as small as the game allows may be broken, because there is nothing else to do; any other is a mistake.
          if (card.broken.length > 0 && card.size > card.natural * LEAST_WORD_SCALE + 0.5) {
            problems.push(`${level}: "${card.word}": "${card.broken.join('", "')}" is broken in the middle, at ${card.size.toFixed(1)}px when it may go down to ${(card.natural * LEAST_WORD_SCALE).toFixed(1)}px`);
          }
        }
      }
      assert.ok(shrunk > 0, 'some word was too wide for its card and was shrunk, so the check is looking at something');
      assert.deepEqual(problems, [], `words that do not fit their cards:\n${problems.join('\n')}`);
    }));
  }

  it('a word is fitted again when the screen changes size, and is not left small when there is room', TIMEOUT, () => scenario(env, 'match refit', { screen: 'phone' }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    await startWithPeek(page);
    await page.locator('.card3d__text').first().evaluate((word) => { word.textContent = 'Pomegranate'; word.removeAttribute('lang'); word.classList.remove('indic'); });
    // The board is laid out again when its size changes, and every word is measured again with it.
    const share = () => page.locator('.card3d__text').first().evaluate((word) => {
      const inline = word.style.fontSize;
      word.style.fontSize = '';
      const natural = parseFloat(getComputedStyle(word).fontSize);
      word.style.fontSize = inline;
      return parseFloat(getComputedStyle(word).fontSize) / natural;
    });
    await page.setViewportSize({ width: 361, height: 640 });
    await settle(page);
    const narrow = await share();
    assert.ok(narrow < 1, `a word wider than its card is shrunk (${narrow.toFixed(2)} of its size)`);
    await page.setViewportSize({ width: 1100, height: 800 });
    await settle(page);
    const wide = await share();
    assert.ok(wide > narrow, `with more room it is shrunk less (${wide.toFixed(2)}, not ${narrow.toFixed(2)})`);
    assert.ok(wide <= 1);
  }));

  it('the only text on a card is its word, and the card is named by it, in each language', TIMEOUT, () => scenario(env, 'match names', { screen: 'desktop' }, async ({ page, site }) => {
    for (const language of ['Hindi', 'Marathi']) {
      await openMatchMenu(page, site);
      await chooseLanguage(page, language);
      await startWithPeek(page);
      const cards = await faces(page);
      for (const card of cards) {
        const name = card.label ?? '';
        assert.ok(name.includes(card.text), `${language}: the name "${name}" holds the word "${card.text}"`);
        assert.match(name, /^(Hindi|Marathi|English) card: /, `${language}: the name says what kind of card it is`);
      }
      const text = await page.evaluate(() => [...document.querySelectorAll('.card3d')].map((button) => ({ all: button.textContent, word: button.querySelector('.card3d__text').textContent })));
      assert.deepEqual(text.filter((card) => card.all !== card.word), [], `${language}: nothing but its word is text in a card (the tag, the picture and the marks are drawn by the stylesheet)`);
      assert.ok(cards.every((card) => card.tag === tagOf(card.textLang ?? 'en')), `${language}: each card still shows its language's tag`);
    }
  }));

  it('a face-up card says its word in its language when it is tapped or pressed, and a face-down one turns over', TIMEOUT, () => scenario(env, 'match hear', { screen: 'desktop', prepare: withVoices(['hi-IN', 'mr-IN', 'en-IN']) }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    await startWithPeek(page);
    // Practice lasts a few seconds: read everything it shows, and tap a card, before anything else.
    const cards = await faces(page);
    const marks = await cornerMarks(page);
    await page.locator('.card3d').nth(1).click();
    const voice = (card) => voiceOf(card.textLang ?? 'en');

    assert.ok(cards.every((card) => card.hearable && card.describedBy), 'while every card is face up, each can be heard, and says so to a screen reader');
    assert.ok(marks.every((mark) => mark === '"🔊"'), 'and shows the speaker');
    assert.deepEqual(await spoken(page), [{ lang: voice(cards[1]), text: cards[1].text }], 'tapping a face-up card says its word, in the card\'s language');
    assert.equal(await page.locator('.card3d.is-matched').count(), 0, 'and turns nothing over');

    await waitForGo(page);
    assert.equal(await page.locator('.card3d.is-hearable').count(), 0, 'face down, no card can be heard');
    assert.ok((await cornerMarks(page)).every((mark) => mark === 'none'), 'and none shows the speaker');
    const said = (await spoken(page)).length;

    // A face-down card turns over without a word; the next tap says it.
    await page.locator('.card3d').nth(0).click();
    await eventually(async () => (await page.locator('.card3d.is-up').count()) === 1, { message: 'the card to turn over' });
    assert.equal((await spoken(page)).length, said, 'turning a card over says nothing');
    assert.ok((await faces(page))[0].hearable, 'now it can be heard');
    await page.locator('.card3d').nth(0).click();
    assert.deepEqual((await spoken(page)).slice(said), [{ lang: voice(cards[0]), text: cards[0].text }], 'a second tap says its word');
    assert.equal(await page.locator('.card3d.is-up').count(), 1, 'and does not turn it back');

    // Enter does the same, for a keyboard.
    await page.locator('.card3d').nth(0).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual((await spoken(page)).slice(said + 1), [{ lang: voice(cards[0]), text: cards[0].text }]);

    // A matched card can be heard again, and shows ✔ where the speaker was. The first card is turned over already, so turn up its partner.
    const mine = pairsOnBoard(cards, 'hi').find((found) => found.indic.index === 0 || found.english.index === 0);
    const partner = mine.indic.index === 0 ? mine.english : mine.indic;
    await page.locator('.card3d').nth(partner.index).click();
    await eventually(async () => (await page.locator('.card3d.is-matched').count()) === 2, { message: 'the pair to be matched' });
    const before = (await spoken(page)).length;
    await page.locator('.card3d').nth(partner.index).click();
    assert.equal((await spoken(page)).length, before + 1, 'a matched card says its word when it is tapped');
    assert.equal((await cornerMarks(page))[partner.index], '"✔"', 'and shows ✔ rather than the speaker');
  }));

  it('a card in a language the device has no voice for shows no speaker and says nothing, while English still can', TIMEOUT, () => scenario(env, 'match no voice', { screen: 'desktop', prepare: withVoices(['en-IN']) }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    await startWithPeek(page);
    // Everything Practice shows, read at once.
    const cards = await faces(page);
    const marks = await cornerMarks(page);
    const hindi = cards.filter((card) => card.textLang === 'hi');
    assert.equal(hindi.length, 6);
    for (const card of hindi) {
      assert.equal(card.hearable, false);
      assert.equal(card.disabled, 'true', 'a face-up card with nothing to do is disabled');
      assert.equal(card.describedBy, null);
      assert.equal(marks[card.index], 'none', 'and shows no speaker');
    }
    for (const card of cards.filter((candidate) => candidate.textLang === null)) {
      assert.ok(card.hearable && card.disabled === 'false', 'English cards can still be heard');
      assert.equal(marks[card.index], '"🔊"');
    }

    // A pair: the English card turned over can be heard, and once its Hindi partner is turned up (a match) the Hindi card cannot.
    const [{ indic, english }] = pairsOnBoard(cards, 'hi');
    await waitForGo(page);
    await page.locator('.card3d').nth(english.index).click();
    await eventually(async () => (await page.locator('.card3d.is-up').count()) === 1, { message: 'the card to turn over' });
    await page.locator('.card3d').nth(english.index).click();
    assert.deepEqual(await spoken(page), [{ lang: 'en-IN', text: english.text }], 'an English card says its word');
    await page.locator('.card3d').nth(indic.index).click();
    await eventually(async () => (await page.locator('.card3d.is-matched').count()) === 2, { message: 'the pair to be matched' });
    const before = (await spoken(page)).length;
    // The card is marked as disabled, which Playwright will not click; a finger can, so the click is forced.
    await page.locator('.card3d').nth(indic.index).click({ force: true });
    assert.equal((await spoken(page)).length, before, 'a Hindi card says nothing when there is no Hindi voice');
    assert.equal((await faces(page))[indic.index].hearable, false);
    assert.equal((await cornerMarks(page))[indic.index], '"✔"', 'it shows ✔');
  }));

  for (const [screen, language] of [['phone', 'Hindi'], ['phone', 'Marathi'], ['desktop', 'Hindi']]) {
    it(`the board with its cards face up, and with a pair matched, passes the accessibility checks in ${language} on ${SCREEN_NAMES[screen]}`, TIMEOUT, () => scenario(env, `match faces a11y ${screen} ${language}`, { screen, prepare: withVoices(['hi-IN', 'mr-IN', 'en-IN']) }, async ({ page, site }) => {
      await openMatchMenu(page, site);
      await chooseLanguage(page, language);
      await startWithPeek(page);
      const [{ indic, english }] = pairsOnBoard(await faces(page), language === 'Hindi' ? 'hi' : 'mr');
      await expectFaceUpBoardAccessible(page, 'every card face up');
      await waitForGo(page);
      await page.locator('.card3d').nth(indic.index).click();
      await page.locator('.card3d').nth(english.index).click();
      await eventually(async () => (await page.locator('.card3d.is-matched').count()) === 2, { message: 'the pair to be matched' });
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `a pair matched, the rest face down: accessibility problems:\n${problems.join('\n')}`);
    }));
  }
});
