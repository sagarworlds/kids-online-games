// A game's menu opens on the level the child is ready for: the one after the highest they have done well on (two stars or more), with a small
// "Suggested" under it. A new child, or one still working on Easy, sees Easy and nothing extra; a grown-up's lock still decides.
//
// Games save their stars under different keys (by level, plant, theme, mode, habitat or floor), so each game says what its save looks like once
// Easy is done in EASY_DONE (e2e/support/games.mjs). A game that is missing from it fails here.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { openGame } from '../support/flow.mjs';
import { EASY_DONE, GAMES, selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';

const TIMEOUT = { timeout: 120_000 };

/** A save as the games write it, with the given stars. */
const saveWith = (bestStars) => JSON.stringify({ version: 1, bestStars, bestScore: 100, badges: [], extra: {} });

/** Puts a game's save (and, if given, the grown-up's settings) in the browser before any page runs. */
const seeded = (slug, bestStars, settings = null) => (context) => context.addInitScript(([key, save, locked]) => {
  localStorage.setItem(`kidsgames:${key}`, save);
  if (locked) localStorage.setItem('kidsgames:settings', locked);
}, [slug, bestStars ? saveWith(bestStars) : null, settings]);

/**
 * Which level the menu has chosen, which ones it points out as suggested, and which cannot be chosen. Only the level picker's own buttons are
 * read (the engine names them "level-<n>"): a menu may have other choices of the same kind beside it, such as a language or a topic.
 */
const picker = (page) => page.evaluate(() => {
  const radios = [...document.querySelectorAll('fieldset.segmented input[type="radio"]')].filter((radio) => radio.name.startsWith('level-'));
  const taggedIn = (radio) => document.querySelector(`label[for="${radio.id}"] .segmented__suggested`) !== null;
  return {
    levels: radios.map((radio) => radio.value),
    chosen: radios.find((radio) => radio.checked)?.value ?? null,
    suggested: radios.filter(taggedIn).map((radio) => radio.value),
    tags: document.querySelectorAll('.segmented__suggested').length,
    disabled: radios.filter((radio) => radio.disabled).map((radio) => radio.value),
  };
});

describe('the level a menu opens on', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('is described for every game in e2e/support/games.mjs, and for no game that does not exist', () => {
    assert.deepEqual(GAMES.filter((game) => !(game.slug in EASY_DONE)).map((game) => game.slug), [], 'every game says what its save looks like once Easy is done');
    assert.deepEqual(Object.keys(EASY_DONE).filter((slug) => !GAMES.some((game) => game.slug === slug)), [], 'and nothing is described that is not a game');
  });

  for (const game of selectGames().filter((candidate) => EASY_DONE[candidate.slug])) {
    it(`${game.title}: Easy for a new child, Medium once Easy is done well`, TIMEOUT, async () => {
      await scenario(env, `suggested ${game.slug} new`, { screen: 'desktop' }, async ({ page, site }) => {
        await openGame(page, site, game);
        const state = await picker(page);
        assert.equal(state.chosen, 'easy', 'a child who has played nothing starts on Easy');
        assert.equal(state.tags, 0, 'with nothing pointed out');
      });
      await scenario(env, `suggested ${game.slug} easy done`, { screen: 'desktop', prepare: seeded(game.slug, EASY_DONE[game.slug]) }, async ({ page, site }) => {
        await openGame(page, site, game);
        const state = await picker(page);
        assert.equal(state.chosen, 'medium', 'Easy done well opens the menu on Medium');
        assert.deepEqual(state.suggested, ['medium'], 'and Medium, only, is pointed out');
        assert.equal(state.tags, 1);
      });
    });
  }

  describe('in one game (Shop Keeper), where the stars are saved under the level\'s own name', () => {
    const SHOP = GAMES.find((game) => game.slug === 'shop-keeper');
    const opensOn = (name, bestStars, expected, settings = null) => it(name, TIMEOUT, () => scenario(env, `suggested shop ${name}`, { screen: 'desktop', prepare: seeded(SHOP.slug, bestStars, settings) }, async ({ page, site }) => {
      await openGame(page, site, SHOP);
      const state = await picker(page);
      assert.equal(state.chosen, expected.chosen);
      assert.deepEqual(state.suggested, expected.suggested);
      if (expected.disabled) assert.deepEqual(state.disabled, expected.disabled);
    }));

    opensOn('one star is not enough to move on: it stays on Easy, with nothing pointed out', { easy: 1 }, { chosen: 'easy', suggested: [] });
    opensOn('two stars is: Medium', { easy: 2 }, { chosen: 'medium', suggested: ['medium'] });
    opensOn('Medium done well as well: Hard', { easy: 3, medium: 2 }, { chosen: 'hard', suggested: ['hard'] });
    opensOn('a child who skipped ahead and did well on Medium is offered Hard, not Easy', { medium: 3 }, { chosen: 'hard', suggested: ['hard'] });
    opensOn('Medium at one star: it stays on Medium', { easy: 3, medium: 1 }, { chosen: 'medium', suggested: ['medium'] });
    opensOn(
      'a grown-up\'s lock decides, and nothing is suggested', { easy: 3, medium: 3 },
      { chosen: 'easy', suggested: [], disabled: ['medium', 'hard'] },
      JSON.stringify({ version: 1, sound: true, readAloud: false, difficultyLock: 'easy' }),
    );

    it('the tag is part of the level\'s name, and the menu with it passes the accessibility checks', TIMEOUT, () => scenario(env, 'suggested shop a11y', { screen: 'phone', prepare: seeded(SHOP.slug, { easy: 3 }) }, async ({ page, site }) => {
      await openGame(page, site, SHOP);
      const name = await page.getByRole('radio', { name: /^Medium/ }).evaluate((radio) => radio.labels[0].textContent.replace(/\s+/g, ' ').trim());
      assert.match(name, /^Medium .*Suggested$/, 'the radio button is named by its label, which says Suggested');
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `accessibility problems:\n${problems.join('\n')}`);
    }));
  });
});
