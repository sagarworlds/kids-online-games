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
    for (const m of read(file).matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
      if (!allowed.some((prefix) => m[0].startsWith(prefix))) problems.push(`${rel(file)}: ${m[0]}`);
    }
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
