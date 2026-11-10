// Project-wide checks on every state machine (any `*.machine.js` under src/). Adding a machine adds it to these checks
// automatically; see docs/STATE_MACHINES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createMachine, lintMachine } from '../../src/engine/utils/stateMachine.js';
import { discoverMachines, checkDoc, DOC_PATH } from '../../scripts/machines.mjs';

const machines = await discoverMachines();

test('the project has state machines to check (so a broken discovery cannot make these tests pass by checking nothing)', () => {
  assert.ok(machines.length >= 8, `found only ${machines.length}`);
});

test('every machine definition is sound: all states reachable, no dead ends that are not marked final', () => {
  const problems = machines.flatMap(({ definition }) => lintMachine(definition));
  assert.deepEqual(problems, []);
});

test('machine ids are unique and follow <game-slug>/<name>', () => {
  const ids = machines.map((m) => m.definition.id);
  assert.deepEqual(ids, [...new Set(ids)], 'duplicate ids');
  const problems = [];
  for (const { file, definition } of machines) {
    const slug = file.match(/^src\/games\/([^/]+)\//)?.[1];
    if (slug && !definition.id.startsWith(`${slug}/`)) problems.push(`${file}: id "${definition.id}" should start with "${slug}/"`);
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(definition.id)) problems.push(`${file}: id "${definition.id}" is not lower-case words joined by "/"`);
  }
  assert.deepEqual(problems, []);
});

test('every game machine sits in its game\'s logic/ folder, where the purity rules apply', () => {
  const misplaced = machines.filter(({ file }) => /^src\/games\//.test(file) && !/^src\/games\/[^/]+\/logic\//.test(file)).map((m) => m.file);
  assert.deepEqual(misplaced, []);
});

test('every machine can be started and has an event for each way out of its initial state', () => {
  for (const { definition } of machines) {
    const machine = createMachine(definition);
    assert.equal(machine.state, definition.initial);
    const exits = Object.keys(definition.states[definition.initial].on);
    assert.ok(exits.length > 0 || definition.states[definition.initial].final, `${definition.id}: the initial state is a dead end`);
    for (const event of exits) assert.equal(machine.can(event), true);
  }
});

test('the "pausable" and "inputOpen" tags are only on states that can be left or are live (never on a finished state)', () => {
  const problems = [];
  for (const { definition } of machines) {
    for (const [name, config] of Object.entries(definition.states)) {
      if (config.final && (config.tags.includes('pausable') || config.tags.includes('inputOpen'))) {
        problems.push(`${definition.id}: final state "${name}" must not be pausable or accept input`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('docs/STATE_MACHINES.md has an up-to-date diagram for every machine, and none for machines that are gone (run `npm run machines`)', () => {
  const { missing, stale, unknown } = checkDoc(readFileSync(DOC_PATH, 'utf8'), machines);
  assert.deepEqual({ missing, stale, unknown }, { missing: [], stale: [], unknown: [] });
});

// ---- the doc checker itself: a check that can never fail proves nothing ----------------------------------------------

test('checkDoc reports a block that is missing, stale or for a machine that is gone, and updateDoc repairs only the stale one', async () => {
  const { renderBlock, updateDoc } = await import('../../scripts/machines.mjs');
  const [first, second] = machines;
  const good = `${renderBlock(first.definition)}\n\n${renderBlock(second.definition)}`;
  assert.deepEqual(checkDoc(good, [first, second]), { missing: [], stale: [], unknown: [] });

  const stale = good.replace('[*] --> ', '[*] --> WRONG_');
  assert.deepEqual(checkDoc(stale, [first, second]).stale, [first.definition.id]);
  assert.deepEqual(checkDoc(updateDoc(stale, [first, second]), [first, second]), { missing: [], stale: [], unknown: [] });

  assert.deepEqual(checkDoc(renderBlock(first.definition), [first, second]).missing, [second.definition.id]);
  assert.deepEqual(checkDoc(good, [first]).unknown, [second.definition.id]);
});
