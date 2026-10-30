// Copies the files that ship to production into dist/ and generates dist/sw.js (the offline service worker).
//
// Why a copy step at all? The site has no bundler, but publishing the repo root directly would also expose
// tests/, docs/ and tooling. Keeping an explicit allow-list here means a stray file can never be deployed by accident.
import { cp, mkdir, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Paths (relative to the repo root) that are part of the public site. */
export const SHIPPED = ['index.html', '404.html', 'favicon.svg', 'src'];

/** All files under a directory, as sorted paths relative to it (with "/" separators). */
async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out.sort();
}

/**
 * Hash of every file's path and contents, plus the worker script itself: it changes if and only if something
 * shipped changes (a game file, or how the worker behaves), so each deploy gets its own offline cache and old
 * caches can be deleted.
 */
async function contentVersion(dir, files, workerTemplate) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(join(dir, file)));
  }
  hash.update(workerTemplate);
  return hash.digest('hex').slice(0, 12);
}

/**
 * Builds the site.
 * @param {{ root?: string, out?: string }} [options] Defaults to the repo and its dist/ folder; tests pass a temp folder.
 * @returns {Promise<{ files: string[], version: string }>} Every shipped file (sw.js excluded) and the offline cache version.
 */
export async function build({ root = REPO, out = join(REPO, 'dist') } = {}) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  for (const rel of SHIPPED) {
    const from = join(root, rel);
    if (!existsSync(from)) throw new Error(`build: expected "${rel}" to exist but it is missing`);
    await cp(from, join(out, rel), { recursive: true });
  }
  if (!(await stat(join(out, 'index.html'))).isFile()) throw new Error('build: index.html was not produced');

  const template = await readFile(join(root, 'sw.js'), 'utf8');
  const files = await listFiles(out);
  const version = await contentVersion(out, files, template);
  // The home page URL ("./") is cached too, since "/" is what people actually open. 404.html is not worth caching.
  const precache = ['./', ...files.filter((f) => f !== '404.html')];

  const worker = template
    .replace(/^const VERSION = .*\/\/ __VERSION__$/m, `const VERSION = ${JSON.stringify(version)};`)
    .replace(/^const PRECACHE = .*\/\/ __PRECACHE__$/m, `const PRECACHE = ${JSON.stringify(precache)};`);
  if (worker === template || worker.includes('// __VERSION__') || worker.includes('// __PRECACHE__')) {
    throw new Error('build: could not fill in the VERSION / PRECACHE lines of sw.js');
  }
  await writeFile(join(out, 'sw.js'), worker);
  return { files, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build()
    .then(({ files, version }) => console.log(`build: copied ${files.length} files into dist/ (offline cache ${version})`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
