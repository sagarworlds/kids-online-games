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
function loadWorker({ version = 'v2', precache = ['./', 'index.html'], network = async () => ({ ok: true, clone() { return this; }, body: 'from network' }), existing = {} } = {}) {
  const source = template
    .replace(/^const VERSION = .*\/\/ __VERSION__$/m, `const VERSION = ${JSON.stringify(version)};`)
    .replace(/^const PRECACHE = .*\/\/ __PRECACHE__$/m, `const PRECACHE = ${JSON.stringify(precache)};`);

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
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => { calls.skipWaiting += 1; return Promise.resolve(); },
    clients: { claim: () => { calls.claim += 1; return Promise.resolve(); } },
  };
  const fetchSpy = async (req) => { calls.fetches.push(req.url); return network(req); };
  const Response = { redirect: (url, status) => ({ redirectTo: url, status }) };
  vm.runInNewContext(source, { self, caches, fetch: fetchSpy, URL, Promise, Response });

  /** Dispatches an event and returns the promise the worker handed to waitUntil / respondWith. */
  const dispatch = (type, extra = {}) => {
    const event = { ...extra, waitUntil(p) { this.waited = p; }, respondWith(p) { this.responded = p; } };
    listeners[type]?.(event);
    return event;
  };
  const request = (path, over = {}) => ({ url: new URL(path, ORIGIN).href, method: 'GET', mode: 'cors', ...over });
  return { listeners, stores, calls, dispatch, request };
}

// ---- the worker ------------------------------------------------------------

test('served straight from the repo (VERSION "dev") the worker does nothing at all', () => {
  const dev = loadWorker({ version: 'dev' });
  assert.deepEqual(Object.keys(dev.listeners), [], 'no install, activate or fetch handlers');
});

test('install stores every listed file in a versioned cache before the worker takes over', async () => {
  const w = loadWorker({ version: 'abc', precache: ['./', 'index.html', 'src/a.js'] });
  const event = w.dispatch('install');
  await event.waited;
  assert.deepEqual([...w.stores.get('kidsgames-abc').keys()].map((u) => new URL(u).pathname), ['/', '/index.html', '/src/a.js']);
  assert.equal(w.calls.skipWaiting, 1);
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

// ---- the build -------------------------------------------------------------

/** A throwaway site root with the real sw.js template, so builds can be compared. */
function fakeRoot(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kg-root-'));
  const all = { 'index.html': '<h1>hi</h1>', '404.html': 'nope', 'favicon.svg': '<svg/>', 'src/a.js': 'export const a = 1;', ...files };
  for (const [name, body] of Object.entries(all)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), body);
  }
  writeFileSync(join(root, 'sw.js'), template);
  return root;
}
const workerFields = (code) => ({
  version: JSON.parse(code.match(/^const VERSION = (.*);$/m)[1]),
  precache: JSON.parse(code.match(/^const PRECACHE = (.*);$/m)[1]),
});

test('the real build produces a worker that precaches the whole site and nothing else', async () => {
  const out = mkdtempSync(join(tmpdir(), 'kg-out-'));
  try {
    const { files, version } = await build({ out });
    const { version: stamped, precache } = workerFields(readFileSync(join(out, 'sw.js'), 'utf8'));
    assert.equal(stamped, version);
    assert.match(version, /^[0-9a-f]{12}$/);
    for (const must of ['./', 'index.html', 'favicon.svg', 'src/hub/main.js', 'src/engine/ui/ui.css', 'src/games/number-ninja/index.html', 'src/games/robot-path/data/levels.json']) {
      assert.ok(precache.includes(must), `${must} is precached`);
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
    writeFileSync(join(root, 'sw.js'), 'const VERSION = "x";\nconst PRECACHE = [];\n');
    await assert.rejects(build({ root, out: join(root, '_o') }), /VERSION \/ PRECACHE/);
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
