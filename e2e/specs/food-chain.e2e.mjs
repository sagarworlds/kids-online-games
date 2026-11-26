// Food Chain Builder's board, checked in the browser for every habitat the game has (the list is read from the game's own data, so a habitat that
// is added later is checked too). A card is a fixed size and the names in it differ, so a long word could be broken in the middle of the word
// ("Mudskippe" and "r"): the names are measured in the browser and shrunk to fit, which these checks keep honest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually } from '../support/ui.mjs';

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
    assert.deepEqual(await page.evaluate(wordsThatDoNotFit), [], 'the long name fits after the board was laid out again');
    assert.ok(await sizeOf(0) < stylesheetSize, 'it was shrunk, not left at the stylesheet size');
    assert.equal(await sizeOf(1), stylesheetSize, 'a name that fits is left at the stylesheet size');

    await page.setViewportSize({ width: 390, height: 844 });
    await eventually(() => page.locator('.board').evaluate((board) => board.classList.contains('board--vertical')), { message: 'the board to turn to the phone layout' });
    await settle(page);
    assert.deepEqual(await page.evaluate(wordsThatDoNotFit), [], 'and fits on the phone layout, where the cards and the text are smaller');
  }));
});
