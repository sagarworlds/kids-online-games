// The Matra Mixer chart has a button in each of its 400 or so cells. For a keyboard it has to be one Tab stop (not 400) with the arrow keys
// moving through it, as the ARIA data-grid pattern does and as the Hindi–English Match cards and the Lights Out cells already do.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { tabStops } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { openGame, startRound } from '../support/flow.mjs';
import { GAMES } from '../support/games.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';

const TIMEOUT = { timeout: 120_000 };
const GAME = GAMES.find((game) => game.slug === 'matra-mixer');

/** Where the keyboard focus is in the chart, as row and column (the letter column does not count), or null when it is not on a cell. */
const where = (page) => page.evaluate(() => {
  const cell = document.activeElement;
  if (!cell?.matches('.grid__cell')) return null;
  const td = cell.closest('td');
  const row = td.parentElement;
  return { row: [...row.parentElement.children].indexOf(row), col: [...row.children].indexOf(td) - 1 };
});

/** How many rows and columns the chart has. */
const size = (page) => page.evaluate(() => ({
  rows: document.querySelectorAll('.grid tbody tr').length,
  cols: document.querySelectorAll('.grid thead th').length - 1,
}));

describe('the Matra Mixer chart with a keyboard', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  it('is one Tab stop, and the arrow keys, Home, End and the page keys move through it', TIMEOUT, () => scenario(env, 'matra-mixer chart keys', { screen: 'desktop' }, async ({ page, site }) => {
    await openGame(page, site, GAME);
    await startRound(page, GAME, { mode: '2d', touch: false });
    const { rows, cols } = await size(page);
    assert.ok(rows > 20 && cols >= 12, `the chart has its letters and vowel signs (${rows} x ${cols})`);

    // One cell is in the Tab order, however many the chart has.
    const stops = await tabStops(page, { limit: 40 });
    assert.equal(stops.filter((stop) => stop.tag.startsWith('button.grid__cell')).length, 1, 'only one cell is a Tab stop');
    assert.ok(stops.length < 15, `Tab gets through the whole screen in a few presses (${stops.length} stops)`);
    assert.equal(await page.locator('.grid__cell[tabindex="0"]').count(), 1, 'exactly one cell is tabbable');

    // Tab brings the focus to the first cell.
    await page.evaluate(() => { document.activeElement?.blur(); document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
    for (let press = 0; press < 15 && !(await where(page)); press++) await page.keyboard.press('Tab');
    assert.deepEqual(await where(page), { row: 0, col: 0 }, 'Tab reaches the first cell of the chart');

    const press = async (key, expected, message) => {
      await page.keyboard.press(key);
      assert.deepEqual(await where(page), expected, message);
    };
    await press('ArrowRight', { row: 0, col: 1 }, 'Right moves one cell along');
    await press('ArrowDown', { row: 1, col: 1 }, 'Down moves one row down');
    await press('ArrowLeft', { row: 1, col: 0 }, 'Left moves one cell back');
    await press('ArrowLeft', { row: 1, col: 0 }, 'Left at the start of a row stays (it does not wrap to the row above)');
    await press('ArrowUp', { row: 0, col: 0 }, 'Up moves one row up');
    await press('ArrowUp', { row: 0, col: 0 }, 'Up at the top stays');
    await press('End', { row: 0, col: cols - 1 }, 'End goes to the end of the row');
    await press('ArrowRight', { row: 0, col: cols - 1 }, 'Right at the end of a row stays');
    await press('Home', { row: 0, col: 0 }, 'Home goes to the start of the row');
    await press('PageDown', { row: 5, col: 0 }, 'Page Down moves five rows');
    await press('PageUp', { row: 0, col: 0 }, 'Page Up moves five rows back');
    await page.keyboard.press('Control+End');
    assert.deepEqual(await where(page), { row: rows - 1, col: cols - 1 }, 'Ctrl+End goes to the last cell of the chart');
    await page.keyboard.press('Control+Home');
    assert.deepEqual(await where(page), { row: 0, col: 0 }, 'Ctrl+Home goes to the first cell');

    // The cell with the focus is the one in the Tab order, and the page does not scroll sideways under the chart.
    await press('ArrowDown', { row: 1, col: 0 }, 'back on the second row');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('tabindex')), '0', 'the cell with the focus is the Tab stop');
    assert.equal(await page.locator('.grid__cell[tabindex="0"]').count(), 1, 'and it is the only one');

    // Enter picks the cell and shows it.
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.grid__cell.is-picked').count(), 1, 'Enter picks a cell');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('is-picked')), true, 'it is the cell that had the focus');
    assert.ok((await page.locator('.detail__big').textContent()).trim().length > 0, 'its syllable is shown big');

    // Tab leaves the chart, and Shift+Tab comes back to the same cell.
    await page.keyboard.press('Tab');
    assert.equal(await where(page), null, 'Tab leaves the chart');
    await page.keyboard.press('Shift+Tab');
    assert.deepEqual(await where(page), { row: 1, col: 0 }, 'Shift+Tab comes back to the cell the focus left');
  }));

  it('a click moves the Tab stop to the cell that was clicked', TIMEOUT, () => scenario(env, 'matra-mixer chart click', { screen: 'desktop' }, async ({ page, site }) => {
    await openGame(page, site, GAME);
    await startRound(page, GAME, { mode: '2d', touch: false });
    const target = page.locator('.grid tbody tr').nth(3).locator('.grid__cell').nth(2);
    await target.click();
    assert.equal(await target.getAttribute('tabindex'), '0', 'the clicked cell is the Tab stop');
    assert.equal(await page.locator('.grid__cell[tabindex="0"]').count(), 1, 'and the only one');
  }));
});
