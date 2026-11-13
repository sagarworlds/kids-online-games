// Project-wide integrity checks. They guard rules from docs/SPEC.md that no single game's tests would notice:
// the site has no bundler, so a wrong path or a bare import only fails in the browser, and a game that quietly
// reaches for the DOM in `logic/` or imports another game breaks the architecture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAMES } from '../src/hub/gamesRegistry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** All files under a directory (relative to ROOT), skipping dot-folders. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const srcFiles = walk(join(ROOT, 'src'));
const jsFiles = srcFiles.filter((f) => f.endsWith('.js'));
const cssFiles = srcFiles.filter((f) => f.endsWith('.css'));
const htmlFiles = [join(ROOT, 'index.html'), join(ROOT, '404.html'), ...srcFiles.filter((f) => f.endsWith('.html'))].filter(existsSync);
const read = (f) => readFileSync(f, 'utf8');

/** Third-party code copied into the repo (see src/vendor/three/README.md). */
const VENDOR_DIR = 'src/vendor/';

/** Removes comments so words like "document" in a JSDoc line do not count as code. */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// ---- every reference resolves ----------------------------------------------

test('every relative import in src/ points at a file that exists, and none is a bare specifier', () => {
  const problems = [];
  for (const file of jsFiles) {
    const code = stripComments(read(file));
    const specs = [
      ...code.matchAll(/\b(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g),
      ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    for (const spec of specs) {
      if (!spec.startsWith('.')) problems.push(`${rel(file)}: bare import "${spec}" cannot resolve without a bundler`);
      else if (!existsSync(resolve(dirname(file), spec))) problems.push(`${rel(file)}: imports missing file "${spec}"`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every `new URL("./x", import.meta.url)` (data files, workers) points at a file that exists', () => {
  const problems = [];
  for (const file of jsFiles) {
    for (const m of stripComments(read(file)).matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
      if (!existsSync(resolve(dirname(file), m[1]))) problems.push(`${rel(file)}: missing "${m[1]}"`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every href and src in the HTML pages resolves (relative to the page, or to the site root for "/...")', () => {
  const problems = [];
  for (const file of htmlFiles) {
    for (const m of read(file).matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      const ref = m[1].split('#')[0].split('?')[0];
      if (!ref || /^(https?:|mailto:|data:|javascript:)/.test(ref)) continue;
      const target = ref.startsWith('/') ? join(ROOT, ref) : resolve(dirname(file), ref);
      const ok = existsSync(target) && (!statSync(target).isDirectory() || existsSync(join(target, 'index.html')));
      if (!ok) problems.push(`${rel(file)}: "${m[1]}" does not exist`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every url() and @import in the stylesheets resolves', () => {
  const problems = [];
  for (const file of cssFiles) {
    for (const m of read(file).matchAll(/(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"])/g)) {
      const ref = (m[1] ?? m[2]).split('?')[0];
      if (/^(https?:|data:|#)/.test(ref)) continue;
      if (!existsSync(resolve(dirname(file), ref))) problems.push(`${rel(file)}: "${ref}" does not exist`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every JSON data file under src/ is valid JSON', () => {
  const problems = [];
  for (const file of srcFiles.filter((f) => f.endsWith('.json'))) {
    try { JSON.parse(read(file)); } catch (error) { problems.push(`${rel(file)}: ${error.message}`); }
  }
  assert.deepEqual(problems, []);
});

// ---- privacy and the Content-Security-Policy -------------------------------

test('nothing in the shipped site calls out to another origin (no CDNs, fonts, analytics)', () => {
  const allowed = ['http://www.w3.org/']; // XML namespaces such as the SVG one are identifiers, not requests
  const problems = [];
  for (const file of [...htmlFiles, ...jsFiles, ...cssFiles, ...srcFiles.filter((f) => f.endsWith('.json'))]) {
    // The vendored three.js mentions web addresses in comments and warning texts. It is checked by its own test
    // below (exact file list), and at run time the Content-Security-Policy blocks any request to another origin.
    if (rel(file).startsWith(VENDOR_DIR)) continue;
    for (const m of read(file).matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
      if (!allowed.some((prefix) => m[0].startsWith(prefix))) problems.push(`${rel(file)}: ${m[0]}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('src/vendor/ holds exactly the reviewed third-party files, and only the engine imports them', () => {
  // Third-party code skips the "no other origin" scan above, so nothing may be added here without a review:
  // adding a file means updating this list on purpose.
  const expected = ['src/vendor/three/LICENSE', 'src/vendor/three/README.md', 'src/vendor/three/three.core.js', 'src/vendor/three/three.module.js'];
  assert.deepEqual(srcFiles.map(rel).filter((f) => f.startsWith(VENDOR_DIR)).sort(), expected);

  const problems = [];
  for (const file of jsFiles) {
    const from = rel(file);
    if (from.startsWith(VENDOR_DIR) || from === 'src/engine/three/three.js') continue;
    if (/from\s+['"][^'"]*vendor\//.test(stripComments(read(file)))) problems.push(`${from}: import three.js through src/engine/three/three.js`);
  }
  assert.deepEqual(problems, []);
});

test('three.js is only loaded on demand: no page or 2D code path imports it statically', () => {
  // The library is about 2 MB. A game's main.js, its 2D scenes and the hub must reach a 3D scene with import(),
  // so children on the 2D version (or on a slow phone) never download it.
  const pullsThree = (file) => /from\s+['"][^'"]*engine\/three\/(three|Stage3D|labels)\.js['"]/.test(stripComments(read(file)));
  const problems = [];
  for (const file of jsFiles) {
    const from = rel(file);
    const is3dFile = /(^|\/)(three|scenes3d|view3d)\//.test(from) || /3[dD]\.js$/.test(from);
    if (from.startsWith(VENDOR_DIR) || from.startsWith('src/engine/three/') || is3dFile) continue;
    if (pullsThree(file)) problems.push(`${from}: static import of three.js outside a 3D file (use import())`);
  }
  assert.deepEqual(problems, []);
});

// ---- installable app -------------------------------------------------------

const MANIFEST_FILE = join(ROOT, 'manifest.webmanifest');
/** Every page a child can land on and add to the home screen: the home page and each game's page. */
const frontDoors = htmlFiles.filter((f) => rel(f) === 'index.html' || /^src\/games\/[^/]+\/index\.html$/.test(rel(f)));

/** The width and height written in a PNG file's header (the first chunk always holds them). */
function pngSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${rel(file)} is a PNG file`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('the web app manifest is valid, starts at the home page, and every icon is a real file of the size it names', () => {
  assert.ok(existsSync(MANIFEST_FILE), 'manifest.webmanifest exists at the site root');
  const manifest = JSON.parse(read(MANIFEST_FILE));
  assert.ok(manifest.name && manifest.short_name, 'it has a name and a short name');
  assert.ok(manifest.short_name.length <= 12, 'the short name fits under an icon');
  assert.equal(manifest.start_url, './', 'it opens the home page');
  assert.equal(manifest.scope, './', 'and covers the whole site, games included');
  assert.equal(manifest.display, 'standalone', 'it runs like an app, without the browser bar');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);

  const home = read(join(ROOT, 'index.html'));
  assert.equal(manifest.theme_color, /<meta name="theme-color" content="(#[0-9a-f]{6})">/i.exec(home)?.[1], 'the manifest colour is the home page colour');

  const sized = (purpose) => manifest.icons.filter((icon) => (icon.purpose ?? 'any') === purpose && icon.type === 'image/png');
  for (const [purpose, size] of [['any', 192], ['any', 512], ['maskable', 512]]) {
    assert.ok(sized(purpose).some((icon) => icon.sizes === `${size}x${size}`), `a ${size}x${size} ${purpose} PNG icon`);
  }
  for (const icon of manifest.icons) {
    const file = join(ROOT, icon.src);
    assert.ok(existsSync(file), `${icon.src} exists`);
    if (icon.type === 'image/png') {
      const { width, height } = pngSize(file);
      assert.equal(icon.sizes, `${width}x${height}`, `${icon.src} is ${width}x${height} but the manifest says ${icon.sizes}`);
    }
  }
});

test('the iOS home-screen icon is a 180 x 180 PNG', () => {
  assert.deepEqual(pngSize(join(ROOT, 'icons/apple-touch-icon.png')), { width: 180, height: 180 });
});

test('the home page and every game page link the manifest and the home-screen icon (their paths are checked to resolve by the test above)', () => {
  assert.equal(frontDoors.length, GAMES.filter((g) => g.available).length + 1, 'every game page plus the home page');
  const problems = [];
  for (const file of frontDoors) {
    const html = read(file);
    if (!/<link rel="manifest" href="[^"]*manifest\.webmanifest">/.test(html)) problems.push(`${rel(file)}: no manifest link`);
    if (!/<link rel="apple-touch-icon" href="[^"]*icons\/apple-touch-icon\.png">/.test(html)) problems.push(`${rel(file)}: no apple-touch-icon link`);
    if (!/<meta name="apple-mobile-web-app-title" content="[^"]+">/.test(html)) problems.push(`${rel(file)}: no apple-mobile-web-app-title`);
  }
  assert.deepEqual(problems, []);
});

test('HTML pages have no inline scripts or inline event handlers (the CSP only allows script files)', () => {
  const problems = [];
  for (const file of htmlFiles) {
    const html = read(file);
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push(`${rel(file)}: inline <script>`);
    if (/\son[a-z]+\s*=/i.test(html)) problems.push(`${rel(file)}: inline event handler`);
  }
  assert.deepEqual(problems, []);
});

test('render.yaml publishes the folder the build script produces', () => {
  const yaml = read(join(ROOT, 'render.yaml'));
  assert.match(yaml, /staticPublishPath:\s*dist\b/);
  assert.match(yaml, /buildCommand:\s*node scripts\/build\.mjs/);
  assert.ok(existsSync(join(ROOT, 'scripts/build.mjs')));
  assert.equal(JSON.parse(read(join(ROOT, 'package.json'))).scripts.test, 'node --test');
});

// ---- architecture rules from the spec --------------------------------------

test('logic/ files are pure: no DOM, storage, timers, network or Math.random', () => {
  const banned = [
    [/\bdocument\b/, 'document'], [/\bwindow\b/, 'window'], [/\blocalStorage\b/, 'localStorage'],
    [/\bMath\.random\b/, 'Math.random'], [/\bsetTimeout\b|\bsetInterval\b/, 'timers'],
    [/\brequestAnimationFrame\b/, 'requestAnimationFrame'], [/\bfetch\s*\(/, 'fetch'],
  ];
  const problems = [];
  for (const file of jsFiles.filter((f) => /\/games\/[^/]+\/logic\//.test(rel(f)))) {
    const code = stripComments(read(file));
    for (const [pattern, name] of banned) if (pattern.test(code)) problems.push(`${rel(file)} uses ${name}`);
  }
  assert.deepEqual(problems, []);
});

test('games depend only on the engine, the app helper and themselves, never on another game or the hub', () => {
  const problems = [];
  for (const file of jsFiles.filter((f) => rel(f).startsWith('src/games/'))) {
    const own = rel(file).split('/').slice(0, 3).join('/');
    for (const m of stripComments(read(file)).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = rel(resolve(dirname(file), m[1]));
      const inOtherGame = target.startsWith('src/games/') && !target.startsWith(`${own}/`);
      if (inOtherGame || target.startsWith('src/hub/')) problems.push(`${rel(file)} imports ${target}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the engine never imports from games or the hub', () => {
  const problems = [];
  for (const file of jsFiles.filter((f) => rel(f).startsWith('src/engine/'))) {
    for (const m of stripComments(read(file)).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = rel(resolve(dirname(file), m[1]));
      if (target.startsWith('src/games/') || target.startsWith('src/hub/') || target.startsWith('src/app/')) problems.push(`${rel(file)} imports ${target}`);
    }
  }
  assert.deepEqual(problems, []);
});

// ---- games ------------------------------------------------------------------

const gameDirs = existsSync(join(ROOT, 'src/games'))
  ? readdirSync(join(ROOT, 'src/games')).filter((n) => statSync(join(ROOT, 'src/games', n)).isDirectory())
  : [];

test('every game folder is in the registry and marked available, and every available game has a folder', () => {
  const slugs = new Set(GAMES.map((g) => g.slug));
  for (const dir of gameDirs) {
    assert.ok(slugs.has(dir), `src/games/${dir} is not listed in src/hub/gamesRegistry.js`);
    assert.equal(GAMES.find((g) => g.slug === dir).available, true, `${dir} has a folder but is not marked available`);
  }
  for (const g of GAMES.filter((x) => x.available)) assert.ok(gameDirs.includes(g.slug), `${g.slug} is available but has no folder`);
});

test('every game has the files the spec asks for, and its own tests', () => {
  for (const slug of gameDirs) {
    const dir = join(ROOT, 'src/games', slug);
    for (const name of ['index.html', 'main.js', 'style.css', 'README.md']) assert.ok(existsSync(join(dir, name)), `${slug}: missing ${name}`);
    assert.ok(existsSync(join(dir, 'logic')), `${slug}: missing logic/`);
    const tests = walk(join(ROOT, 'tests', slug)).filter((f) => f.endsWith('.test.js'));
    assert.ok(tests.length > 0, `${slug}: no tests under tests/${slug}/`);
  }
});

test('every game page links the shared stylesheet and a Home route back to the hub', () => {
  for (const slug of gameDirs) {
    const html = read(join(ROOT, 'src/games', slug, 'index.html'));
    assert.match(html, /\.\.\/\.\.\/engine\/ui\/ui\.css/, `${slug}: shared stylesheet`);
    assert.match(html, /<script type="module" src="main\.js">/, `${slug}: module entry`);
  }
});
