import assert from 'node:assert/strict';
import { looksDrawn, measureCanvas } from './pixels.mjs';
import { eventually, textOf } from './ui.mjs';
import { CANVAS } from './webgl.mjs';

/** Where a game's page lives on the served site. */
export const gameUrl = (site, game) => `${site.url}/src/games/${game.slug}/index.html`;

/** Opens a game's page and waits for its first screen. */
export async function openGame(page, site, game) {
  await page.goto(gameUrl(site, game));
  await page.locator(game.menu).first().waitFor({ state: 'attached', timeout: 20_000 });
}

/**
 * Which view the game is in, read from the toggle button, which names the view it would switch TO ("2D view" while 3D is showing).
 * @returns {Promise<'2d'|'3d'>}
 */
export async function currentView(page) {
  return /2D view/.test(await textOf(page.locator('.view-toggle'))) ? '3d' : '2d';
}

/** Switches the game to `mode` with the toggle on its first screen, as a child would, and waits for the screen to redraw. */
export async function switchView(page, mode) {
  await page.locator('.view-toggle').waitFor({ timeout: 10_000 });
  if ((await currentView(page)) === mode) return;
  await page.locator('.view-toggle').click();
  await eventually(async () => (await currentView(page)) === mode, { message: `the toggle to switch to the ${mode.toUpperCase()} view` });
}

/** From the first screen to a round in progress. */
export async function startRound(page, game, context) {
  await game.start(page, context);
  await page.locator(game.playing).first().waitFor({ timeout: 25_000 });
}

/** The 3D picture is on screen and shows something (not a blank or broken canvas). */
export async function expectPicture(page) {
  await page.locator(CANVAS).first().waitFor({ state: 'visible', timeout: 25_000 });
  let measure;
  await eventually(async () => {
    measure = await measureCanvas(page);
    return looksDrawn(measure);
  }, { timeout: 20_000, message: `the 3D canvas to show a picture (last look: ${JSON.stringify(measure)})` });
}

/** No 3D canvas is on the page: the flat view is showing. */
export async function expectFlat(page) {
  assert.equal(await page.locator(CANVAS).count(), 0, 'the flat view has no 3D canvas');
  assert.equal(await page.locator('.error-screen').count(), 0, 'no error screen');
}

/** The 3D canvas sits inside the screen, wide enough to see, and the page does not scroll sideways. */
export async function expectFitsScreen(page) {
  const { width, height } = page.viewportSize();
  const box = await page.locator(CANVAS).first().boundingBox();
  assert.ok(box, 'the canvas has a size on screen');
  assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `the canvas fits across the ${width}px screen (x ${box.x}, width ${box.width})`);
  assert.ok(box.height >= Math.min(120, height / 5), `the canvas is tall enough to see (${box.height}px)`);
}
