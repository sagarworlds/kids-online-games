import assert from 'node:assert/strict';

/** Waits until `check` stops throwing and does not return false, like a polling assertion. Resolves with what `check` returned. */
export async function eventually(check, { timeout = 10_000, interval = 100, message = 'the condition' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      const result = await check();
      if (result !== false) return result;
      last = new Error('the check returned false');
    } catch (error) {
      last = error;
    }
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeout} ms waiting for ${message} (${last.message})`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/** A button by its accessible name. */
export const button = (page, name) => page.getByRole('button', { name });

/** The text of the first element that matches, with runs of white space squeezed to one space. */
export async function textOf(locator) {
  return ((await locator.first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Taps the middle of an element by position, the way a finger does. In a 3D view the flat control under the picture lets
 * the tap through, so this proves the picture itself picks the right object; in a flat view it simply presses the control.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 * @param {{ touch?: boolean }} [options] Tap with a touch screen instead of the mouse.
 */
export async function tap(page, locator, { touch = false } = {}) {
  await locator.first().scrollIntoViewIfNeeded();
  const box = await locator.first().boundingBox();
  assert.ok(box, 'the element to tap has no size on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Presses a control with the keyboard: focus, then Enter. Works on controls that sit under a 3D picture and have no size to tap. */
export async function activate(locator, key = 'Enter') {
  await locator.first().focus();
  await locator.page().keyboard.press(key);
}

/**
 * Answers the grown-ups' check (a times-table question) that opens first, and presses Continue.
 * @param {import('playwright').Page} page A page with the check open.
 */
export async function answerGrownUpCheck(page) {
  const question = /what is (\d+) × (\d+)\?/.exec(await page.locator('label[for="parent-answer"]').textContent());
  assert.ok(question, 'the grown-ups\' check asks a times-table question');
  await page.locator('#parent-answer').fill(String(Number(question[1]) * Number(question[2])));
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** The page does not scroll sideways (a sign a layout overflowed the screen). */
export const fitsWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/**
 * The shared top bar (Home, title, stats, settings): how tall it is, and whether everything in it is inside the screen.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ height: number, inside: boolean, hasTitleText: boolean }>}
 */
export function topBar(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.hud');
    if (!bar) throw new Error('this screen has no top bar (.hud)');
    // A visually hidden title is taken out of the layout on purpose, so only what takes up room counts.
    const shown = [...bar.children].filter((child) => getComputedStyle(child).position !== 'absolute');
    const right = Math.max(...shown.map((child) => child.getBoundingClientRect().right));
    return {
      height: Math.round(bar.getBoundingClientRect().height),
      inside: right <= window.innerWidth + 1,
      hasTitleText: (bar.querySelector('.hud__title')?.textContent ?? '').trim().length > 0,
    };
  });
}
