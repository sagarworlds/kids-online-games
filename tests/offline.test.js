import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../scripts/build.mjs';
import { registerServiceWorker } from '../src/app/registerServiceWorker.js';
import { OfflineService, savedPercent, savedSentence } from '../src/engine/services/OfflineService.js';

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
  /** What the worker told the open pages. */
  const messages = [];
  const calls = { skipWaiting: 0, claim: 0, fetches: [] };
  const self = {
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
    navigator: { connection: { saveData } },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => { calls.skipWaiting += 1; return Promise.resolve(); },
    clients: { claim: () => { calls.claim += 1; return Promise.resolve(); }, matchAll: async () => [{ postMessage: (message) => messages.push(message) }] },
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
  return { listeners, stores, calls, dispatch, request, stored, messages };
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

// ---- the grown-ups' "save all games for offline play" ----------------------

const ALL_SAVED = ['/', '/src/games/lights-out/index.html', '/src/games/robot-path/index.html'];
/** Messages built inside the worker's sandbox have the sandbox's own Object, so compare them as plain data. */
const plain = (value) => JSON.parse(JSON.stringify(value));

test('asked for its status, the worker says how many games are saved', async () => {
  const w = loadWorker({ files: SITE, existing: { 'kidsgames-v2': ALL_SAVED.slice(0, 2) } });
  const replies = [];
  await w.dispatch('message', { data: { type: 'STATUS' }, source: { postMessage: (m) => replies.push(m) } }).waited;
  assert.deepEqual(plain(replies), [{ type: 'STATUS', saved: 1, total: 2 }]);
});

test('asked to save everything, the worker stores every file, each game\'s page last, and reports progress to the open pages', async () => {
  const w = loadWorker({ files: SITE });
  await w.dispatch('message', { data: { type: 'SAVE_ALL' } }).waited;
  const stored = w.stored('kidsgames-v2');
  assert.deepEqual([...stored].sort(), [...SITE].sort(), 'every file of the site, including the 3D library');
  for (const slug of ['lights-out', 'robot-path']) {
    const page = stored.indexOf(`src/games/${slug}/index.html`);
    const others = stored.filter((f) => f.startsWith(`src/games/${slug}/`) && !f.endsWith('index.html'));
    assert.ok(others.every((f) => stored.indexOf(f) < page), `${slug}'s page comes after the rest of that game`);
  }
  const progress = w.messages.filter((m) => m.type === 'SAVE_PROGRESS').map((m) => m.done);
  assert.ok(progress.length >= 2, 'progress was reported');
  assert.deepEqual(progress, [...progress].sort((a, b) => a - b), 'and it only goes up');
  assert.deepEqual(plain(w.messages.at(-1)), { type: 'SAVE_DONE', done: SITE.length, total: SITE.length, failed: 0 });
});

test('saving everything fetches only what is missing, and nothing at all when everything is saved', async () => {
  const w = loadWorker({ files: SITE, existing: { 'kidsgames-v2': SITE.map((f) => (f === './' ? '/' : `/${f}`)) } });
  await w.dispatch('message', { data: { type: 'SAVE_ALL' } }).waited;
  assert.deepEqual(w.calls.fetches, []);
  assert.deepEqual(plain(w.messages.at(-1)), { type: 'SAVE_DONE', done: SITE.length, total: SITE.length, failed: 0 });
  const partly = loadWorker({ files: SITE, existing: { 'kidsgames-v2': ['/', '/index.html', '/src/hub/main.js', '/src/engine/a.js', '/src/games/lights-out/main.js'] } });
  await partly.dispatch('message', { data: { type: 'SAVE_ALL' } }).waited;
  assert.ok(!partly.calls.fetches.some((u) => u.endsWith('/src/games/lights-out/main.js')), 'a file that was stored is not fetched again');
  assert.equal(partly.calls.fetches.length, SITE.length - 5);
});

test('saving everything ignores the data saver, because a grown-up asked for it', async () => {
  const w = loadWorker({ files: SITE, saveData: true });
  await w.dispatch('message', { data: { type: 'SAVE_ALL' } }).waited;
  assert.ok(w.stored('kidsgames-v2').includes('src/games/robot-path/index.html'));
});

test('a game with a file that cannot be fetched is not claimed saved; the others are, and the failure is counted', async () => {
  const w = loadWorker({
    files: SITE,
    network: async (req) => (/robot-path\/data|robot-path\/main/.test(req.url) && req.url.endsWith('main.js') ? { ok: false, status: 503, clone() { return this; } } : { ok: true, clone() { return this; }, body: 'from network' }),
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    await w.dispatch('message', { data: { type: 'SAVE_ALL' } }).waited;
  } finally {
    console.error = quiet;
  }
  const stored = w.stored('kidsgames-v2');
  assert.ok(stored.includes('src/games/lights-out/index.html'), 'the game that arrived whole is saved');
  assert.ok(!stored.includes('src/games/robot-path/index.html'), 'the game with a missing file is not');
  const done = plain(w.messages.at(-1));
  assert.equal(done.type, 'SAVE_DONE');
  assert.equal(done.failed, 2, 'the file that failed, and the page that was therefore not stored');
});

test('asking twice at once downloads once', async () => {
  const w = loadWorker({ files: SITE });
  const a = w.dispatch('message', { data: { type: 'SAVE_ALL' } });
  const b = w.dispatch('message', { data: { type: 'SAVE_ALL' } });
  await Promise.all([a.waited, b.waited]);
  assert.equal(w.calls.fetches.length, SITE.length, 'every file (nothing was stored, since install is skipped here) was fetched exactly once, not twice');
});

test('messages the worker does not know are ignored', async () => {
  const w = loadWorker({ files: SITE });
  assert.equal(w.dispatch('message', { data: { type: 'DANCE' } }).waited, undefined);
  assert.equal(w.dispatch('message', { data: null }).waited, undefined);
  assert.equal(w.dispatch('message', {}).waited, undefined);
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

// ---- the page's side of "save all games for offline play" -------------------

/** A fake `navigator` whose service worker answers the way sw.js does (or says nothing, or is not there). */
function fakeNav({ reply = null, ready = true } = {}) {
  const listeners = new Set();
  const posted = [];
  const send = (data) => { for (const fn of [...listeners]) fn({ data }); };
  const worker = { postMessage: (message) => { posted.push(message); reply?.(message, send); } };
  const serviceWorker = {
    ready: ready ? Promise.resolve({ active: worker }) : new Promise(() => {}),
    addEventListener: (type, fn) => { assert.equal(type, 'message'); listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn),
  };
  return { nav: { serviceWorker }, posted, listeners, send };
}

test('the saver asks the worker for its status and hands back the counts, then stops listening', async () => {
  const f = fakeNav({ reply: (m, send) => m.type === 'STATUS' && send({ type: 'STATUS', saved: 3, total: 19 }) });
  const saver = new OfflineService({ nav: f.nav, timeoutMs: 500 });
  assert.equal(saver.supported, true);
  assert.deepEqual(await saver.status(), { saved: 3, total: 19 });
  assert.deepEqual(f.posted, [{ type: 'STATUS' }]);
  assert.equal(f.listeners.size, 0, 'no listener is left behind');
});

test('saveAll passes the progress on and finishes when the worker says it is done', async () => {
  const f = fakeNav({
    reply: (m, send) => {
      if (m.type !== 'SAVE_ALL') return;
      send({ type: 'STATUS', saved: 1, total: 2 }); // an unrelated reply is ignored
      send({ type: 'SAVE_PROGRESS', done: 10, total: 40 });
      send({ type: 'SAVE_PROGRESS', done: 30, total: 40 });
      send({ type: 'SAVE_DONE', done: 40, total: 40, failed: 2 });
    },
  });
  const seen = [];
  const result = await new OfflineService({ nav: f.nav, timeoutMs: 500 }).saveAll({ onProgress: (p) => seen.push(p) });
  assert.deepEqual(seen, [{ done: 10, total: 40 }, { done: 30, total: 40 }]);
  assert.deepEqual(result, { done: 40, total: 40, failed: 2 });
  assert.equal(f.listeners.size, 0);
});

test('with no service worker support the saver says so and rejects with a clear code', async () => {
  const saver = new OfflineService({ nav: {}, timeoutMs: 50 });
  assert.equal(saver.supported, false);
  await assert.rejects(saver.status(), (error) => error.code === 'OFFLINE_UNAVAILABLE');
  await assert.rejects(saver.saveAll(), (error) => error.code === 'OFFLINE_UNAVAILABLE');
});

test('a worker that never answers (the development one does nothing) is reported as unavailable, not waited for forever', async () => {
  const f = fakeNav({ reply: null });
  const saver = new OfflineService({ nav: f.nav, timeoutMs: 30 });
  await assert.rejects(saver.status(), (error) => error.code === 'OFFLINE_UNAVAILABLE');
  assert.equal(f.listeners.size, 0, 'and it stopped listening');
  await assert.rejects(fakeNavSaver(false).status(), (error) => error.code === 'OFFLINE_UNAVAILABLE');
  function fakeNavSaver(ready) { return new OfflineService({ nav: fakeNav({ ready }).nav, timeoutMs: 30 }); }
});

test('savedPercent is a whole percentage that never leaves 0 to 100', () => {
  assert.equal(savedPercent({ done: 0, total: 40 }), 0);
  assert.equal(savedPercent({ done: 10, total: 40 }), 25);
  assert.equal(savedPercent({ done: 39, total: 40 }), 97, 'rounded down, so it is never 100 before it is done');
  assert.equal(savedPercent({ done: 40, total: 40 }), 100);
  assert.equal(savedPercent({ done: 50, total: 40 }), 100);
  assert.equal(savedPercent({ done: -1, total: 40 }), 0);
  assert.equal(savedPercent({ done: 5, total: 0 }), 0);
  assert.equal(savedPercent({ done: Number.NaN, total: 40 }), 0);
});

test('savedSentence says how many games are saved, and that opening a game saves it too', () => {
  assert.match(savedSentence({ saved: 3, total: 19 }), /^3 of 19 games are saved for offline play\./);
  assert.match(savedSentence({ saved: 3, total: 19 }), /saved the first time it is opened/);
  assert.equal(savedSentence({ saved: 19, total: 19 }), 'All 19 games are saved for offline play.');
});
