import { chromium } from 'playwright';

// A headless machine has no GPU, so WebGL runs on SwiftShader (a software renderer). Slow, but it draws what a phone would.
const WEBGL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// For the "this device cannot do 3D at all" checks.
const NO_WEBGL_ARGS = ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2'];

/**
 * Screens the checks run at. `touch` tells the helpers to tap instead of click, like a finger would.
 * @type {Readonly<Record<'desktop'|'phone'|'smallPhone'|'tinyPhone'|'landscapePhone', { viewport: {width: number, height: number}, touch: boolean, hasTouch?: boolean, isMobile?: boolean, deviceScaleFactor?: number }>>}
 */
export const SCREENS = Object.freeze({
  desktop: { viewport: { width: 1280, height: 800 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
  smallPhone: { viewport: { width: 360, height: 640 }, touch: true, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
  tinyPhone: { viewport: { width: 320, height: 568 }, touch: true, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
  landscapePhone: { viewport: { width: 667, height: 375 }, touch: true, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
});

/**
 * Starts Chromium.
 *
 * @param {{ webgl?: boolean }} [options] `webgl: false` starts a browser that has no WebGL at all.
 * @returns {Promise<import('playwright').Browser>}
 */
export function launchBrowser({ webgl = true } = {}) {
  return chromium.launch({
    args: webgl ? WEBGL_ARGS : NO_WEBGL_ARGS,
    // Only for machines where the browser lives somewhere Playwright does not look.
    executablePath: process.env.E2E_CHROMIUM || undefined,
  });
}
