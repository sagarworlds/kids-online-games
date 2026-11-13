import { CANVAS } from './webgl.mjs';

/**
 * Measures whether a canvas shows a picture rather than a blank (all one colour) or a broken one.
 * It takes a screenshot of the canvas, which captures what the screen would show, shrinks it, and counts colours.
 *
 * @param {import('playwright').Page} page
 * @param {string} [selector]
 * @returns {Promise<{ colours: number, biggestShare: number }>} `colours`: distinct colours (16 levels per channel);
 *   `biggestShare`: the share of the picture the most common colour covers, 0 to 1.
 */
export async function measureCanvas(page, selector = CANVAS) {
  const png = await page.locator(selector).first().screenshot();
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const side = 64; // plenty to tell a picture from a blank, and cheap to scan
    const scratch = new OffscreenCanvas(side, side);
    const context = scratch.getContext('2d');
    context.drawImage(bitmap, 0, 0, side, side);
    const { data } = context.getImageData(0, 0, side, side);
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { colours: counts.size, biggestShare: Math.max(...counts.values()) / (side * side) };
  }, png.toString('base64'));
}

/**
 * A canvas that shows a picture: more than a few colours and no single colour filling nearly all of it.
 * @param {{ colours: number, biggestShare: number }} measure
 */
export const looksDrawn = ({ colours, biggestShare }) => colours >= 5 && biggestShare < 0.985;
