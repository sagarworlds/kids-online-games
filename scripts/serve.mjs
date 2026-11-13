// Tiny zero-dependency static file server for local development and for the browser tests in e2e/.
// Usage: `npm start` (repo root) or `npm run start:dist` (built output).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/**
 * Builds a static file server for one folder. It does not start listening; the caller does.
 *
 * @param {{ root: string, headers?: Record<string, string> }} options `root` is the folder to serve. `headers` are added to
 *   every response, so the browser tests can send the same security headers as production (see render.yaml).
 * @returns {import('node:http').Server}
 */
export function createStaticServer({ root, headers = {} }) {
  const base = resolve(root);

  /** Resolves a URL path to a file inside `base`, or null if it would escape it. */
  const resolveSafe = (urlPath) => {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const target = normalize(join(base, decoded));
    // The trailing separator check stops "/repo-evil" matching "/repo".
    return target === base || target.startsWith(base + sep) ? target : null;
  };

  return createServer(async (req, res) => {
    try {
      let file = resolveSafe(req.url ?? '/');
      if (!file) {
        res.writeHead(403, headers).end('Forbidden');
        return;
      }
      if ((await stat(file).catch(() => null))?.isDirectory()) {
        file = join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, {
        ...headers,
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        // Dev server: never cache, so edits show up on reload.
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' }).end('Not found');
      } else {
        console.error('serve:', error);
        res.writeHead(500, headers).end('Server error');
      }
    }
  });
}

// Only listen when this file is run directly, not when the tests import it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(REPO, process.argv[2] ?? '.');
  const port = Number(process.env.PORT ?? 3000);
  createStaticServer({ root }).listen(port, () => {
    console.log(`Serving ${root} at http://localhost:${port}`);
  });
}
