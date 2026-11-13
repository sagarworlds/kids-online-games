/** Ways to make 3D fail the way it can fail on a real phone. Each has its own matching "expected" log pattern. */

/** The canvas every 3D view in the site draws on (`Stage3D`). */
export const CANVAS = 'canvas.stage3d__canvas';

/**
 * What a game is expected to log (and the browser to report) for each kind of failure, so a check can tell the failure it
 * caused on purpose from a real problem. Everything else the page reports still fails the check.
 */
export const EXPECTED = Object.freeze({
  /** The graphics were taken away mid-play (the browser also warns that the context is lost). */
  graphicsLost: [/the graphics were lost/, /WEBGL_CONTEXT_LOST/, /CONTEXT_LOST_WEBGL/],
  /** The device said yes to 3D, then could not create the real thing. */
  graphicsUnavailable: [/3D could not start/, /WEBGL_UNAVAILABLE/, /Error creating WebGL context/],
  /** A 3D file did not download. */
  filesFailed: [/Failed to fetch dynamically imported module/, /request failed: .*\/three\//],
});

/**
 * Takes the graphics away from the page, as a phone does when it runs low on memory or the tab sits in the background.
 * @param {import('playwright').Page} page
 */
export async function loseGraphics(page) {
  await page.evaluate((selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas) throw new Error(`no 3D canvas (${selector}) to lose the graphics of`);
    const extension = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2')).getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('this browser has no WEBGL_lose_context extension');
    extension.loseContext();
  }, CANVAS);
}

/**
 * Makes WebGL work for the support check (the first request, which only asks "can this device do 3D?") and then refuse,
 * as a device does that says yes and then cannot create the real context.
 * @param {import('playwright').BrowserContext} context
 */
export function failGraphicsAfterProbe(context) {
  return context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let requests = 0;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
      if (/webgl/.test(String(type)) && ++requests > 1) return null;
      return original.call(this, type, ...rest);
    };
  });
}

/**
 * Makes every 3D file of one game fail to download (a flaky network, a cache that lost a file).
 * @param {import('playwright').BrowserContext} context
 * @param {string} slug
 */
export function failThreeFiles(context, slug) {
  return context.route(`**/src/games/${slug}/three/**`, (route) => route.abort('failed'));
}
