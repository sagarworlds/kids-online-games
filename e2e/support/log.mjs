import assert from 'node:assert/strict';

// Noise a headless software renderer or a locked-down browser makes that says nothing about our code.
const BENIGN = /GPU stall|swiftshader|software WebGL|GroupMarkerNotSet|GL Driver Message|AudioContext was not allowed|Service worker registration blocked/i;

/** True for any request for the three.js library files, which are only worth downloading when a 3D view is on screen. */
const THREE_LIBRARY = /\/src\/vendor\/three\/three\.(module|core)\.js/;

/**
 * Listens to everything a page reports and sorts it into "expected" (the scenario causes it on purpose) and "unexpected".
 * A check passes only when nothing unexpected happened, so a game that logs an error, throws, or asks for a file that is not there fails.
 *
 * @param {import('playwright').Page} page
 * @param {{ expected?: RegExp[] }} [options] Patterns matched against `"<kind>: <text>"`. Use them for failures a scenario injects
 *   (an aborted file, a lost graphics context), then check that the game logged them with `sawExpected`.
 */
export function watchPage(page, { expected = [] } = {}) {
  /** @type {string[]} */ const requests = [];
  /** @type {string[]} */ const unexpected = [];
  /** @type {string[]} */ const expectedSeen = [];

  const note = (kind, text) => {
    const line = `${kind}: ${text}`;
    (expected.some((pattern) => pattern.test(line)) ? expectedSeen : unexpected).push(line);
  };

  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = message.text();
    if (BENIGN.test(text)) return;
    // The browser words a failed download as this; the response and requestfailed listeners below report it with the address.
    if (/^Failed to load resource/.test(text)) return;
    note(`console ${type}`, text);
  });
  page.on('pageerror', (error) => note('uncaught error', error.message));
  page.on('requestfailed', (request) => note('request failed', `${request.url()} (${request.failure()?.errorText})`));
  page.on('response', (response) => {
    if (response.status() >= 400) note('bad response', `${response.status()} ${response.url()}`);
  });

  return {
    requests,
    unexpected,
    expectedSeen,
    /** Has the three.js library been requested since the page opened (or since `fromIndex` requests)? */
    loadedThree: (fromIndex = 0) => requests.slice(fromIndex).some((url) => THREE_LIBRARY.test(url)),
    /** Did the game log (or the browser report) something that matches? */
    sawExpected: (pattern) => expectedSeen.some((line) => pattern.test(line)),
    /** Fails with the list of problems when the page reported anything unexpected. */
    assertClean() {
      assert.deepEqual(unexpected, [], 'the page reported problems');
    },
    /** A readable dump for a failure report. */
    describe() {
      return [
        `unexpected (${unexpected.length}):`, ...unexpected.map((line) => `  ${line}`),
        `expected (${expectedSeen.length}):`, ...expectedSeen.map((line) => `  ${line}`),
        `requests (${requests.length}, last 40):`, ...requests.slice(-40).map((url) => `  ${url}`),
      ].join('\n');
    },
  };
}
