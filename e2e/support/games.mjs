import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO } from './headers.mjs';
import { activate, button, eventually, tap, textOf } from './ui.mjs';

/**
 * Everything the browser checks know about one game. This file is the only place that does, so when a game's screens
 * change, this is the one file to touch. Each game says how to reach a round and what a first move looks like; the checks
 * (starts, 3D fallbacks, offline) are written once for all of them.
 *
 * @typedef {import('playwright').Page} Page
 * @typedef {{ mode: '2d'|'3d', touch: boolean }} ActContext
 *
 * @typedef {object} Game
 * @property {string} slug Folder name under src/games.
 * @property {string} title Name on the home page.
 * @property {null | { menu: boolean, round: boolean }} three Null for a game with no 3D version; otherwise whether the first
 *   screen is drawn in 3D (`menu`) and whether a round is (`round`). A flat first screen must not download three.js.
 * @property {string} menu Selector present once the first screen is ready, in 2D and in 3D.
 * @property {(page: Page, context: ActContext) => Promise<void>} start From the first screen to a round in progress.
 * @property {string} playing Selector present while a round is in progress, in 2D and in 3D.
 * @property {(page: Page, context: ActContext) => Promise<void>} act A first real move that must have a visible effect.
 */

/** Presses the primary button of a menu (named differently in every game). */
const press = (name) => (page) => button(page, name).click();

/** The answer to a sum the page shows, like "7 × 8" or "12 − 5". */
function solveSum(text) {
  const match = /(\d+)\s*([+−×÷-])\s*(\d+)/.exec(text);
  assert.ok(match, `no sum in "${text}"`);
  const [a, b] = [Number(match[1]), Number(match[3])];
  return { '+': a + b, '−': a - b, '-': a - b, '×': a * b, '÷': a / b }[match[2]];
}

const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

const WORDS = JSON.parse(readFileSync(resolve(REPO, 'src/games/word-builder-bubbles/data/words.json'), 'utf8'));
const WORD_BY_CLUE = new Map(WORDS.packs.flatMap((pack) => pack.words.map((entry) => [entry.clue, entry.word])));

/** @type {readonly Game[]} In the same order as the home page. */
export const GAMES = Object.freeze([
  {
    slug: 'number-ninja', title: 'Number Ninja', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/Start/),
    playing: '.play__panel',
    // Slice the first star that falls by typing its answer.
    async act(page) {
      const star = page.locator('ul.sr-only li').first();
      await star.waitFor({ state: 'attached', timeout: 20_000 });
      await page.keyboard.type(String(solveSum(await star.textContent())));
      await page.keyboard.press('Enter');
      await eventually(async () => /Score\s*[1-9]/.test(await textOf(page.locator('.hud'))), { message: 'the score to go up after a right answer' });
    },
  },
  {
    slug: 'pizza-fractions', title: 'Pizza Fractions', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/Open the shop/),
    playing: '.kitchen, .kitchen3d',
    // Pick the first slice (a button under the 3D pizza, or a slice of the flat one) and serve it.
    async act(page) {
      const chip = page.locator('.slicebar__chip').first();
      if (await chip.count()) {
        await chip.click();
      } else {
        await page.locator('.pizza__slice').first().focus();
        await page.keyboard.press('Space');
      }
      await page.locator('.kitchen__actions button').click();
      await eventually(async () => (await textOf(page.locator('.kitchen__status'))) !== '', { message: 'the customer to react' });
    },
  },
  {
    slug: 'shop-keeper', title: 'Shop Keeper', three: null,
    menu: '.menu',
    start: press(/Open the shop/),
    playing: '.drawer',
    async act(page) {
      await page.locator('.drawer .piece').first().click();
      await eventually(async () => (await page.locator('.tray__pieces .piece').count()) === 1, { message: 'a coin or note to land in the tray' });
    },
  },
  {
    slug: 'times-table-racing', title: 'Times-Table Racing', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/Start race/),
    playing: '.question',
    // Read "a × b = ?" and press the button with the right answer.
    async act(page) {
      await page.waitForFunction(() => { const b = document.querySelector('.option'); return b && !b.disabled; }, null, { timeout: 20_000 });
      const match = /^(\d+) × (\d+) = \?$/.exec(await textOf(page.locator('.question')));
      assert.ok(match, 'the question reads "a × b = ?"');
      const wanted = String(Number(match[1]) * Number(match[2]));
      const options = page.locator('.option');
      const before = await textOf(page.locator('.hud__stat'));
      for (let i = 0; i < await options.count(); i++) {
        // The button holds a small key number in its corner; the answer is the last text in it.
        if ((await options.nth(i).evaluate((b) => b.lastChild.textContent.replace(/\D/g, ''))) === wanted) {
          await options.nth(i).click();
          break;
        }
      }
      await eventually(async () => (await textOf(page.locator('.hud__stat'))) !== before, { message: 'the race to count the answer' });
    },
  },
  {
    slug: 'word-builder-bubbles', title: 'Word Builder Bubbles', three: null,
    menu: '.menu',
    start: press(/Start/),
    playing: '.slot',
    // Spell the next letter of the word the clue describes (Easy fills in the first one for the child).
    async act(page) {
      const word = WORD_BY_CLUE.get(await textOf(page.locator('.wb__clue')));
      assert.ok(word, 'the clue on screen belongs to a word in the word list');
      const filled = await page.locator('.slot.is-filled').count();
      const letter = word[filled];
      await page.waitForFunction((l) => [...document.querySelectorAll('.sr-bubble')].some((b) => b.textContent === `Bubble ${l}`), letter, { timeout: 20_000 });
      await page.keyboard.press(letter);
      await eventually(async () => (await page.locator('.slot.is-filled').count()) === filled + 1, { message: 'the letter to fill its slot' });
    },
  },
  {
    slug: 'hindi-english-match', title: 'Hindi–English Match', three: null,
    menu: '.menu',
    start: press(/Start/),
    playing: '.card3d',
    async act(page) {
      await page.locator('.card3d').first().click();
      await eventually(async () => (await page.locator('.card3d.is-up').count()) === 1, { message: 'the card to turn face up' });
    },
  },
  {
    slug: 'sentence-train', title: 'Sentence Train', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/All aboard/),
    playing: '.siding .carriage',
    // Send the first carriage from the siding onto the train.
    async act(page, { touch }) {
      await tap(page, page.locator('.siding .carriage'), { touch });
      await eventually(async () => (await page.locator('.train .slot .carriage').count()) === 1, { message: 'a carriage to join the train' });
    },
  },
  {
    slug: 'robot-path', title: 'Robot Path', three: { menu: false, round: true },
    menu: '.map',
    start: (page) => page.locator('.levelbtn[data-level="1"]').click(),
    playing: '.palette__block',
    // Level 1 is solved with four steps forward (par 4, so three stars).
    async act(page) {
      for (let i = 0; i < 4; i++) await page.locator('.palette__block[data-type="forward"]').click();
      await button(page, /^.*Run$/).click();
      await page.locator('.result').waitFor({ timeout: 25_000 });
      assert.equal(await page.locator('.result__stars').getAttribute('aria-label'), '3 out of 3 stars');
    },
  },
  {
    slug: 'pattern-detective', title: 'Pattern Detective', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/Open the case files/),
    playing: '.option',
    // Try the answer cards in order until the right one earns the stamp.
    async act(page) {
      for (let i = 0; i < 4; i++) {
        const card = page.locator('.option').nth(i);
        if (!(await card.isEnabled())) continue;
        await card.click();
        await page.waitForTimeout(150);
        if (await page.locator('.stamp').first().isVisible()) return;
      }
      assert.fail('none of the four answer cards earned the stamp');
    },
  },
  {
    slug: 'lights-out', title: 'Lights Out', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/Start/),
    playing: '.jar',
    // Tap a jar by position: in 3D that makes the picture itself pick it, and its neighbours flip with it.
    async act(page, { touch }) {
      const labels = () => page.locator('.jar').evaluateAll((jars) => jars.map((jar) => jar.getAttribute('aria-label')).join('|'));
      const before = await labels();
      await tap(page, page.locator('.jar[data-r="2"][data-c="2"]'), { touch });
      await eventually(async () => (await labels()) !== before, { message: 'the tapped jar and its neighbours to change' });
    },
  },
  {
    slug: 'flag-capital-quest', title: 'Flag & Capital Quest', three: { menu: true, round: true },
    menu: '.continent',
    start: (page) => page.locator('.continent').first().click(),
    playing: '.trip__prompt',
    async act(page) {
      if (/on the map/.test(await textOf(page.locator('.trip__prompt')))) await button(page, /Choose from a list instead/).click();
      await page.locator('.option').first().click();
      await page.locator('.trip__after .stamp-card, .trip__wrong').first().waitFor({ timeout: 10_000 });
    },
  },
  {
    slug: 'planet-hop', title: 'Planet Hop', three: { menu: false, round: true },
    menu: '.modes .mode',
    start: (page) => page.locator('.mode', { hasText: 'Line them up' }).click(),
    playing: '.pool .tile',
    // Put the first planet in its place in the line (the Easy level names them).
    async act(page) {
      const tiles = page.locator('.pool .tile');
      const before = await tiles.count();
      const name = await tiles.first().getAttribute('aria-label');
      assert.ok(PLANETS.includes(name), `Easy names the planets, got "${name}"`);
      await tiles.first().click();
      await page.locator(`.slot[data-index="${PLANETS.indexOf(name)}"]`).click();
      await eventually(async () => (await tiles.count()) === before - 1, { message: 'the planet to settle into its place' });
    },
  },
  {
    slug: 'food-chain-builder', title: 'Food Chain Builder', three: null,
    menu: '.places .place',
    start: (page) => page.locator('.place').first().click(),
    playing: '.board .card',
    async act(page) {
      const gotIt = button(page, 'Got it');
      if (await gotIt.isVisible()) await gotIt.click();
      assert.ok((await page.locator('.board .card').count()) >= 3, 'a habitat has at least three living things');
      await page.locator('.board .card').first().click();
    },
  },
  {
    slug: 'plant-grower', title: 'Plant Grower', three: { menu: false, round: true },
    menu: '.seeds .seed',
    start: (page) => page.locator('.seed:not(.is-locked)').first().click(),
    playing: '.need',
    async act(page) {
      await button(page, /Next day/).click();
      await page.locator('.summary:not([hidden])').waitFor({ timeout: 20_000 });
    },
  },
  {
    slug: 'simon-says', title: 'Simon Says', three: { menu: false, round: true },
    menu: '.menu',
    start: press(/Start/),
    playing: '.pad',
    // Watch the sequence, ask for it again, and tap a pad when it is the child's turn.
    async act(page, { touch }) {
      const status = page.locator('.simon__status');
      await page.waitForFunction(() => /Your turn/.test(document.querySelector('.simon__status')?.textContent ?? ''), null, { timeout: 40_000 });
      await button(page, /Replay/).click();
      await page.waitForFunction(() => /Watch and listen/.test(document.querySelector('.simon__status')?.textContent ?? ''), null, { timeout: 10_000 });
      await page.waitForFunction(() => /Your turn/.test(document.querySelector('.simon__status')?.textContent ?? ''), null, { timeout: 40_000 });
      await tap(page, page.locator('.pad[data-pad="0"]'), { touch });
      assert.notEqual(await textOf(status), '', 'the game still says what is going on');
    },
  },
  {
    slug: 'spot-the-difference', title: 'Spot the Difference', three: null,
    menu: '.themes .theme',
    start: (page) => page.locator('.theme').first().click(),
    playing: '.picture',
    async act(page) {
      await button(page, /Hint/).click();
      await eventually(async () => /\(1\)/.test(await textOf(button(page, /Hint/))), { message: 'the hint counter to count one used hint' });
    },
  },
  {
    slug: 'table-tower', title: 'Table Tower', three: { menu: true, round: false },
    menu: '.tower .floor',
    // The floors can sit under a 3D picture, so the keyboard opens the first one in both views.
    start: (page) => activate(page.locator('.floor', { hasText: '× 1 table' })),
    playing: '.floorpage',
    async act(page) {
      await button(page, /Learn/).click();
      await page.locator('.nl').waitFor();
      await button(page, /Jump/).click();
      await eventually(async () => (await page.locator('.nl__arc').count()) === 1, { message: 'the first jump to be drawn' });
    },
  },
  {
    slug: 'matra-mixer', title: 'Matra Mixer', three: null,
    menu: '.activities .activity',
    start: (page) => button(page, /Learn/).first().click(),
    playing: '.grid',
    async act(page) {
      assert.ok((await page.locator('.grid__cell').count()) > 100, 'the chart shows every letter with every vowel sign');
      await page.locator('.grid__cell').first().click();
    },
  },
  {
    slug: 'trace-trail', title: 'Trace Trail', three: null,
    menu: '.sets .set',
    start: (page) => page.locator('.set__play').first().click(),
    playing: '.board',
    // The pencil shows the way first.
    async act(page) {
      await page.waitForFunction(() => document.querySelector('.demo__pencil')?.getAttribute('visibility') === 'visible', null, { timeout: 15_000 });
    },
  },
]);

/**
 * The games to check: all of them, or only those named in E2E_GAMES (comma separated slugs) for a quick run on one game.
 * @param {readonly Game[]} [games]
 * @returns {readonly Game[]}
 * @throws {Error} When E2E_GAMES names a game that is not in the list.
 */
export function selectGames(games = GAMES) {
  const wanted = (process.env.E2E_GAMES ?? '').split(',').map((slug) => slug.trim()).filter(Boolean);
  if (wanted.length === 0) return games;
  const unknown = wanted.filter((slug) => !games.some((game) => game.slug === slug));
  if (unknown.length > 0) throw new Error(`E2E_GAMES names games that are not in e2e/support/games.mjs: ${unknown.join(', ')}`);
  return games.filter((game) => wanted.includes(game.slug));
}
