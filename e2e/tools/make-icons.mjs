// Draws the app icons (the home-screen and install icons) from favicon.svg, so the artwork lives in one file.
//
//   cd e2e && node tools/make-icons.mjs
//
// It only needs running when favicon.svg changes. It writes icons/*.png in the repository root:
//   icon-192.png, icon-512.png       the artwork on a transparent background (purpose "any")
//   icon-maskable-512.png            full-bleed, with the artwork inside the central safe zone (purpose "maskable"), so Android can
//                                    cut it to a circle, squircle or square without clipping the star
//   apple-touch-icon.png (180)       full-bleed and opaque, which is what iOS wants (it rounds the corners itself)
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(REPO, 'icons');
const BACKGROUND = '#5b3df5'; // the circle's purple, also the manifest's theme colour

// The shapes inside favicon.svg's own 64 x 64 box.
const artwork = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(readFileSync(resolve(REPO, 'favicon.svg'), 'utf8'))?.[1];
if (!artwork) throw new Error('favicon.svg has no content to draw');

/** The artwork as it is: a purple circle with a star, on a transparent background. */
const asIs = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${artwork}</svg>`;

/** Full-bleed purple with the artwork shrunk to 70% in the middle: the star ends up well inside the 80% safe circle. */
const fullBleed = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BACKGROUND}"/><g transform="translate(9.6 9.6) scale(0.7)">${artwork}</g></svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: asIs, transparent: true },
  { file: 'icon-512.png', size: 512, svg: asIs, transparent: true },
  { file: 'icon-maskable-512.png', size: 512, svg: fullBleed, transparent: false },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed, transparent: false },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, svg, transparent } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg()}`);
    await page.screenshot({ path: resolve(OUT, file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`wrote icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
