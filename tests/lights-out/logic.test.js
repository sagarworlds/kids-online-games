import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, toggle, isSolved, countLit, boardFromTaps } from '../../src/games/lights-out/logic/board.js';
import { solve, MAX_SIZE } from '../../src/games/lights-out/logic/solver.js';
import { generate, generateForLevel } from '../../src/games/lights-out/logic/puzzleGenerator.js';
import { newPuzzleState, tap, undo, restart } from '../../src/games/lights-out/logic/puzzleState.js';
import { starsForPuzzle, roundStars } from '../../src/games/lights-out/logic/scoring.js';
import { hintTap } from '../../src/games/lights-out/logic/hint.js';
import { LEVELS, LEVEL_IDS, getLevel } from '../../src/games/lights-out/logic/levels.js';
import { createRng } from '../../src/engine/utils/random.js';

const lit = (board) => board.flatMap((row, r) => row.map((on, c) => (on ? `${r},${c}` : null)).filter(Boolean));

// ---- toggle ----------------------------------------------------------------

test('tapping the centre flips the jar and its four neighbours', () => {
  assert.deepEqual(lit(toggle(createBoard(3), 1, 1)), ['0,1', '1,0', '1,1', '1,2', '2,1']);
});

test('tapping an edge flips three neighbours plus itself (four jars)', () => {
  assert.deepEqual(lit(toggle(createBoard(3), 0, 1)), ['0,0', '0,1', '0,2', '1,1']);
});

test('tapping a corner flips only the two neighbours that exist plus itself (three jars)', () => {
  assert.deepEqual(lit(toggle(createBoard(3), 0, 0)), ['0,0', '0,1', '1,0']);
  assert.deepEqual(lit(toggle(createBoard(3), 2, 2)), ['1,2', '2,1', '2,2']);
  for (const [r, c] of [[0, 0], [0, 4], [4, 0], [4, 4]]) assert.equal(countLit(toggle(createBoard(5), r, c)), 3);
});

test('toggle never changes its input, and tapping twice restores the exact board', () => {
  const start = boardFromTaps(4, [[0, 0], [2, 3]]);
  const snapshot = JSON.stringify(start);
  const once = toggle(start, 1, 1);
  assert.equal(JSON.stringify(start), snapshot);
  assert.notDeepEqual(once, start);
  assert.deepEqual(toggle(once, 1, 1), start);
});

test('toggle rejects jars that are not on the board', () => {
  for (const [r, c] of [[-1, 0], [0, 3], [3, 0], [0.5, 1]]) assert.throws(() => toggle(createBoard(3), r, c), { code: 'OUT_OF_BOARD' });
});

test('isSolved and countLit', () => {
  assert.equal(isSolved(createBoard(4)), true);
  assert.equal(isSolved(toggle(createBoard(4), 0, 0)), false);
  assert.equal(countLit(boardFromTaps(3, [[1, 1]])), 5);
});

// ---- solver: checked against brute force over EVERY board ------------------

/** Minimum taps for every board reachable on an n x n board, found by trying all 2^(n*n) tap sets. */
function bruteForce(n) {
  const cells = n * n;
  const effect = Array.from({ length: cells }, (_, i) => {
    let mask = 0;
    for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = Math.floor(i / n) + dr;
      const c = (i % n) + dc;
      if (r >= 0 && c >= 0 && r < n && c < n) mask |= 1 << (r * n + c);
    }
    return mask;
  });
  const best = new Map();
  for (let taps = 0; taps < 1 << cells; taps++) {
    let board = 0;
    let weight = 0;
    for (let i = 0; i < cells; i++) if (taps & (1 << i)) { board ^= effect[i]; weight++; }
    if (!best.has(board) || weight < best.get(board)) best.set(board, weight);
  }
  return best;
}
const maskToBoard = (mask, n) => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => Boolean(mask & (1 << (r * n + c)))));

for (const n of [2, 3, 4]) {
  test(`solver matches brute force on all ${2 ** (n * n)} possible ${n}x${n} boards (solvable ones get a minimum solution, the rest get null)`, () => {
    const best = bruteForce(n);
    let solvable = 0;
    for (let mask = 0; mask < 1 << (n * n); mask++) {
      const board = maskToBoard(mask, n);
      const solution = solve(board);
      if (!best.has(mask)) {
        assert.equal(solution, null, `board ${mask} cannot be solved`);
        continue;
      }
      solvable++;
      assert.equal(solution.length, best.get(mask), `board ${mask}: smallest solution`);
      assert.ok(isSolved(solution.reduce((b, [r, c]) => toggle(b, r, c), board)), `board ${mask}: the taps really clear it`);
    }
    // 3x3 and 2x2 boards are always solvable; 4x4 has 2^12 solvable boards of 2^16 (null space of dimension 4).
    assert.equal(solvable, { 2: 16, 3: 512, 4: 4096 }[n]);
  });
}

test('solver on 5x5: solves what it can, reports null for the rest, and an off board needs no taps', () => {
  assert.deepEqual(solve(createBoard(5)), []);
  const rng = createRng(31);
  let solved = 0;
  let unsolvable = 0;
  for (let i = 0; i < 300; i++) {
    const board = createBoard(5).map((row) => row.map(() => rng() < 0.5));
    const solution = solve(board);
    if (solution === null) { unsolvable++; continue; }
    solved++;
    assert.ok(isSolved(solution.reduce((b, [r, c]) => toggle(b, r, c), board)));
  }
  assert.ok(solved > 0 && unsolvable > 0, `random 5x5 boards are a mix (${solved} solvable, ${unsolvable} not)`);
});

test('solver rejects boards it cannot handle', () => {
  assert.throws(() => solve([]), { code: 'BAD_SIZE' });
  assert.throws(() => solve([[true, false], [false]]), { code: 'BAD_SIZE' });
  assert.throws(() => solve(createBoard(MAX_SIZE + 1)), { code: 'BAD_SIZE' });
});

// ---- generator -------------------------------------------------------------

for (const id of LEVEL_IDS) {
  test(`${id}: every generated puzzle is solvable, is not already solved, and the solver needs at most par taps`, () => {
    const level = LEVELS[id];
    const rng = createRng(100 + level.size);
    const pars = new Set();
    for (let i = 0; i < 300; i++) {
      const p = generateForLevel(id, rng);
      assert.equal(p.board.length, level.size);
      assert.ok(p.par >= level.minTaps && p.par <= level.maxTaps, `par ${p.par} in ${level.minTaps}-${level.maxTaps}`);
      assert.equal(p.solutionTaps.length, p.par);
      assert.equal(new Set(p.solutionTaps.map((t) => t.join(','))).size, p.par, 'taps are distinct');
      assert.equal(isSolved(p.board), false, 'not already solved');
      const solution = solve(p.board);
      assert.ok(solution, 'solvable');
      assert.ok(solution.length <= p.par, `solver found ${solution.length}, par is ${p.par}`);
      assert.ok(isSolved(p.solutionTaps.reduce((b, [r, c]) => toggle(b, r, c), p.board)), 'the recorded taps solve it');
      pars.add(p.par);
    }
    assert.equal(pars.size, level.maxTaps - level.minTaps + 1, 'every par in the range appears');
  });
}

test('level table matches the spec (3x3 / 4x4 / 5x5 with 2-3 / 4-6 / 7-10 taps)', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => [LEVELS[id].size, LEVELS[id].minTaps, LEVELS[id].maxTaps]), [[3, 2, 3], [4, 4, 6], [5, 7, 10]]);
  assert.throws(() => getLevel('huge'), { code: 'UNKNOWN_LEVEL' });
});

test('generation is deterministic for a seed and rejects impossible requests', () => {
  assert.deepEqual(generate(4, 5, createRng(9)), generate(4, 5, createRng(9)));
  assert.notDeepEqual(generate(4, 5, createRng(9)).board, generate(4, 5, createRng(10)).board);
  for (const taps of [0, 17, 2.5, NaN]) assert.throws(() => generate(4, taps, createRng(1)), { code: 'BAD_TAPS' });
});

test('a scramble that cancels itself out is retried, never returned as an already-solved puzzle', () => {
  // On 4x4 some tap sets are "null patterns" that leave the board dark. Whatever the seed, we never see one.
  for (let seed = 1; seed <= 400; seed++) assert.equal(isSolved(generate(4, 4 + (seed % 3), createRng(seed)).board), false);
});

// ---- puzzle state ----------------------------------------------------------

const puzzle = () => ({ board: boardFromTaps(3, [[0, 0], [2, 2]]), par: 2, solutionTaps: [[0, 0], [2, 2]] });

test('tapping toggles, counts moves, records history, and detects the win', () => {
  let s = newPuzzleState(puzzle(), 'easy');
  assert.equal(s.moves, 0);
  s = tap(s, 0, 0);
  assert.equal(s.moves, 1);
  assert.deepEqual(s.history, [[0, 0]]);
  assert.equal(s.solved, false);
  s = tap(s, 2, 2);
  assert.equal(s.solved, true);
  assert.equal(isSolved(s.board), true);
  assert.equal(tap(s, 1, 1), s, 'a solved puzzle ignores taps');
});

test('undo restores the exact previous board', () => {
  let s = newPuzzleState(puzzle(), 'medium');
  const before = [];
  for (const [r, c] of [[1, 1], [0, 2], [2, 0]]) {
    before.push(s.board);
    s = tap(s, r, c);
  }
  for (let i = 2; i >= 0; i--) {
    s = undo(s);
    assert.deepEqual(s.board, before[i], `after undoing tap ${i + 1}`);
  }
  assert.deepEqual(s.history, []);
  assert.equal(undo(s), s, 'nothing left to undo');
});

test('on Easy undo and restart are free; on Medium and Hard they cost a move', () => {
  const play = (levelId) => {
    let s = newPuzzleState(puzzle(), levelId);
    s = tap(s, 1, 1);
    s = tap(s, 0, 1);
    return s;
  };
  const easy = play('easy');
  assert.equal(undo(easy).moves, 1, 'the tapped move is taken back');
  assert.equal(restart(easy).moves, 0);
  for (const level of ['medium', 'hard']) {
    const s = play(level);
    assert.equal(undo(s).moves, 3, `${level}: tap + tap + undo`);
    assert.equal(restart(s).moves, 3, `${level}: restart adds a move`);
  }
  assert.deepEqual(restart(easy).board, puzzle().board, 'restart returns the starting board');
  assert.deepEqual(restart(easy).history, []);
});

// ---- scoring ---------------------------------------------------------------

test('puzzle stars: at most par = 3, at most par + 3 = 2, otherwise 1', () => {
  assert.deepEqual([3, 4, 5, 6, 7, 8, 20].map((m) => starsForPuzzle(m, 4)), [3, 3, 2, 2, 2, 1, 1]);
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map((m) => starsForPuzzle(m, 3)), [3, 3, 2, 2, 2, 1, 1]);
});

test('round stars are the rounded average and never below 1', () => {
  assert.equal(roundStars([3, 3, 3, 3, 3]), 3);
  assert.equal(roundStars([3, 3, 2, 2, 2]), 2, 'average 2.4');
  assert.equal(roundStars([3, 3, 3, 2, 2]), 3, 'average 2.6');
  assert.equal(roundStars([1, 1, 1, 2, 2]), 1, 'average 1.4');
  assert.equal(roundStars([]), 1);
});

// ---- hints -----------------------------------------------------------------

test('hint: null once solved, otherwise a jar that is part of a solution, and following hints solves the puzzle', () => {
  for (const levelId of LEVEL_IDS) {
    const rng = createRng(7);
    for (let n = 0; n < 40; n++) {
      let s = newPuzzleState(generateForLevel(levelId, rng), levelId);
      // Make a few mistakes first: hints must still lead to a solution.
      for (const [r, c] of [[0, 0], [1, 1], [0, 1]].slice(0, n % 4)) s = tap(s, r, c);
      let guard = 0;
      while (!s.solved && guard++ < 60) {
        const hint = hintTap(s);
        assert.ok(hint, `${levelId}: a hint exists while unsolved`);
        s = tap(s, hint[0], hint[1]);
      }
      assert.equal(s.solved, true, `${levelId}: following hints solves it`);
      assert.equal(hintTap(s), null);
    }
  }
});

test('Easy hints use the recorded taps still needed; a correct tap moves the hint on', () => {
  let s = newPuzzleState({ board: boardFromTaps(3, [[0, 0], [2, 2]]), par: 2, solutionTaps: [[0, 0], [2, 2]] }, 'easy');
  assert.deepEqual(hintTap(s), [0, 0]);
  s = tap(s, 0, 0);
  assert.deepEqual(hintTap(s), [2, 2]);
  s = tap(s, 1, 1); // a mistake adds a tap that is now needed to undo it
  assert.ok(hintTap(s));
});
