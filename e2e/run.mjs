// Builds the site and runs the browser checks against the build.
//
//   npm test                          everything
//   npm test -- smoke                 only the spec files whose name contains "smoke"
//   E2E_GAMES=lights-out npm test     only one game (comma separated slugs)
//   E2E_SKIP_BUILD=1 npm test         reuse the dist/ folder that is already there
//   E2E_RETRIES=1 npm test            run a failed check once more before calling it failed (CI does this)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '..');

if (!process.env.E2E_SKIP_BUILD) {
  const build = spawnSync(process.execPath, [resolve(REPO, 'scripts/build.mjs')], { stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('The build failed, so there is nothing to test.');
    process.exit(build.status ?? 1);
  }
}

const filters = process.argv.slice(2);
const specs = readdirSync(resolve(HERE, 'specs'))
  .filter((name) => name.endsWith('.e2e.mjs'))
  .filter((name) => filters.length === 0 || filters.some((word) => name.includes(word)))
  .sort()
  .map((name) => resolve(HERE, 'specs', name));

if (specs.length === 0) {
  console.error(`No spec file matches ${JSON.stringify(filters)}.`);
  process.exit(1);
}

// One spec file at a time: each one drives a software-rendered browser, which already uses the whole machine.
const run = spawnSync(process.execPath, ['--test', `--test-concurrency=${process.env.E2E_CONCURRENCY ?? 1}`, ...specs], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(run.status ?? 1);
