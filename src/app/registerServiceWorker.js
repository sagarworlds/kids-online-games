/**
 * Registers the offline service worker (`/sw.js`). Called by the hub and by every game page, so whichever page
 * the child opens first makes the whole site available offline.
 *
 * Failure is never fatal: no service worker support (or a browser that blocks it in private mode) simply means
 * no offline mode. The error is logged once and the game carries on.
 *
 * @param {{
 *   nav?: Navigator, scriptUrl?: URL|string, logger?: Pick<Console, 'error'>
 * }} [options] Injectable for tests.
 * @returns {Promise<ServiceWorkerRegistration|null>} The registration, or null when unsupported or failed.
 */
export async function registerServiceWorker({
  nav = globalThis.navigator,
  // Resolved from this module, so it is the site-root sw.js from every page (hub and games).
  scriptUrl = new URL('../../sw.js', import.meta.url),
  logger = console,
} = {}) {
  if (!nav || !('serviceWorker' in nav)) return null;
  try {
    return await nav.serviceWorker.register(scriptUrl);
  } catch (error) {
    logger.error('[offline] could not register the service worker; offline mode is off', error);
    return null;
  }
}
