/* Service worker: makes the site work offline without making a first visit download all of it.

   This file is a template. `npm run build` copies it to dist/sw.js with the two lines below filled in:
   VERSION (a hash of every shipped file, so a deploy always gets a fresh cache) and FILES (every shipped file).
   Served straight from the repo (`npm start`) VERSION stays 'dev' and the worker does nothing at all, so local
   development never sees stale cached files.

   What is stored, and when:
   - The CORE (the home page, the shared engine, the icons) is stored when the worker installs, so the home page always works offline.
   - Each GAME is stored the first time it is opened while online: its page loads from the network as usual, and the worker saves the
     rest of the game's files in the background. A game that has been opened once works offline, complete (all its flags, words,
     levels and 3D files, not just what happened to be on screen).
   - The 3D library (src/vendor/) is stored the first time a 3D view asks for it, like any other file.
   A first visit therefore costs a few hundred kilobytes, not the whole site, and a deploy only re-downloads what the child had saved. */

const VERSION = 'dev'; // __VERSION__
const FILES = []; // __FILES__

const CACHE_PREFIX = 'kidsgames-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

const GAME_FILE = /^src\/games\/([^/]+)\//;
const VENDOR_DIR = 'src/vendor/';
/** If this is stored, a 3D view has been used, so the library is kept up to date across deploys. */
const VENDOR_PROBE = 'src/vendor/three/three.module.js';
/** How many files are fetched at once while a game is being saved: fast enough, gentle on a slow connection. */
const BATCH = 6;

const isCore = (file) => !GAME_FILE.test(file) && !file.startsWith(VENDOR_DIR);
const CORE = FILES.filter(isCore);
const VENDOR_FILES = FILES.filter((file) => file.startsWith(VENDOR_DIR));
const gamePage = (slug) => `src/games/${slug}/index.html`;

if (VERSION !== 'dev') {
  self.addEventListener('install', (event) => {
    // "Installed" means the home page works offline, and so does every game the child had saved before this deploy.
    event.waitUntil(
      caches.open(CACHE)
        .then(async (cache) => {
          await cache.addAll(CORE);
          await resaveEarlierGames(cache);
        })
        .then(() => self.skipWaiting()),
    );
  });

  self.addEventListener('activate', (event) => {
    // Drop caches from older deploys, then start controlling open pages straight away.
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    if (new URL(request.url).origin !== self.location.origin) return; // never touch other origins
    event.respondWith(respond(request, event));
  });
}

/** The path of a request relative to the folder the worker lives in (the same form as FILES), or null if it is outside the site. */
function relativePath(url) {
  const base = new URL('./', self.location.href).pathname;
  if (!url.pathname.startsWith(base)) return null;
  const path = url.pathname.slice(base.length);
  return path === '' || path.endsWith('/') ? `${path}index.html` : path;
}

/** The game a request is the page of (src/games/<slug>/index.html), or null. Only a game's own page starts saving the game. */
function gameOfPage(url) {
  const match = /^src\/games\/([^/]+)\/index\.html$/.exec(relativePath(url) ?? '');
  return match ? match[1] : null;
}

/**
 * Cache first (the cache is versioned, so it is never stale), then the network, then, for a page, a redirect home.
 * A game's own page is not stored as it goes by: it is stored last, once the whole game is, so "the page is stored" always means
 * "the game works offline".
 */
async function respond(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const slug = gameOfPage(new URL(request.url));
  try {
    const response = await fetch(request);
    if (response.ok) {
      if (slug === null) cache.put(request, response.clone());
      else event.waitUntil(saveGame(slug).catch((error) => console.error(`[offline] could not save ${slug} for offline play`, error)));
    }
    return response;
  } catch (error) {
    if (request.mode === 'navigate' && (await cache.match('./'))) {
      // Redirect to the home page rather than serving its HTML under the wrong address: the page links its
      // scripts with relative paths, which would resolve against the unknown address and fail to load.
      // For a game that was never saved, the home page is told which one, so it can say why the game did not open.
      const home = new URL('./', self.location.href);
      if (slug !== null) home.searchParams.set('offline', slug);
      return Response.redirect(home.href, 302);
    }
    throw error;
  }
}

/** Games being saved right now, so opening one in two tabs downloads it once. */
const saving = new Map();

/**
 * Stores every file of a game. Its page goes in last, so if the connection drops half way nothing claims the game is
 * available offline, and the next time it is opened online the saving starts again.
 * @param {string} slug
 * @returns {Promise<void>}
 */
function saveGame(slug) {
  if (!saving.has(slug)) {
    saving.set(slug, caches.open(CACHE).then((cache) => saveGameInto(cache, slug)).finally(() => saving.delete(slug)));
  }
  return saving.get(slug);
}

async function saveGameInto(cache, slug) {
  if (await cache.match(gamePage(slug))) return;
  // Someone who turned on their browser's data saver gets only what they play; the grown-ups' "download everything" still works.
  if (self.navigator?.connection?.saveData) return;
  const files = FILES.filter((file) => file.startsWith(`src/games/${slug}/`));
  await fetchInto(cache, files.filter((file) => file !== gamePage(slug)));
  await fetchInto(cache, [gamePage(slug)]);
}

/** Fetches files that are not stored yet and stores them, a few at a time. Fails if any file cannot be fetched. */
async function fetchInto(cache, files) {
  for (let i = 0; i < files.length; i += BATCH) {
    await Promise.all(files.slice(i, i + BATCH).map(async (file) => {
      if (await cache.match(file)) return;
      const response = await fetch(file);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      await cache.put(file, response);
    }));
  }
}

/**
 * A new deploy starts with an empty cache, so the games the child had saved are saved again, from the new files. It is best effort: a
 * game that cannot be fetched now is simply saved again the next time it is opened online. Only these are re-downloaded, so a deploy costs
 * what the child uses, not the size of the site.
 */
async function resaveEarlierGames(cache) {
  const earlier = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE);
  const slugs = new Set();
  let usedVendor = false;
  for (const name of earlier) {
    const old = await caches.open(name);
    for (const slug of new Set(FILES.map((file) => GAME_FILE.exec(file)?.[1]).filter(Boolean))) {
      if (await old.match(gamePage(slug))) slugs.add(slug);
    }
    if (await old.match(VENDOR_PROBE)) usedVendor = true;
  }
  for (const slug of slugs) {
    await saveGameInto(cache, slug).catch((error) => console.error(`[offline] could not save ${slug} again after an update`, error));
  }
  if (usedVendor) await fetchInto(cache, VENDOR_FILES).catch((error) => console.error('[offline] could not save the 3D library again after an update', error));
}
