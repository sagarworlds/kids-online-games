// When one screen replaces another (a menu opens a round, a round goes back to its menu) the control that was pressed goes with the old
// screen, and the keyboard focus falls back to the page: a screen reader says nothing about the new screen and a keyboard user starts again
// from the top. The engine puts the focus on the new screen's heading instead (`focusScreenHeading`, src/engine/ui/focusScreen.js).
//
// This checks it on every game: the first screen of a page leaves the focus alone, a round with a visible heading takes the focus onto it (a
// heading is not a control, so it is not in the Tab order and shows no ring), a screen that put the focus on a control itself keeps it, and a
// screen with no heading leaves it on the page. With a keyboard, the next Tab goes on from the heading. The last block checks the checks.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { openGame, startRound } from '../support/flow.mjs';
import { GAMES, selectGames } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';

const TIMEOUT = { timeout: 120_000 };

/**
 * How many rounds must have their heading take the focus for a full run to count as having looked at anything (9 of the 19 do today). If
 * the engine stopped moving the focus, those games would fail one by one; but a mistake in this check that made it see no heading anywhere
 * would pass them all, so the last check of the first block wants a good number of them.
 */
const MIN_ROUNDS_WITH_A_HEADING = 5;

/**
 * Where the keyboard focus is, and which heading the screen on top has: the first visible level-one heading, or else the first visible
 * level-two one, which is the one `focusScreenHeading` is meant to pick. The screen on top is the last scene that shows (a scene under
 * another is hidden).
 *
 * @param {import('playwright').Page} page
 */
const readFocus = (page) => page.evaluate(() => {
  const name = (element) => `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''} "${(element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
  const screen = [...document.querySelectorAll('.scene')].filter((scene) => !scene.hidden).at(-1);
  const shown = (heading) => !heading.closest('[hidden]');
  const heading = screen ? ([...screen.querySelectorAll('h1')].find(shown) ?? [...screen.querySelectorAll('h2')].find(shown) ?? null) : null;
  const holder = document.activeElement;
  const onPage = !holder || holder === document.body || holder === document.documentElement;
  const style = onPage ? null : getComputedStyle(holder);
  return {
    heading: heading ? name(heading) : null,
    focus: onPage ? null : name(holder),
    onHeading: heading !== null && holder === heading,
    onAHeading: !onPage && /^H[1-6]$/.test(holder.tagName),
    tabindex: onPage ? null : holder.getAttribute('tabindex'),
    focusVisible: onPage ? false : holder.matches(':focus-visible'),
    // A ring is an outline that has a style and a width (a style of "none" keeps the width it had) or a shadow: see `look` in support/a11y.mjs.
    ring: onPage ? false : (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none',
  };
});

/**
 * The first screen of a page: nothing has moved the focus onto a heading, because a page that has just loaded starts at its top (a screen
 * may put the focus on a control itself, as Robot Path's map does for the next level).
 */
function assertLeftAlone(found, where) {
  assert.equal(found.onAHeading, false, `${where}: the focus is on ${found.focus}, but a page that has just loaded starts at its top`);
}

/**
 * A screen that has just replaced another. With a visible heading and nothing else holding the focus, the heading takes it, is not in the
 * Tab order and shows no ring. Otherwise the focus is left alone: a control the screen focused itself keeps it, and a screen with no visible
 * heading (or only a hidden one, like the "Paused" card) leaves it on the page. Call it with the keyboard in use, which is when a ring shows.
 *
 * @returns {boolean} Whether the heading took the focus.
 */
function assertFocusMovedIn(found, where) {
  if (found.onHeading) {
    assert.equal(found.tabindex, '-1', `${where}: the heading has the focus because a script gave it, so it is not a Tab stop (tabindex -1)`);
    assert.equal(found.focusVisible, true, `${where}: the keyboard was in use when the heading took the focus, so a ring would show if the page let it (if this fails, the check's own set-up is off)`);
    assert.equal(found.ring, false, `${where}: the heading shows no ring, since it is not a control`);
    return true;
  }
  assert.equal(found.onAHeading, false, `${where}: the focus is on ${found.focus}, which is not the first heading of the screen (${found.heading})`);
  assert.ok(found.heading === null || found.focus !== null, `${where}: the screen has a heading (${found.heading}) but the keyboard focus is still on the page`);
  return false;
}

describe('the focus when one screen replaces another', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});
  /** The games whose round had its heading take the focus. */
  const tookTheFocus = new Set();

  before(async () => {
    env.site = await startSite();
    // No WebGL: every game opens its flat screens at once, which are the screens a 3D game shows too. In 3D a slow load first puts up a
    // "getting ready" screen (`openScreen`), and the real first screen then replaces it, which would make "the first screen" depend on speed.
    env.browser = await launchBrowser({ webgl: false });
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  for (const game of selectGames()) {
    it(`${game.title}: a round${game.back ? ' and the way back' : ''}`, TIMEOUT, () => scenario(env, `focus ${game.slug}`, { screen: 'desktop' }, async ({ page, site, touch }) => {
      await openGame(page, site, game);
      assertLeftAlone(await readFocus(page), `${game.title}, the first screen`);

      await startRound(page, game, { mode: '2d', touch });
      // The round was opened with a click, which keeps the focus ring off a heading. A key press puts the page in keyboard mode, which is
      // how a keyboard user meets it, and it is where a ring would show.
      await page.keyboard.press('Shift');
      if (assertFocusMovedIn(await readFocus(page), `${game.title}, the round`)) tookTheFocus.add(game.slug);

      if (game.back) {
        await game.back(page);
        await page.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
        await page.keyboard.press('Shift');
        assertFocusMovedIn(await readFocus(page), `${game.title}, back on the first screen`);
      }
    }));
  }

  it('with a keyboard, Enter on the start button lands on the new heading with no ring, and Tab goes on from there', TIMEOUT, () => scenario(env, 'focus keyboard', { screen: 'desktop' }, async ({ page, site }) => {
    const game = GAMES.find((candidate) => candidate.slug === 'pizza-fractions');
    await openGame(page, site, game);
    // While the page itself has the focus, its text is every word on screen, "Open the shop" included, so it must not count as the button.
    const focusedText = () => page.evaluate(() => {
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused === document.documentElement) return '';
      return (focused.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
    // Tab on from the top of the page to the start button, as a keyboard user does.
    for (let press = 0; press < 12 && !/Open the shop/.test(await focusedText()); press++) await page.keyboard.press('Tab');
    assert.match(await focusedText(), /Open the shop/, 'Tab reaches the start button');
    await page.keyboard.press('Enter');
    await page.locator(game.playing).first().waitFor({ timeout: 25_000 });

    // No key press to switch the keyboard on this time: it has been in use all along.
    assert.equal(assertFocusMovedIn(await readFocus(page), 'Pizza Fractions, started with Enter'), true, 'the heading of the round has the focus');

    // The next Tab goes on from the heading into the round, not back to the Home link at the top of the page.
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => ({ inTopBar: Boolean(document.activeElement?.closest('.hud')), inScreen: Boolean(document.activeElement?.closest('.scene')) }));
    assert.deepEqual(next, { inTopBar: false, inScreen: true }, 'Tab goes on from the heading, inside the round');
  }));

  it('looked at rounds that have a heading, so the checks above cannot pass by looking at nothing', { skip: process.env.E2E_GAMES ? 'only some of the games ran' : false }, () => {
    assert.ok(tookTheFocus.size >= MIN_ROUNDS_WITH_A_HEADING,
      `the heading took the focus in ${tookTheFocus.size} rounds (${[...tookTheFocus].join(', ') || 'none'}), and at least ${MIN_ROUNDS_WITH_A_HEADING} were expected`);
  });
});

describe('the focus check itself', () => {
  /** What `readFocus` reports for a screen with a heading when the focus never left the page. */
  const found = (changes = {}) => ({ heading: 'h2 "Pick a topping"', focus: null, onHeading: false, onAHeading: false, tabindex: null, focusVisible: true, ring: false, ...changes });
  const onTheHeading = { focus: 'h2 "Pick a topping"', onHeading: true, onAHeading: true, tabindex: '-1' };

  it('accepts a heading that has the focus with no ring, a control the screen focused itself, and a screen with no heading', () => {
    assert.equal(assertFocusMovedIn(found(onTheHeading), 'screen'), true);
    assert.equal(assertFocusMovedIn(found({ focus: 'button.jar ""' }), 'screen'), false);
    assert.equal(assertFocusMovedIn(found({ heading: null }), 'screen'), false);
  });

  it('finds a heading that the focus never reached', () => {
    assert.throws(() => assertFocusMovedIn(found(), 'screen'), /still on the page/);
  });

  it('finds a heading that shows a ring, one that is a Tab stop, and the focus on the wrong heading', () => {
    assert.throws(() => assertFocusMovedIn(found({ ...onTheHeading, ring: true }), 'screen'), /shows no ring/);
    assert.throws(() => assertFocusMovedIn(found({ ...onTheHeading, tabindex: '0' }), 'screen'), /not a Tab stop/);
    assert.throws(() => assertFocusMovedIn(found({ focus: 'h2 "Another"', onAHeading: true }), 'screen'), /not the first heading/);
  });

  it('finds a heading that took the focus on the first screen of a page', () => {
    assert.throws(() => assertLeftAlone(found(onTheHeading), 'first screen'), /starts at its top/);
    assert.doesNotThrow(() => assertLeftAlone(found({ focus: 'button.levelbtn "1"' }), 'first screen'));
  });
});
