// Food Chain Builder, checked in the browser for every habitat the game has (the list is read from the game's own data, so a habitat that is
// added later is checked too): each one can be solved through the real screens, its cards stand clear of each other on a small phone, and its
// board passes the accessibility checks. A card is a fixed size and the names in it differ, so a long word could be broken in the middle of the
// word ("Mudskippe" and "r"): the names are measured in the browser and shrunk to fit, which these checks keep honest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { LEAST_SCALE } from '../../src/games/food-chain-builder/logic/fit.js';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { button, eventually, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 240_000 };
const HABITATS = JSON.parse(readFileSync(new URL('../../src/games/food-chain-builder/data/habitats.json', import.meta.url), 'utf8')).habitats;
const GAME = '/src/games/food-chain-builder/index.html';
const SCREEN_NAMES = { desktop: 'a desktop', phone: 'a phone', smallPhone: 'a small phone' };

/** A few frames, so that a layout the page asked for (after a resize, or a change of level) has been done. */
const settle = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));

/** From the first screen to the board of one habitat, as a child does it: the level, then the place. */
async function openHabitat(page, site, habitat) {
  await page.goto(`${site.url}${GAME}`);
  await page.locator('.places .place').first().waitFor();
  await page.locator(`fieldset.segmented input[value="${habitat.level}"]`).check({ force: true });
  await page.locator(`.place--${habitat.place}`).click();
  await page.locator('.board .card').first().waitFor();
  await settle(page);
}

/**
 * The words on the board's cards that are wider than the room their card has, which the browser breaks in the middle of the word. Measured with a
 * hidden copy of each piece of the name (words, and the parts of a hyphenated word) in the font the card uses now.
 * @returns {string[]} One line per word that does not fit; none when every word does.
 */
function wordsThatDoNotFit() {
  const problems = [];
  const probe = document.createElement('span');
  document.body.append(probe);
  for (const card of document.querySelectorAll('.board .card')) {
    const name = card.querySelector('.card__name');
    const cardStyle = getComputedStyle(card);
    const room = card.clientWidth - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight);
    const nameStyle = getComputedStyle(name);
    Object.assign(probe.style, {
      position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap',
      fontStyle: nameStyle.fontStyle, fontWeight: nameStyle.fontWeight, fontSize: nameStyle.fontSize, fontFamily: nameStyle.fontFamily, letterSpacing: nameStyle.letterSpacing,
    });
    for (const piece of name.textContent.trim().split(/(?<=-)|\s+/).filter(Boolean)) {
      probe.textContent = piece;
      const width = probe.getBoundingClientRect().width;
      if (width > room) problems.push(`"${name.textContent.trim()}": "${piece}" needs ${width.toFixed(1)}px but a card has ${room.toFixed(1)}px`);
    }
  }
  probe.remove();
  return problems;
}

/**
 * The long name has been fitted as far as the game allows. A word that is still too wide is only acceptable when its name has been shrunk to
 * the smallest size it may have (a machine whose font is very wide cannot fit every long word), so this does not depend on which font the
 * machine has, and it still fails for a name that was not shrunk enough.
 *
 * @param {import('playwright').Page} page
 * @param {number} naturalSize What the stylesheet draws a name at on this board, in pixels.
 * @param {string} when Said in the failure message.
 */
async function expectFitted(page, naturalSize, when) {
  const problems = await page.evaluate(wordsThatDoNotFit);
  if (problems.length === 0) return;
  const size = await page.locator('.board .card__name').first().evaluate((name) => parseFloat(getComputedStyle(name).fontSize));
  assert.ok(size <= naturalSize * LEAST_SCALE + 0.5, `${when}: ${problems.join('; ')}, and the name is ${size.toFixed(1)}px when it may go down to ${(naturalSize * LEAST_SCALE).toFixed(1)}px`);
}

describe('the cards on the board', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  for (const screen of ['desktop', 'phone', 'smallPhone']) {
    it(`every name fits its card in every habitat, on ${SCREEN_NAMES[screen]}`, TIMEOUT, () => scenario(env, `food chain names ${screen}`, { screen }, async ({ page, site }) => {
      const problems = [];
      for (const habitat of HABITATS) {
        await openHabitat(page, site, habitat);
        for (const line of await page.evaluate(wordsThatDoNotFit)) problems.push(`${habitat.id}: ${line}`);
      }
      assert.deepEqual(problems, [], `words broken in the middle:\n${problems.join('\n')}`);
    }));
  }

  it('a long name is shrunk to fit, and fitted again when the board changes shape or size', TIMEOUT, () => scenario(env, 'food chain refit', { screen: 'desktop' }, async ({ page, site }) => {
    await openHabitat(page, site, HABITATS.find((habitat) => habitat.id === 'grassland-easy'));
    const sizeOf = (index) => page.locator('.board .card__name').nth(index).evaluate((name) => parseFloat(getComputedStyle(name).fontSize));
    const stylesheetSize = await sizeOf(1);

    // A name that no habitat has, so the check does not depend on the data: far wider than a card.
    await page.locator('.board .card__name').first().evaluate((name) => { name.textContent = 'Mudskippers'; });
    // The board is laid out again when its size changes. It stops growing at 940px, so the window has to get narrower than that.
    await page.setViewportSize({ width: 900, height: 800 });
    await settle(page);
    assert.ok(await sizeOf(0) < stylesheetSize, 'it was shrunk, not left at the stylesheet size');
    await expectFitted(page, stylesheetSize, 'the long name after the board was laid out again');
    assert.equal(await sizeOf(1), stylesheetSize, 'a name that fits is left at the stylesheet size');

    await page.setViewportSize({ width: 390, height: 844 });
    await eventually(() => page.locator('.board').evaluate((board) => board.classList.contains('board--vertical')), { message: 'the board to turn to the phone layout' });
    await settle(page);
    await expectFitted(page, await sizeOf(1), 'and on the phone layout, where the cards and the text are smaller');
    assert.ok(await sizeOf(0) < await sizeOf(1), 'it is still smaller than the names that fit');
  }));

  it('every habitat can be solved by drawing its arrows, and a Hard one by answering its What if', TIMEOUT, () => scenario(env, 'food chain solve all', { screen: 'desktop' }, async ({ page, site }) => {
    for (const habitat of HABITATS) {
      const where = habitat.id;
      await openHabitat(page, site, habitat);
      // Tap the food, then the one that eats it: the way a keyboard does it, and the same arrows a drag draws.
      for (const { from, to } of habitat.required) {
        await page.locator(`.cardwrap[data-id="${from}"] .card`).click();
        await page.locator(`.cardwrap[data-id="${to}"] .card`).click();
      }
      assert.match(await textOf(page.locator('.build__count')), new RegExp(`Arrows drawn: ${habitat.required.length} of ${habitat.required.length}`), where);
      await button(page, /Check/).click();
      await page.locator('.board.is-alive').waitFor();
      assert.equal(await textOf(page.locator('.build__status')), 'The food web is complete and it comes alive!', where);
      await page.locator('.build__after button').click();

      if (habitat.whatIf) {
        // The answers the data gives (the unit tests prove they follow the one-step rule); the screen has to take them all.
        for (const [id, effect] of Object.entries(habitat.whatIf.effects)) await page.locator(`input[name="predict-${id}"][value="${effect}"]`).check({ force: true });
        await button(page, /Check my answers/).click();
        const asked = Object.keys(habitat.whatIf.effects).length;
        assert.equal(await textOf(page.locator('.whatif__score')), `${asked} of ${asked} right.`, where);
        await button(page, /See my results/).click();
      }
      await page.locator('.result').waitFor();
      assert.equal(await page.locator('.result__stars').getAttribute('aria-label'), '3 out of 3 stars', `${where}: nothing wrong at the first check, so three stars`);
      const save = JSON.parse(await page.evaluate(() => localStorage.getItem('kidsgames:food-chain-builder')));
      assert.equal(save.bestStars[habitat.id], 3, `${where}: the stars are saved under the habitat's id`);
    }
  }));

  it('the cards of every habitat stand inside the board and clear of each other on a small phone', TIMEOUT, () => scenario(env, 'food chain cards clear', { screen: 'smallPhone' }, async ({ page, site }) => {
    const problems = [];
    for (const habitat of HABITATS) {
      await openHabitat(page, site, habitat);
      const { board, cards } = await page.evaluate(() => {
        const box = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        return { board: box(document.querySelector('.board')), cards: [...document.querySelectorAll('.board .card')].map((card) => ({ name: card.querySelector('.card__name').textContent.trim(), ...box(card) })) };
      });
      for (const card of cards) {
        if (card.left < board.left || card.right > board.right || card.top < board.top || card.bottom > board.bottom) problems.push(`${habitat.id}: ${card.name} sticks out of the board`);
      }
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const across = Math.min(cards[i].right, cards[j].right) - Math.max(cards[i].left, cards[j].left);
          const down = Math.min(cards[i].bottom, cards[j].bottom) - Math.max(cards[i].top, cards[j].top);
          if (across > 1 && down > 1) problems.push(`${habitat.id}: ${cards[i].name} and ${cards[j].name} overlap`);
        }
      }
    }
    assert.deepEqual(problems, [], `cards on top of each other or off the board:\n${problems.join('\n')}`);
  }));

  it('the busiest board of each place (its Hard habitat) passes the accessibility checks on a phone', TIMEOUT, () => scenario(env, 'food chain a11y', { screen: 'phone' }, async ({ page, site }) => {
    for (const habitat of HABITATS.filter((candidate) => candidate.level === 'hard')) {
      await openHabitat(page, site, habitat);
      const problems = await problemsOnScreen(page);
      assert.equal(problems.length, 0, `${habitat.id}: accessibility problems:\n${problems.join('\n')}`);
    }
  }));
});
