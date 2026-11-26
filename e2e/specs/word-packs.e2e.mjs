// Word Builder Bubbles, every word pack at every level, in the browser (the packs are read from the game's own word file, so a pack added later is
// checked too): choose the pack and the level on the menu, start, and spell the first word from its clue. That proves the pack's chip is on the
// menu, the round is drawn from that pack and that level, and the picture, clue and bubbles of its words work, for all of its kinds of word.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { levelOfWord } from '../../src/games/word-builder-bubbles/logic/levels.js';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { button, eventually, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 300_000 };
const PACKS = JSON.parse(readFileSync(new URL('../../src/games/word-builder-bubbles/data/words.json', import.meta.url), 'utf8')).packs;
const GAME = '/src/games/word-builder-bubbles/index.html';

/** From the first screen to a round of one pack at one level, as a child does it: the pack, the level, Start. */
async function startRound(page, site, pack, level) {
  await page.goto(`${site.url}${GAME}`);
  await page.locator('.menu__packs .chip').first().waitFor();
  await page.locator('.menu__packs .chip', { hasText: pack.name }).click();
  await page.locator(`fieldset.segmented input[value="${level}"]`).check({ force: true });
  await button(page, /Start/).click();
  await page.locator('.slot').first().waitFor();
}

/** Spells the word on screen with the keyboard, one letter at a time from the first the screen has not given, and waits for the Next button. */
async function spell(page, word) {
  for (let filled = await page.locator('.slot.is-filled').count(); filled < word.length; filled++) {
    const letter = word[filled];
    await page.waitForFunction((l) => [...document.querySelectorAll('.sr-bubble')].some((bubble) => bubble.textContent === `Bubble ${l}`), letter, { timeout: 20_000 });
    await page.keyboard.press(letter);
    await eventually(async () => (await page.locator('.slot.is-filled').count()) === filled + 1, { message: `the letter "${letter}" of "${word}" to fill its slot` });
  }
  await page.locator('.wb__next button').waitFor({ timeout: 15_000 });
}

describe('the word packs', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('no two words share a clue (the checks below find a word by its clue)', () => {
    const seen = new Map();
    for (const pack of PACKS) {
      for (const entry of pack.words) {
        assert.ok(!seen.has(entry.clue), `"${entry.clue}" is the clue of both "${seen.get(entry.clue)}" and "${entry.word}"`);
        seen.set(entry.clue, entry.word);
      }
    }
  });

  for (const level of ['easy', 'medium', 'hard']) {
    it(`every pack at ${level}: the round is that pack's and that level's, and its first word can be spelled`, TIMEOUT, () => scenario(env, `word packs ${level}`, { screen: 'desktop' }, async ({ page, site }) => {
      for (const pack of PACKS) {
        await startRound(page, site, pack, level);
        // The clue is in the page at every level (on Medium it is one tap away, but it is there).
        const clue = await textOf(page.locator('.wb__clue'));
        const entry = pack.words.find((candidate) => candidate.clue === clue);
        assert.ok(entry, `${pack.id}: the clue "${clue}" belongs to a word of the ${pack.name} pack`);
        assert.equal(levelOfWord(entry.word), level, `${pack.id}: "${entry.word}" is a ${level} word`);
        await spell(page, entry.word);
      }
    }));
  }
});
