// Hindi–English Match's topics, through the real menu. The list of topics is read from the game's own word file, so a topic that is added later is
// checked too: the menu offers each one, a round of a topic deals only that topic's words (in Hindi and in Marathi, at every level, with a Hindi or
// Marathi card and an English card for each pair), and the menu with all its topics passes the accessibility checks on a phone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { PAIRS, chooseLanguage, faces, openMatchMenu, startWithPeek } from '../support/matchBoard.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';

const TIMEOUT = { timeout: 240_000 };
const TOPICS = JSON.parse(readFileSync(new URL('../../src/games/hindi-english-match/data/pairs.json', import.meta.url), 'utf8')).topics;
/** The pairs each level deals (the game's levels.js says the same). */
const PAIRS_AT = { easy: 6, medium: 8, hard: 10 };

describe('the topics of Hindi–English Match', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('the menu offers Mixed and every topic of the word file, in its order', TIMEOUT, () => scenario(env, 'match topics menu', { screen: 'desktop' }, async ({ page, site }) => {
    await openMatchMenu(page, site);
    const offered = await page.locator('input[name="topic"]').evaluateAll((radios) => radios.map((radio) => radio.value));
    assert.deepEqual(offered, ['Mixed', ...TOPICS]);
    assert.equal(await page.locator('input[name="topic"]:checked').getAttribute('value'), 'Mixed', 'it opens on Mixed');
  }));

  for (const [language, id] of [['Hindi', 'hi'], ['Marathi', 'mr']]) {
    it(`a round of each topic deals only that topic's words in ${language}, at every level`, TIMEOUT, () => scenario(env, `match topics ${id}`, { screen: 'desktop' }, async ({ page, site }) => {
      const problems = [];
      for (const topic of TOPICS) {
        const inTopic = PAIRS.filter((pair) => pair.topic === topic && pair[id]);
        const indicWords = new Set(inTopic.map((pair) => pair[id]));
        const englishWords = new Set(inTopic.map((pair) => pair.en));
        for (const [level, pairs] of Object.entries(PAIRS_AT)) {
          await openMatchMenu(page, site);
          await chooseLanguage(page, language);
          await page.getByRole('radio', { name: topic, exact: true }).check({ force: true });
          await startWithPeek(page, level);
          const cards = await faces(page);
          const where = `${topic}, ${level}`;
          if (cards.length !== pairs * 2) problems.push(`${where}: ${cards.length} cards, not ${pairs * 2}`);
          const indic = cards.filter((card) => card.textLang === id);
          const english = cards.filter((card) => card.textLang === null);
          if (indic.length !== pairs || english.length !== pairs) problems.push(`${where}: ${indic.length} ${language} cards and ${english.length} English cards, not ${pairs} of each`);
          for (const card of indic) if (!indicWords.has(card.text)) problems.push(`${where}: "${card.text}" is not a ${language} word of ${topic}`);
          for (const card of english) if (!englishWords.has(card.text)) problems.push(`${where}: "${card.text}" is not an English word of ${topic}`);
        }
      }
      assert.deepEqual(problems, [], `rounds with words from another topic:\n${problems.join('\n')}`);
    }));
  }

  for (const screen of ['phone', 'tinyPhone']) {
    it(`the menu with all its topics passes the accessibility checks on ${screen === 'phone' ? 'a phone' : 'the smallest phone'}`, TIMEOUT, () => scenario(env, `match topics a11y ${screen}`, { screen }, async ({ page, site }) => {
      await openMatchMenu(page, site);
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `accessibility problems:\n${problems.join('\n')}`);
    }));
  }
});
