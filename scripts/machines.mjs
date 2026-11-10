// Keeps docs/STATE_MACHINES.md in step with the state machines in the code.
//
//   npm run machines            rewrites the diagram of every machine in the doc
//   npm run machines -- --check exits 1 if the doc is out of date (the unit tests run the same check)
//
// A machine is any object exported from a `*.machine.js` file under src/ (see src/engine/utils/stateMachine.js).
// Each one gets a block in the doc between two marker comments; everything outside the markers is hand-written.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { toMermaid } from '../src/engine/utils/stateMachine.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DOC_PATH = join(ROOT, 'docs', 'STATE_MACHINES.md');

/** @returns {string[]} Every `*.machine.js` file under `dir`, sorted. */
function machineFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return machineFiles(full);
    return name.endsWith('.machine.js') ? [full] : [];
  }).sort();
}

/**
 * Loads every machine definition in the project.
 * @param {string} [root] Project root.
 * @returns {Promise<{ file: string, exportName: string, definition: import('../src/engine/utils/stateMachine.js').MachineDefinition }[]>}
 *   `file` is relative to the root, with forward slashes. Sorted by machine id.
 */
export async function discoverMachines(root = ROOT) {
  const found = [];
  for (const full of machineFiles(join(root, 'src'))) {
    const module = await import(pathToFileURL(full).href);
    for (const [exportName, value] of Object.entries(module)) {
      if (value && typeof value === 'object' && 'states' in value && 'initial' in value) {
        found.push({ file: relative(root, full).split(sep).join('/'), exportName, definition: value });
      }
    }
  }
  return found.sort((a, b) => a.definition.id.localeCompare(b.definition.id));
}

const markers = (id) => ({ start: `<!-- machine:${id}:start -->`, end: `<!-- machine:${id}:end -->` });

/** The generated block for one machine: its diagram, between the markers. */
export function renderBlock(definition) {
  const { start, end } = markers(definition.id);
  return `${start}\n\`\`\`mermaid\n${toMermaid(definition)}\n\`\`\`\n${end}`;
}

/**
 * Compares a doc with the machines in the code.
 * @param {string} doc
 * @param {{ definition: { id: string } }[]} machines
 * @returns {{ missing: string[], stale: string[], unknown: string[] }}
 *   `missing`: machines with no block. `stale`: blocks that differ from the code. `unknown`: blocks for machines that no longer exist.
 */
export function checkDoc(doc, machines) {
  const missing = [];
  const stale = [];
  for (const { definition } of machines) {
    const { start, end } = markers(definition.id);
    const from = doc.indexOf(start);
    const to = doc.indexOf(end);
    if (from === -1 || to === -1 || to < from) missing.push(definition.id);
    else if (doc.slice(from, to + end.length) !== renderBlock(definition)) stale.push(definition.id);
  }
  const known = new Set(machines.map((m) => m.definition.id));
  const unknown = [...doc.matchAll(/<!-- machine:(.+?):start -->/g)].map((m) => m[1]).filter((id) => !known.has(id));
  return { missing, stale, unknown };
}

/** Rewrites every existing block to match the code. Blocks that are missing are not invented: where they go is an editorial choice. */
export function updateDoc(doc, machines) {
  let next = doc;
  for (const { definition } of machines) {
    const { start, end } = markers(definition.id);
    const from = next.indexOf(start);
    const to = next.indexOf(end);
    if (from !== -1 && to > from) next = next.slice(0, from) + renderBlock(definition) + next.slice(to + end.length);
  }
  return next;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const machines = await discoverMachines();
  const doc = readFileSync(DOC_PATH, 'utf8');
  if (process.argv.includes('--check')) {
    const { missing, stale, unknown } = checkDoc(doc, machines);
    for (const id of missing) console.error(`docs/STATE_MACHINES.md has no block for "${id}"`);
    for (const id of stale) console.error(`docs/STATE_MACHINES.md is out of date for "${id}"; run: npm run machines`);
    for (const id of unknown) console.error(`docs/STATE_MACHINES.md has a block for "${id}", which no longer exists`);
    process.exit(missing.length + stale.length + unknown.length ? 1 : 0);
  }
  const updated = updateDoc(doc, machines);
  writeFileSync(DOC_PATH, updated);
  const { missing } = checkDoc(updated, machines);
  console.log(`${machines.length} machines; doc ${updated === doc ? 'already up to date' : 'updated'}.`);
  if (missing.length) {
    console.log(`No block yet for: ${missing.join(', ')}. Add the two marker comments where it belongs, then run this again.`);
    process.exit(1);
  }
}
