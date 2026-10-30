/* Service worker: makes the whole site work offline after the first visit.

   This file is a template. `npm run build` copies it to dist/sw.js with the two lines below filled in:
   VERSION (a hash of every shipped file, so a deploy always gets a fresh cache) and PRECACHE (every shipped file).
   Served straight from the repo (`npm start`) VERSION stays 'dev' and the worker does nothing at all, so local
   development never sees stale cached files. */

const VERSION = 'dev'; // __VERSION__
const PRECACHE = []; // __PRECACHE__

const CACHE_PREFIX = 'kidsgames-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

if (VERSION !== 'dev') {
  self.addEventListener('install', (event) => {
    // Everything is fetched and stored before the worker is considered installed, so "installed" means
    // "the whole site is available offline".
    event.waitUntil(
      caches.open(CACHE)
        .then((cache) => cache.addAll(PRECACHE))
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
    event.respondWith(respond(request));
  });
}

/** Cache first (the cache is versioned, so it is never stale), then the network, then a redirect home for pages. */
async function respond(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (request.mode === 'navigate' && (await cache.match('./'))) {
      // Redirect to the home page rather than serving its HTML under the wrong address: the page links its
      // scripts with relative paths, which would resolve against the unknown address and fail to load.
      return Response.redirect(new URL('./', self.location.href).href, 302);
    }
    throw error;
  }
}
