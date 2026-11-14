// Matra Mixer shows Devanagari on every screen: the letters of the chart, the syllables to build and pop, the words to read, the sums it
// says when you answer, the results. A screen reader reads Devanagari with its English voice unless the text says its language (WCAG
// 3.1.2), which is gibberish, so every piece has to carry `lang`, and the right one: the language a grown-up chose, Hindi or Marathi.
//
// The accessibility spec only meets the menu and the chart (in Hindi). This one visits every screen in both languages: the menu with its
// language panel, the chart and the matra station, and each of the three activities at its first round, after a try and on its results.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { unmarkedHindi } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { openGame } from '../support/flow.mjs';
import { GAMES } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { button } from '../support/ui.mjs';

const TIMEOUT = { timeout: 180_000 };
const GAME = GAMES.find((game) => game.slug === 'matra-mixer');

/** The language panel names both languages (and the Marathi names of the vowel sets), so it is the one part that is not in the chosen one. */
const PANEL = '.prefs';

const LANGUAGES = [{ id: 'hi', name: 'Hindi' }, { id: 'mr', name: 'Marathi' }];

const ACTIVITIES = [
  { kind: 'build', card: /^Build the sound/ },
  { kind: 'bubbles', card: /^Bubble pop/ },
  { kind: 'words', card: /^Read words/ },
];

/**
 * Fails when any Devanagari on the screen has no language, or (outside the panel) is marked with the other language.
 *
 * @param {import('playwright').Page} page
 * @param {'hi'|'mr'} language The language the game is set to.
 * @param {string} where Which screen, for the message.
 */
async function assertMarked(page, language, where) {
  const gaps = [...new Set([
    ...await unmarkedHindi(page),
    ...await unmarkedHindi(page, { language, skip: PANEL }),
  ])];
  assert.deepEqual(gaps, [], `${where}, set to ${language}: Devanagari with no language or the wrong one:\n  ${gaps.slice(0, 8).join('\n  ')}${gaps.length > 8 ? `\n  ... and ${gaps.length - 8} more` : ''}`);
}

/** A grown-up opens the language panel on the menu and picks the language. */
async function chooseLanguage(page, language) {
  await page.locator(`${PANEL} summary`).click();
  // The radio button lies invisibly over its label (a segmented choice), so it is what a finger touches, and what a click must go to.
  const radio = page.locator(`${PANEL} input[name$="-lang"][value="${language}"]`);
  await radio.check();
  assert.equal(await radio.isChecked(), true, `${language} is chosen`);
}

/** The chart, a picked syllable, the matra station and a mixed syllable, then back to the menu. */
async function visitLearn(page, language) {
  await button(page, /^Learn/).click();
  await page.locator('.grid').waitFor();
  await assertMarked(page, language, 'the chart');
  await page.locator('.grid__cell').first().click();
  await assertMarked(page, language, 'the chart, with a syllable picked');
  await page.getByRole('tab', { name: /Matra station/ }).click();
  await page.locator('.mixer').waitFor();
  await assertMarked(page, language, 'the matra station');
  await page.locator('.mixer .tile--sign').first().click();
  await assertMarked(page, language, 'the matra station, with a syllable mixed');
  await button(page, /Back to the menu/).click();
  await page.locator(GAME.menu).first().waitFor();
}

/** One try at the round on screen, always with the first choice: some are wrong, which is what puts items on the results screen. */
async function tryOnce(page, kind) {
  if (kind === 'build') {
    await page.locator('.tile--consonant:not([disabled])').first().click();
    await page.locator('.tile--sign:not([disabled])').first().click();
    await button(page, /^Check$/).click();
  } else if (kind === 'bubbles') {
    await page.locator('.bubble:not([disabled])').first().click();
  } else {
    await page.locator('.picture:not([disabled])').first().click();
  }
}

/** Plays the run to its results screen: a try, then Next (or "See my stars" at the end), until the results show. */
async function playToTheEnd(page, kind) {
  const next = button(page, /^(Next|See my stars)$/);
  for (let step = 0; step < 150 && (await page.locator('.result').count()) === 0; step++) {
    if (await next.isVisible()) await next.click();
    else await tryOnce(page, kind);
  }
  await page.locator('.result').waitFor({ timeout: 10_000 });
}

/** An activity at its first round, after a try and on its results, then back to the menu. */
async function visitActivity(page, language, { kind, card }) {
  await button(page, card).click();
  await page.locator('.run').waitFor();
  await assertMarked(page, language, `${kind}, the first round`);
  await tryOnce(page, kind);
  await assertMarked(page, language, `${kind}, after a try`);
  await playToTheEnd(page, kind);
  await assertMarked(page, language, `${kind}, the results`);
  await button(page, /^Menu$/).click();
  await page.locator(GAME.menu).first().waitFor();
}

describe('the language of the Devanagari in Matra Mixer', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  for (const { id, name } of LANGUAGES) {
    // Reduced motion: the bubbles of Bubble pop bob up and down for ever, and a click waits for its target to hold still.
    it(`${name}: every screen says its language (${id})`, TIMEOUT, () => scenario(env, `matra-mixer language ${id}`, { screen: 'desktop', contextOptions: { reducedMotion: 'reduce' } }, async ({ page, site }) => {
      await openGame(page, site, GAME);
      await chooseLanguage(page, id);
      await assertMarked(page, id, 'the menu');
      await visitLearn(page, id);
      for (const activity of ACTIVITIES) await visitActivity(page, id, activity);
    }));
  }
});
