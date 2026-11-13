import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER_YAML = resolve(REPO, 'render.yaml');

/**
 * The security headers production sends on every page, read from render.yaml so the browser tests can never drift from
 * what is really deployed (the Content-Security-Policy above all: a page that works without it can still be blocked by it).
 *
 * @param {string} [file] Path to the Render blueprint; the repository's own by default.
 * @returns {Record<string, string>} Header name to value, for the entries that apply to every path.
 * @throws {Error} When the file has no Content-Security-Policy entry, which means its layout changed and this reader needs updating.
 */
export function productionHeaders(file = RENDER_YAML) {
  const text = readFileSync(file, 'utf8');
  const headers = {};
  // Every entry is three consecutive lines: `- path: …`, `name: …`, `value: …` (the value may be quoted).
  for (const match of text.matchAll(/-\s*path:\s*(\S+)\s*\n\s*name:\s*([A-Za-z-]+)\s*\n\s*value:\s*(.+?)\s*$/gm)) {
    const [, path, name, rawValue] = match;
    if (path !== '/*') continue; // other paths (the service worker's Cache-Control) are not needed for the pages
    headers[name] = rawValue.replace(/^"(.*)"$/, '$1');
  }
  if (!headers['Content-Security-Policy']) {
    throw new Error(`No Content-Security-Policy found for "/*" in ${file}. Did the headers section of render.yaml change shape?`);
  }
  return headers;
}
