import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../scripts/build.mjs';
import { registerServiceWorker } from '../src/app/registerServiceWorker.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://site.test';
const template = readFileSync(join(ROOT, 'sw.js'), 'utf8');

// ---- a tiny fake browser around the real sw.js source ----------------------

/** Runs the actual worker script in a sandbox with fake `caches`, `fetch` and `self`. */
function loadWorker({ version = 'v2', files = ['./', 'index.html'], saveData = false, network = async () => ({ ok: true, clone() { return this; }, body: 'from network' }), existing = {} } = {}) {
  const source = template
    .replace(/^const VERSION = .*\/\/ __VERSION__$/m, `const VERSION = ${JSON.stringify(version)};`)
    .replace(/^const FILES = .*\/\/ __FILES__$/m, `const FILES = ${JSON.stringify(files)};`);

  const stores = new Map(Object.entries(existing).map(([name, urls]) => [name, new Map(urls.map((u) => [new URL(u, ORIGIN).href, { ok: true, body: `cached ${u}` }]))]));
  const keyOf = (req, ignoreSearch) => {
    const url = new URL(typeof req === 'string' ? req : req.url, ORIGIN);
    if (ignoreSearch) url.search = '';
    return url.href;
  };
  const caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: async (list) => { for (const path of list) store.set(keyOf(path), { ok: true, body: `precached ${path}` }); },
        put: async (req, res) => { store.set(keyOf(req), res); },
        match: async (req, opts = {}) => {
          for (const [k, v] of store) if (keyOf(k, opts.ignoreSearch) === keyOf(req, opts.ignoreSearch)) return v;
          return undefined;
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };

  const listeners = {};
  const calls = { skipWaiting: 0, claim: 0, fetches: [] };
  const self = {
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
    navigator: { connection: { saveData } },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => { calls.skipWaiting += 1; return Promise.resolve(); },
    clients: { claim: () => { calls.claim += 1; return Promise.resolve(); } },
  };
  // The worker fetches its own files by relative path (a string) and the page's files as requests.
  const fetchSpy = async (req) => {
    const request = typeof req === 'string' ? { url: new URL(req, `${ORIGIN}/sw.js`).href } : req;
    calls.fetches.push(request.url);
    return network(request);
  };
  const Response = { redirect: (url, status) => ({ redirectTo: url, status }) };
  vm.runInNewContext(source, { self, caches, fetch: fetchSpy, URL, Promise, Response });

  /** Dispatches an event and returns the promise the worker handed to waitUntil / respondWith. */
  const dispatch = (type, extra = {}) => {
    const event = { ...extra, waitUntil(p) { this.waited = p; }, respondWith(p) { this.responded = p; } };
    listeners[type]?.(event);
    return event;
  };
  const request = (path, over = {}) => ({ url: new URL(path, ORIGIN).href, method: 'GET', mode: 'cors', ...over });
  /** The paths stored in a cache, in the order they were stored. */
  const stored = (name) => [...(stores.get(name)?.keys() ?? [])].map((u) => new URL(u).pathname.slice(1) || './');
  return { listeners, stores, calls, dispatch, request, stored };
}

// ---- the worker ------------------------------------------------------------

test('served straight from the repo (VERSION "dev") the worker does nothing at all', () => {
  const dev = loadWorker({ version: 'dev' });
  assert.deepEqual(Object.keys(dev.listeners), [], 'no install, activate or fetch handlers');
});

const SITE = ['./', 'index.html', 'src/hub/main.js', 'src/engine/a.js', 'src/games/lights-out/index.html', 'src/games/lights-out/main.js', 'src/games/lights-out/data/levels.json', 'src/games/lights-out/three/Scene.js', 'src/games/robot-path/index.html', 'src/games/robot-path/main.js', 'src/vendor/three/three.module.js', 'src/vendor/three/three.core.js'];
const CORE_OF_SITE = ['./', 'index.html', 'src/hub/main.js', 'src/engine/a.js'];
const LIGHTS_OUT = SITE.filter((f) => f.startsWith('src/games/lights-out/'));

test('install stores only the core (the home page and the shared engine) in a versioned cache before the worker takes over', async () => {
  const w = loadWorker({ version: 'abc', files: SITE });
  await w.dispatch('install').waited;
  assert.deepEqual(w.stored('kidsgames-abc'), CORE_OF_SITE, 'no game and no 3D library until they are used');
  assert.equal(w.calls.skipWaiting, 1);
  assert.deepEqual(w.calls.fetches, [], 'the core goes in with addAll, and nothing else is downloaded');
});

test('activate deletes caches from older deploys, keeps other sites\' caches, and claims open pages', async () => {
  const w = loadWorker({ version: 'new', existing: { 'kidsgames-old': ['a'], 'kidsgames-new': ['b'], 'someone-else': ['c'] } });
  await w.dispatch('activate').waited;
  assert.deepEqual([...w.stores.keys()].sort(), ['kidsgames-new', 'someone-else']);
  assert.equal(w.calls.claim, 1);
});

test('fetch serves a cached file without touching the network', async () => {
  const w = loadWorker({ existing: { 'kidsgames-v2': ['/src/app.js'] } });
  const event = w.dispatch('fetch', { request: w.request('/src/app.js') });
  assert.equal((await event.responded).body, 'cached /src/app.js');
  assert.deepEqual(w.calls.fetches, []);
});

test('a cached file matches even with a query string', async () => {
  const w = loadWorker({ existing: { 'kidsgames-v2': ['/index.html'] } });
  const event = w.dispatch('fetch', { request: w.request('/index.html?utm=1') });
  assert.equal((await event.responded).body, 'cached /index.html');
});

test('a cache miss goes to the network and a good response is kept for next time', async () => {
  const w = loadWorker();
  const first = await w.dispatch('fetch', { request: w.request('/new.json') }).responded;
  assert.equal(first.body, 'from network');
  assert.equal(w.calls.fetches.length, 1);
  const second = await w.dispatch('fetch', { request: w.request('/new.json') }).responded;
  assert.equal(second.body, 'from network');
  assert.equal(w.calls.fetches.length, 1, 'second request came from the cache');
});

test('an error response from the network is returned but not cached', async () => {
  const w = loadWorker({ network: async () => ({ ok: false, status: 500, clone() { return this; } }) });
  const res = await w.dispatch('fetch', { request: w.request('/broken') }).responded;
  assert.equal(res.status, 500);
  assert.equal(w.stores.get('kidsgames-v2').size, 0);
});

test('offline: a page the cache has never seen redirects to the home page; other files fail', async () => {
  const w = loadWorker({ existing: { 'kidsgames-v2': ['/'] }, network: async () => { throw new TypeError('offline'); } });
  const page = await w.dispatch('fetch', { request: w.request('/no/such/page', { mode: 'navigate' }) }).responded;
  assert.deepEqual(page, { redirectTo: `${ORIGIN}/`, status: 302 }, 'a redirect, not the home HTML under the wrong URL');
  await assert.rejects(w.dispatch('fetch', { request: w.request('/missing.js') }).responded, /offline/);
});

test('offline with nothing cached at all, a page request fails instead of redirecting into a loop', async () => {
  const w = loadWorker({ network: async () => { throw new TypeError('offline'); } });
  await assert.rejects(w.dispatch('fetch', { request: w.request('/x', { mode: 'navigate' }) }).responded, /offline/);
});

test('the worker ignores non-GET requests and other origins', () => {
  const w = loadWorker();
  assert.equal(w.dispatch('fetch', { request: w.request('/x', { method: 'POST' }) }).responded, undefined);
  assert.equal(w.dispatch('fetch', { request: { url: 'https://cdn.example/x.js', method: 'GET', mode: 'cors' } }).responded, undefined);
});

// ---- saving a game the first time it is opened ----------------------------

const gamePageRequest = (w, slug = 'lights-out') => w.request(`/src/games/${slug}/index.html`, { mode: 'navigate' });

test('opening a game online loads its page from the network, then saves the whole game, its page last', async () => {
  const w = loadWorker({ files: SITE });
  const event = w.dispatch('fetch', { request: gamePageRequest(w) });
  assert.equal((await event.responded).body, 'from network', 'the child waits for nothing: the page comes straight from the network');
  assert.deepEqual(w.stored('kidsgames-v2'), [], 'and the page is not stored as it goes by');
  await event.waited;
  const saved = w.stored('kidsgames-v2');
  assert.deepEqual([...saved].sort(), [...LIGHTS_OUT].sort(), 'every file of that game, including its data and 3D files, and nothing of another game or the 3D library');
  assert.equal(saved[saved.length - 1], 'src/games/lights-out/index.html', 'the page is stored last, so a stored page means a complete game');
});

test('a saved game then comes from the cache, with no network at all', async () => {
  const w = loadWorker({ files: SITE });
  const first = w.dispatch('fetch', { request: gamePageRequest(w) });
  await first.responded;
  await first.waited;
  const fetchesBefore = w.calls.fetches.length;
  const again = await w.dispatch('fetch', { request: gamePageRequest(w) }).responded;
  assert.equal(again.body, 'from network', 'it is the stored copy (the fake network and the fake store hold the same body)');
  assert.equal(w.calls.fetches.length, fetchesBefore, 'nothing was fetched');
});

test('opening two games saves each one, and opening the same game twice at once downloads it once', async () => {
  const w = loadWorker({ files: SITE });
  const a = w.dispatch('fetch', { request: gamePageRequest(w) });
  const b = w.dispatch('fetch', { request: gamePageRequest(w) });
  const c = w.dispatch('fetch', { request: gamePageRequest(w, 'robot-path') });
  await Promise.all([a.responded, b.responded, c.responded]);
  await Promise.all([a.waited, b.waited, c.waited]);
  const downloads = w.calls.fetches.filter((u) => /\/src\/games\/lights-out\/(?!index)/.test(u));
  assert.equal(downloads.length, 3, 'the three other files of Lights Out were each fetched once');
  assert.ok(w.stored('kidsgames-v2').includes('src/games/robot-path/main.js'), 'and the other game was saved too');
});

test('if a file cannot be fetched the game is not marked saved (no page), nothing breaks, and the next open tries again', async () => {
  let failing = true;
  const w = loadWorker({
    files: SITE,
    network: async (req) => {
      if (failing && /levels\.json$/.test(req.url)) return { ok: false, status: 503, clone() { return this; } };
      return { ok: true, clone() { return this; }, body: 'from network' };
    },
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    const first = w.dispatch('fetch', { request: gamePageRequest(w) });
    assert.equal((await first.responded).body, 'from network', 'the game opens as normal');
    await first.waited;
    assert.ok(!w.stored('kidsgames-v2').includes('src/games/lights-out/index.html'), 'its page is not stored, so the game is not claimed to work offline');
    failing = false;
    const second = w.dispatch('fetch', { request: gamePageRequest(w) });
    await second.responded;
    await second.waited;
    assert.ok(w.stored('kidsgames-v2').includes('src/games/lights-out/index.html'), 'the next time it is opened online it is saved');
  } finally {
    console.error = quiet;
  }
});

test('with the browser\'s data saver on, a game is only stored as it is played, not downloaded in the background', async () => {
  const w = loadWorker({ files: SITE, saveData: true });
  const event = w.dispatch('fetch', { request: gamePageRequest(w) });
  await event.responded;
  await event.waited;
  assert.deepEqual(w.calls.fetches.filter((u) => !u.endsWith('index.html')), [], 'nothing was fetched in the background');
  const file = await w.dispatch('fetch', { request: w.request('/src/games/lights-out/main.js') }).responded;
  assert.equal(file.body, 'from network');
  assert.deepEqual(w.stored('kidsgames-v2'), ['src/games/lights-out/main.js'], 'a file the game actually asks for is still kept');
});

test('offline, a game that was never saved sends the child home and says which game', async () => {
  const w = loadWorker({ files: SITE, existing: { 'kidsgames-v2': ['/'] }, network: async () => { throw new TypeError('offline'); } });
  const page = await w.dispatch('fetch', { request: gamePageRequest(w, 'robot-path') }).responded;
  assert.deepEqual(page, { redirectTo: `${ORIGIN}/?offline=robot-path`, status: 302 });
});

test('offline, a game that was saved opens from the cache', async () => {
  const w = loadWorker({ files: SITE, existing: { 'kidsgames-v2': ['/', '/src/games/lights-out/index.html'] }, network: async () => { throw new TypeError('offline'); } });
  const page = await w.dispatch('fetch', { request: gamePageRequest(w) }).responded;
  assert.equal(page.body, 'cached /src/games/lights-out/index.html');
});

test('the directory form of a game address starts the saving too', async () => {
  const w = loadWorker({ files: SITE });
  const event = w.dispatch('fetch', { request: w.request('/src/games/lights-out/', { mode: 'navigate' }) });
  await event.responded;
  await event.waited;
  assert.ok(w.stored('kidsgames-v2').includes('src/games/lights-out/index.html'));
});

// ---- a new deploy ----------------------------------------------------------

test('a new deploy saves again only the games (and the 3D library) the child had saved, from the new files', async () => {
  const w = loadWorker({
    version: 'new', files: SITE,
    existing: { 'kidsgames-old': ['/', '/src/games/lights-out/index.html', '/src/vendor/three/three.module.js'] },
  });
  await w.dispatch('install').waited;
  const stored = w.stored('kidsgames-new');
  assert.deepEqual(stored.filter((f) => CORE_OF_SITE.includes(f)), CORE_OF_SITE, 'the core is stored');
  for (const file of LIGHTS_OUT) assert.ok(stored.includes(file), `${file} was saved again`);
  assert.ok(stored.includes('src/vendor/three/three.core.js'), 'so was the 3D library, which the child had used');
  assert.ok(!stored.some((f) => f.startsWith('src/games/robot-path/')), 'a game the child never opened is not downloaded');
  assert.equal(w.calls.skipWaiting, 1);
});

test('a deploy that cannot re-save a game still installs, and the game is saved when it is next opened online', async () => {
  const w = loadWorker({
    version: 'new', files: SITE,
    existing: { 'kidsgames-old': ['/', '/src/games/lights-out/index.html'] },
    network: async () => { throw new TypeError('offline'); },
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    await w.dispatch('install').waited;
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(w.stored('kidsgames-new'), CORE_OF_SITE, 'only the core, and the install did not fail');
  assert.equal(w.calls.skipWaiting, 1);
});

// ---- the build -------------------------------------------------------------

/** A throwaway site root with the real sw.js template, so builds can be compared. */
function fakeRoot(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kg-root-'));
  const all = { 'index.html': '<h1>hi</h1>', '404.html': 'nope', 'favicon.svg': '<svg/>', 'manifest.webmanifest': '{}', 'icons/icon-192.png': 'png', 'src/a.js': 'export const a = 1;', ...files };
  for (const [name, body] of Object.entries(all)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), body);
  }
  writeFileSync(join(root, 'sw.js'), template);
  return root;
}
const workerFields = (code) => ({
  version: JSON.parse(code.match(/^const VERSION = (.*);$/m)[1]),
  precache: JSON.parse(code.match(/^const FILES = (.*);$/m)[1]),
});

test('the real build lists the whole site for the worker, and nothing else', async () => {
  const out = mkdtempSync(join(tmpdir(), 'kg-out-'));
  try {
    const { files, version } = await build({ out });
    const { version: stamped, precache } = workerFields(readFileSync(join(out, 'sw.js'), 'utf8'));
    assert.equal(stamped, version);
    assert.match(version, /^[0-9a-f]{12}$/);
    for (const must of ['./', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'src/hub/main.js', 'src/engine/ui/ui.css', 'src/games/number-ninja/index.html', 'src/games/robot-path/data/levels.json']) {
      assert.ok(precache.includes(must), `${must} is in the worker's list`);
    }
    assert.ok(!precache.includes('sw.js'), 'the worker does not cache itself');
    assert.ok(!precache.includes('404.html'));
    assert.ok(precache.every((p) => p === './' || (existsSync(join(out, p)) && !/^(tests|docs)\//.test(p))), 'every entry exists and none is a test or doc');
    assert.equal(precache.length, files.length, 'the list is "./" plus every file except 404.html, so one in and one out');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the cache version changes exactly when shipped content changes', async () => {
  const root = fakeRoot();
  const outA = join(root, '_a');
  const outB = join(root, '_b');
  const outC = join(root, '_c');
  try {
    const a = await build({ root, out: outA });
    const b = await build({ root, out: outB });
    assert.equal(a.version, b.version, 'same content, same version');
    writeFileSync(join(root, 'src/a.js'), 'export const a = 2;');
    const c = await build({ root, out: outC });
    assert.notEqual(c.version, a.version, 'one edited file, new version');
    writeFileSync(join(root, 'sw.js'), `${template}\n// changed worker logic`);
    const d = await build({ root, out: join(root, '_d') });
    assert.notEqual(d.version, c.version, 'a change to the worker itself also starts a fresh cache');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the build fails loudly when the worker template lost its marker lines, or a shipped file is missing', async () => {
  const root = fakeRoot();
  try {
    writeFileSync(join(root, 'sw.js'), 'const VERSION = "x";\nconst FILES = [];\n');
    await assert.rejects(build({ root, out: join(root, '_o') }), /VERSION \/ FILES/);
    writeFileSync(join(root, 'sw.js'), template);
    rmSync(join(root, 'favicon.svg'));
    await assert.rejects(build({ root, out: join(root, '_o') }), /favicon\.svg/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- registration ----------------------------------------------------------

test('registerServiceWorker registers the root sw.js, and by default that file exists', async () => {
  let seen;
  const nav = { serviceWorker: { register: async (url) => { seen = url; return { scope: '/' }; } } };
  const result = await registerServiceWorker({ nav });
  assert.deepEqual(result, { scope: '/' });
  assert.ok(seen.pathname.endsWith('/sw.js'));
  assert.ok(existsSync(fileURLToPath(seen)), 'the default URL points at the real sw.js');
});

test('without service worker support, or when registration fails, the game carries on (failure logged once)', async () => {
  assert.equal(await registerServiceWorker({ nav: {} }), null);
  assert.equal(await registerServiceWorker({ nav: undefined }), null);
  const logged = [];
  const nav = { serviceWorker: { register: async () => { throw new Error('blocked in private mode'); } } };
  assert.equal(await registerServiceWorker({ nav, logger: { error: (...a) => logged.push(a) } }), null);
  assert.equal(logged.length, 1);
});
