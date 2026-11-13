import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStaticServer } from '../../scripts/serve.mjs';
import { productionHeaders, REPO } from './headers.mjs';

/**
 * Serves the built site (`dist/`, what Render publishes) on a free port with the production security headers.
 * Testing the build rather than the source tree means a file the build forgets to ship fails here, not in front of a child.
 *
 * @param {{ root?: string }} [options] `root` is relative to the repository; `dist` by default.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 * @throws {Error} When the folder does not exist yet (the build has not run).
 */
export async function startSite({ root = process.env.E2E_ROOT ?? 'dist' } = {}) {
  const folder = resolve(REPO, root);
  if (!existsSync(resolve(folder, 'index.html'))) {
    throw new Error(`${folder} has no index.html. Run "npm run build" in the repository root first (or use "npm test" in e2e/, which builds).`);
  }
  const server = createStaticServer({ root: folder, headers: productionHeaders() });
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => {
      server.close(() => done());
      server.closeAllConnections();
    }),
  };
}
