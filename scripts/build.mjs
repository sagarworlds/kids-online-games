// Copies the files that ship to production into dist/.
//
// Why a copy step at all? The site has no bundler, but publishing the repo root
// directly would also expose tests/, docs/ and tooling. Keeping an explicit
// allow-list here means a stray file can never be deployed by accident.
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Paths (relative to the repo root) that are part of the public site. */
const SHIPPED = ['index.html', '404.html', 'favicon.svg', 'src'];

/** Counts files under a directory, for the build summary. */
async function countFiles(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? await countFiles(full) : 1;
  }
  return total;
}

async function build() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const rel of SHIPPED) {
    const from = join(ROOT, rel);
    if (!existsSync(from)) {
      throw new Error(`build: expected "${rel}" to exist but it is missing`);
    }
    await cp(from, join(DIST, rel), { recursive: true });
  }

  if (!(await stat(join(DIST, 'index.html'))).isFile()) {
    throw new Error('build: dist/index.html was not produced');
  }
  console.log(`build: copied ${await countFiles(DIST)} files into dist/`);
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
