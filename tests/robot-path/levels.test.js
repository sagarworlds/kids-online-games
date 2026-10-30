import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseLevels, levelKey } from '../../src/games/robot-path/logic/levels.js';
import { compile, run, execute } from '../../src/games/robot-path/logic/interpreter.js';
import { countBlocks } from '../../src/games/robot-path/logic/program.js';
import { starsFor } from '../../src/games/robot-path/logic/scoring.js';
import { shortestCommands, shortestCollectingLength } from './solver.js';
import { solutions } from './solutions.js';

const raw = JSON.parse(readFileSync(new URL('../../src/games/robot-path/data/levels.json', import.meta.url), 'utf8'));
const { worlds, levels } = parseLevels(raw);

const asBlocks = (commands) => commands.map((type) => ({ type }));
const typesIn = (commands, found = new Set()) => {
  for (const c of commands) {
    found.add(c.type);
    if (c.body) typesIn(c.body, found);
  }
  return found;
};

// ---- the shipped data ------------------------------------------------------

test('levels.json has 30 levels in 3 worlds of 10, numbered 1-30', () => {
  assert.deepEqual(levels.map((l) => l.id), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual(worlds.map((w) => w.id), [1, 2, 3]);
  for (const w of worlds) assert.equal(levels.filter((l) => l.world === w.id).length, 10, `world ${w.id}`);
  assert.deepEqual(worlds.map((w) => w.size), [[5, 5], [6, 6], [7, 7]], 'grid sizes from the spec');
});

test('worlds unlock blocks in order: turns, then Repeat, then Pick gem and Function F', () => {
  assert.deepEqual(worlds[0].allowed, ['forward', 'left', 'right']);
  assert.deepEqual(worlds[1].allowed, ['forward', 'left', 'right', 'repeat']);
  assert.deepEqual(worlds[2].allowed, ['forward', 'left', 'right', 'repeat', 'pick', 'callF']);
  for (const level of levels) assert.deepEqual(level.allowed, worlds[level.world - 1].allowed);
});

test('every level is well formed', () => {
  const titles = new Set();
  for (const l of levels) {
    const where = `level ${l.id} (${l.title})`;
    const [cols, rows] = l.size;
    const inBoard = ([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows;
    assert.ok(l.title && l.tip, `${where}: title and tip`);
    assert.ok(!titles.has(l.title), `${where}: duplicate title`);
    titles.add(l.title);
    assert.ok(inBoard([l.start.x, l.start.y]) && inBoard([l.goal.x, l.goal.y]), where);
    assert.ok(!(l.start.x === l.goal.x && l.start.y === l.goal.y), `${where}: start is the goal`);
    const taken = new Set(l.walls.map(([x, y]) => `${x},${y}`));
    assert.ok(!taken.has(`${l.start.x},${l.start.y}`) && !taken.has(`${l.goal.x},${l.goal.y}`), `${where}: rock on start/goal`);
    for (const gem of l.gems) {
      assert.ok(!taken.has(gem.join(',')), `${where}: gem inside a rock`);
      assert.ok(!(gem[0] === l.goal.x && gem[1] === l.goal.y), `${where}: gem on the battery`);
    }
    assert.ok(l.par >= 1 && l.par <= l.maxBlocks && l.maxBlocks <= 20, `${where}: par ${l.par}, max ${l.maxBlocks}`);
    assert.equal(l.gems.length > 0, l.world === 3 && l.id > 20, `${where}: gems only in World 3`);
  }
});

// ---- every level can be solved within maxBlocks (spec acceptance criterion) -

test('every level has a route to the battery (BFS solver)', () => {
  for (const l of levels) assert.ok(shortestCommands(l), `level ${l.id} is unreachable`);
});

test('World 1: par is exactly the shortest route, and playing that route wins within maxBlocks', () => {
  for (const l of levels.filter((x) => x.world === 1)) {
    const commands = shortestCommands(l);
    assert.equal(commands.length, l.par, `level ${l.id}: par should be the optimum`);
    assert.ok(commands.length <= l.maxBlocks, `level ${l.id}: fits in maxBlocks`);
    const { outcome } = execute(l, { main: asBlocks(commands), f: [] });
    assert.equal(outcome.status, 'success', `level ${l.id}`);
    assert.equal(starsFor({ reachedGoal: true, blocks: commands.length, par: l.par, collected: 0, totalGems: 0 }), 3);
  }
});

test('World 1 difficulty never goes down by more than a step, and stays within the strip', () => {
  const pars = levels.filter((l) => l.world === 1).map((l) => l.par);
  assert.deepEqual(pars, [...pars].sort((a, b) => a - b), `pars should rise: ${pars}`);
  assert.ok(Math.max(...pars) + 3 <= 16);
});

test('Worlds 2 and 3: every level has a reference solution that earns 3 stars', () => {
  const ids = levels.filter((l) => l.world > 1).map((l) => l.id);
  assert.deepEqual(Object.keys(solutions).map(Number), ids, 'one reference per level, no extras');
  for (const l of levels.filter((x) => x.world > 1)) {
    const program = solutions[l.id];
    const blocks = countBlocks(program);
    assert.equal(blocks, l.par, `level ${l.id}: par is the reference's block count`);
    assert.ok(blocks <= l.maxBlocks, `level ${l.id}: fits in maxBlocks`);
    for (const type of typesIn([...program.main, ...program.f])) {
      assert.ok(l.allowed.includes(type), `level ${l.id}: reference uses "${type}", which this world does not allow`);
    }
    const { outcome } = execute(l, program);
    assert.equal(outcome.status, 'success', `level ${l.id} (${l.title})`);
    assert.equal(outcome.collected, l.gems.length, `level ${l.id}: collects every gem`);
    assert.equal(starsFor({ reachedGoal: true, blocks, par: l.par, collected: outcome.collected, totalGems: outcome.totalGems }), 3);
    assert.equal(compile(program).truncated, false, `level ${l.id}: stays under the 200-step cap`);
  }
});

test('World 2 levels cannot be finished with plain blocks: a Repeat is genuinely needed', () => {
  for (const l of levels.filter((x) => x.world === 2)) {
    const plain = shortestCollectingLength(l);
    assert.ok(plain > l.maxBlocks, `level ${l.id} (${l.title}): a plain program of ${plain} blocks would fit in ${l.maxBlocks}`);
    const usesRepeat = typesIn(solutions[l.id].main).has('repeat');
    assert.ok(usesRepeat, `level ${l.id}: reference should use Repeat`);
  }
});

test('World 3 levels 22-30 need a Repeat or Function F to collect every gem within the limit', () => {
  for (const l of levels.filter((x) => x.id >= 22 && x.world === 3)) {
    const plain = shortestCollectingLength(l);
    assert.ok(plain > l.maxBlocks, `level ${l.id} (${l.title}): a plain program of ${plain} blocks would fit in ${l.maxBlocks}`);
  }
});

test('Function F is used by the levels from 23 on, and not before', () => {
  for (const l of levels.filter((x) => x.id >= 21)) {
    const usesCall = typesIn(solutions[l.id].main).has('callF');
    assert.equal(usesCall, l.id >= 23, `level ${l.id} (${l.title})`);
  }
});

test('no level can be won by doing nothing, and a program-free run reports "empty"', () => {
  for (const l of levels) assert.equal(run(l, { steps: [] }).outcome.status, 'empty');
});

test('level keys are stable ("level-N") so saved stars keep working', () => {
  assert.equal(levelKey(7), 'level-7');
});

// ---- validation of bad data ------------------------------------------------

const world = { id: 1, name: 'W', size: [3, 3], allowed: ['forward', 'left', 'right'] };
const goodLevel = { id: 1, world: 1, title: 't', map: ['>.G', '...', '...'], par: 2, maxBlocks: 4 };
const parse = (patch, w = world) => parseLevels({ worlds: [w], levels: [{ ...goodLevel, ...patch }] });

test('a valid minimal file parses into a Level', () => {
  const { levels: [l] } = parse({});
  assert.deepEqual(l.start, { x: 0, y: 0, dir: 'E' });
  assert.deepEqual(l.goal, { x: 2, y: 0 });
  assert.deepEqual(l.size, [3, 3]);
});

test('bad level data is rejected with the file and the exact field', () => {
  const bad = (patch, field, w) =>
    assert.throws(() => parse(patch, w), (e) => e.code === 'INVALID_DATA' && e.context.file === 'levels.json' && e.context.field === field,
      `${JSON.stringify(patch)} should fail on ${field}`);

  bad({ map: ['>.G', '...'] }, 'levels[0].map');                    // wrong row count
  bad({ map: ['>.G', '..', '...'] }, 'levels[0].map[1]');          // wrong row length
  bad({ map: ['>.G', '.?.', '...'] }, 'levels[0].map[1]');         // unknown character
  bad({ map: ['>..', '...', '...'] }, 'levels[0].map');            // no goal
  bad({ map: ['..G', '...', '...'] }, 'levels[0].map');            // no start
  bad({ map: ['>>G', '...', '...'] }, 'levels[0].map[0]');         // two starts
  bad({ map: ['>GG', '...', '...'] }, 'levels[0].map[0]');         // two goals
  bad({ map: ['>*G', '...', '...'] }, 'levels[0].map');            // gem where there is no pick block
  bad({ par: 0 }, 'levels[0].par');
  bad({ par: 5, maxBlocks: 4 }, 'levels[0].maxBlocks');            // maxBlocks below par
  bad({ maxBlocks: 99 }, 'levels[0].maxBlocks');
  bad({ world: 9 }, 'levels[0].world');
  bad({ title: '' }, 'levels[0].title');
  bad({ id: 0 }, 'levels[0].id');
  bad({}, 'worlds[0].size', { ...world, size: [1, 3] });
  bad({}, 'worlds[0].allowed', { ...world, allowed: ['fly'] });
});

test('duplicate level ids are rejected, and empty files are rejected', () => {
  assert.throws(() => parseLevels({ worlds: [world], levels: [goodLevel, goodLevel] }), (e) => e.context.field === 'levels[1].id');
  assert.throws(() => parseLevels({ worlds: [world], levels: [] }), (e) => e.context.field === 'levels');
  assert.throws(() => parseLevels({}), (e) => e.context.field === 'worlds');
});

test('rows run top to bottom and start arrows set the facing', () => {
  const { levels: [l] } = parse({ map: ['..G', '...', '^#.'], par: 2, maxBlocks: 4 });
  assert.deepEqual(l.start, { x: 0, y: 2, dir: 'N' });
  assert.deepEqual(l.walls, [[1, 2]]);
  for (const [ch, dir] of [['^', 'N'], ['>', 'E'], ['v', 'S'], ['<', 'W']]) {
    assert.equal(parse({ map: [`${ch}.G`, '...', '...'] }).levels[0].start.dir, dir);
  }
});
