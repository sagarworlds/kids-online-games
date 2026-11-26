// Hindi–English Match's card grid on every kind of screen, at every level: every card is on the screen (a child can tap it without sliding the
// page sideways), at least 48px each way, and none sits on another. A card has a smallest size, so a screen that cannot hold the level's number of
// columns has to give the grid fewer columns and more rows; this keeps that honest. Only positions and sizes are measured, so the machine's font
// does not matter.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';

const TIMEOUT = { timeout: 180_000 };
const GAME = '/src/games/hindi-english-match/index.html';
/** The pairs each level deals (the game's levels.js says the same: 6, 8 and 10 pairs, two cards each). */
const CARDS = { easy: 12, medium: 16, hard: 20 };
const MIN_TAP = 48;
const SCREEN_NAMES = { desktop: 'a desktop', phone: 'a phone', smallPhone: 'a small phone', tinyPhone: 'the smallest phone' };

/**
 * Where every card is, in the page's own pixels, and how wide the page it sits in is.
 * @returns {{ width: number, scrolls: boolean, cards: { left: number, right: number, top: number, bottom: number }[] }}
 */
function measureCards() {
  const scene = document.querySelector('.scene');
  return {
    width: window.innerWidth,
    // The scene can scroll sideways when something in it is wider than the screen; that is what a clipped column looks like.
    scrolls: scene.scrollWidth > scene.clientWidth + 1,
    cards: [...document.querySelectorAll('.card3d')].map((card) => {
      const r = card.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  };
}

describe('the card grid', () => {
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
    it(`on ${SCREEN_NAMES[screen]}, every card of every level is on the screen, big enough to tap, and clear of the others`, TIMEOUT, () => scenario(env, `match grid ${screen}`, { screen }, async ({ page, site }) => {
      const problems = [];
      for (const [level, count] of Object.entries(CARDS)) {
        await page.goto(`${site.url}${GAME}`);
        await page.locator('.menu').waitFor();
        await page.locator(`fieldset.segmented input[value="${level}"]`).check({ force: true });
        await page.getByRole('button', { name: /Start/ }).click();
        await page.locator('.card3d').first().waitFor();
        const { width, scrolls, cards } = await page.evaluate(measureCards);

        if (cards.length !== count) problems.push(`${level}: ${cards.length} cards, not ${count}`);
        if (scrolls) problems.push(`${level}: the page can be slid sideways, so some cards are off the screen`);
        cards.forEach((card, i) => {
          if (card.left < -0.5 || card.right > width + 0.5) problems.push(`${level}: card ${i + 1} is off the screen (${Math.round(card.left)} to ${Math.round(card.right)} of ${width})`);
          if (card.right - card.left < MIN_TAP || card.bottom - card.top < MIN_TAP) problems.push(`${level}: card ${i + 1} is ${Math.round(card.right - card.left)} by ${Math.round(card.bottom - card.top)}px, under ${MIN_TAP}`);
        });
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            const across = Math.min(cards[i].right, cards[j].right) - Math.max(cards[i].left, cards[j].left);
            const down = Math.min(cards[i].bottom, cards[j].bottom) - Math.max(cards[i].top, cards[j].top);
            if (across > 1 && down > 1) problems.push(`${level}: cards ${i + 1} and ${j + 1} overlap`);
          }
        }
      }
      assert.deepEqual(problems, [], `the grid does not fit:\n${problems.join('\n')}`);
    }));
  }
});
