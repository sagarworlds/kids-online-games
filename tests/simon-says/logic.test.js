import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SimonGame } from '../../src/games/simon-says/logic/simonGame.js';
import { playbackTimings, MIN_NOTE_MS } from '../../src/games/simon-says/logic/timings.js';
import { starsFor } from '../../src/games/simon-says/logic/scoring.js';
import { playSequence } from '../../src/games/simon-says/logic/sequencePlayer.js';
import { Recorder, MAX_NOTES } from '../../src/games/simon-says/logic/recorder.js';
import { PADS, padsFor } from '../../src/games/simon-says/logic/pads.js';
import { LEVELS, LEVEL_IDS, MODES, getLevel, saveKey } from '../../src/games/simon-says/logic/levels.js';
import { GameError } from '../../src/engine/utils/errors.js';
import { createRng } from '../../src/engine/utils/random.js';

const newGame = (over = {}) => new SimonGame({ pads: 4, startLength: 3, rng: createRng(5), ...over });
/** Starts a game, finishes the "listening" part, and returns it ready for input. */
const ready = (over) => { const g = newGame(over); g.start(); g.beginInput(); return g; };
/** Presses every pad of the answer in the right order and returns the last result. */
const answer = (g) => {
  const order = g.reverse ? [...g.sequence].reverse() : [...g.sequence];
  let result;
  for (const id of order) result = g.press(id);
  return result;
};
const wrongPad = (g) => (g.sequence[g.inputIndex] + 1) % 4;

// ---- the state machine -----------------------------------------------------

test('start makes a sequence of the start length from valid pads and waits for the scene to play it', () => {
  const g = newGame({ pads: 6, startLength: 4 });
  g.start();
  assert.equal(g.sequence.length, 4);
  assert.ok(g.sequence.every((id) => Number.isInteger(id) && id >= 0 && id < 6));
  assert.equal(g.phase, 'playing');
  assert.equal(g.best, 0);
});

test('taps are ignored while the sequence is playing, before the game starts, and after it ends (never queued)', () => {
  const g = newGame();
  assert.equal(g.press(0), 'ignored', 'before start');
  g.start();
  assert.equal(g.press(g.sequence[0]), 'ignored', 'while playing');
  assert.equal(g.inputIndex, 0, 'and nothing was recorded');
  g.beginInput();
  assert.equal(g.press(g.sequence[0]), 'ok', 'now it counts');
});

test('correct input moves along, and the full sequence completes the round and scores its length', () => {
  const g = ready({ startLength: 3 });
  const [a, b, c] = g.sequence;
  assert.equal(g.press(a), 'ok');
  assert.equal(g.press(b), 'ok');
  assert.equal(g.press(c), 'roundComplete');
  assert.equal(g.best, 3);
  assert.equal(g.roundsCompleted, 1);
});

test('addStep grows the sequence by one and keeps the old steps in place', () => {
  const g = ready();
  const before = [...g.sequence];
  answer(g);
  const next = g.addStep();
  assert.equal(next.length, before.length + 1);
  assert.deepEqual(next.slice(0, before.length), before);
  assert.equal(g.phase, 'playing');
  g.beginInput();
  assert.equal(answer(g), 'roundComplete');
  assert.equal(g.best, before.length + 1);
});

test('one wrong tap replays the same sequence ("retry"); a second wrong tap ends the game', () => {
  const g = ready();
  const sequence = [...g.sequence];
  assert.equal(g.press(wrongPad(g)), 'retry');
  assert.equal(g.phase, 'retry');
  assert.deepEqual(g.sequence, sequence, 'the same sequence is replayed');
  assert.equal(g.press(g.sequence[0]), 'ignored', 'no input during the replay');
  g.beginInput();
  assert.equal(g.inputIndex, 0, 'start the sequence again from the beginning');
  assert.equal(g.press(wrongPad(g)), 'gameOver');
  assert.equal(g.phase, 'over');
  assert.equal(g.press(g.sequence[0]), 'ignored', 'nothing after game over');
});

test('a wrong tap in the middle of the sequence also restarts the sequence from step one', () => {
  const g = ready({ startLength: 4 });
  g.press(g.sequence[0]);
  g.press(g.sequence[1]);
  assert.equal(g.press(wrongPad(g)), 'retry');
  g.beginInput();
  assert.equal(g.inputIndex, 0);
});

test('a retry that succeeds completes the round, and the next sequence gets a fresh retry', () => {
  const g = ready();
  g.press(wrongPad(g));
  g.beginInput();
  assert.equal(answer(g), 'roundComplete');
  assert.equal(g.lives, 1, 'the used retry is not refunded until the next sequence');
  g.addStep();
  assert.equal(g.lives, 2);
  g.beginInput();
  assert.equal(g.press(wrongPad(g)), 'retry', 'a fresh retry for the longer sequence');
});

test('a timeout counts exactly like a wrong tap, and only while the child may answer', () => {
  const g = newGame();
  g.start();
  assert.equal(g.timeout(), 'ignored', 'not during playback');
  g.beginInput();
  assert.equal(g.timeout(), 'retry');
  g.beginInput();
  assert.equal(g.timeout(), 'gameOver');
});

test('Reverse mode wants the sequence backwards: answering forwards is wrong', () => {
  // Pick a seed whose first and last steps differ, so "forwards" is certainly the wrong answer.
  let g;
  for (let seed = 1; seed < 100; seed++) {
    g = ready({ reverse: true, startLength: 4, rng: createRng(seed) });
    if (g.sequence[0] !== g.sequence.at(-1)) break;
  }
  assert.notEqual(g.sequence[0], g.sequence.at(-1));
  assert.equal(g.press(g.sequence[0]), 'retry', 'the first answer must be the LAST step');
  g.beginInput();
  assert.equal(answer(g), 'roundComplete');
  assert.equal(g.best, 4);
});

test('Reverse mode: the expected order really is the reverse, step by step', () => {
  const g = ready({ reverse: true, startLength: 3 });
  const [a, b, c] = g.sequence;
  assert.equal(g.press(c), 'ok');
  assert.equal(g.press(b), 'ok');
  assert.equal(g.press(a), 'roundComplete');
});

test('the one free replay per sequence costs nothing and is available again next round', () => {
  const g = ready();
  assert.equal(g.replayAvailable, true);
  assert.equal(g.useReplay(), true);
  assert.equal(g.useReplay(), false, 'only one per sequence');
  assert.equal(g.lives, 2, 'no penalty');
  answer(g);
  g.addStep();
  assert.equal(g.replayAvailable, true);
});

test('best is the longest completed sequence, and survives the game ending', () => {
  const g = ready({ startLength: 3 });
  for (let i = 0; i < 3; i++) { answer(g); g.addStep(); g.beginInput(); }
  assert.equal(g.best, 5, '3, 4 and 5 completed');
  g.press(wrongPad(g));
  g.beginInput();
  g.press(wrongPad(g));
  assert.equal(g.phase, 'over');
  assert.equal(g.best, 5);
});

test('the same seed gives the same game, and bad setups are rejected', () => {
  const run = (seed) => { const g = newGame({ rng: createRng(seed) }); g.start(); return [...g.sequence]; };
  assert.deepEqual(run(3), run(3));
  assert.notDeepEqual(run(3), run(4));
  assert.throws(() => newGame({ pads: 1 }), { code: 'BAD_CONFIG' });
  assert.throws(() => newGame({ startLength: 0 }), { code: 'BAD_CONFIG' });
});

// ---- timing ----------------------------------------------------------------

test('playback gets 5% faster every 3 completed sequences and never below a 250 ms note', () => {
  assert.equal(playbackTimings(500, 0).noteMs, 500);
  assert.equal(playbackTimings(500, 2).noteMs, 500);
  assert.equal(playbackTimings(500, 3).noteMs, 475, '5% faster');
  assert.equal(playbackTimings(500, 6).noteMs, 451);
  assert.equal(playbackTimings(500, 0).gapMs, 150, 'Easy: note 500 ms + gap 150 ms');
  for (let rounds = 0; rounds < 200; rounds += 7) assert.ok(playbackTimings(350, rounds).noteMs >= MIN_NOTE_MS);
  assert.equal(playbackTimings(350, 500).noteMs, MIN_NOTE_MS);
  const speeds = Array.from({ length: 40 }, (_, i) => playbackTimings(500, i).noteMs);
  assert.deepEqual(speeds, [...speeds].sort((a, b) => b - a), 'only ever faster');
});

// ---- levels, pads, stars ---------------------------------------------------

test('level table matches the spec', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => [LEVELS[id].startLength, LEVELS[id].pads, LEVELS[id].noteMs]), [[3, 4, 500], [4, 4, 400], [4, 6, 350]]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].timeoutSeconds), [5, 5, 3]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].reverse), [false, false, true], 'Reverse is a Hard mode');
  assert.deepEqual(MODES.map((m) => m.id), ['classic', 'reverse', 'music']);
  assert.throws(() => getLevel('nope'), { code: 'UNKNOWN_LEVEL' });
  assert.equal(saveKey('hard', 'reverse'), 'hard-reverse');
  assert.equal(saveKey('hard', 'classic'), 'hard');
});

test('stars: Easy 8+/5+, Medium 10+/7+, Hard 12+/9+, otherwise 1', () => {
  assert.deepEqual([0, 4, 5, 7, 8, 20].map((n) => starsFor(LEVELS.easy, n)), [1, 1, 2, 2, 3, 3]);
  assert.deepEqual([6, 7, 9, 10].map((n) => starsFor(LEVELS.medium, n)), [1, 2, 2, 3]);
  assert.deepEqual([8, 9, 11, 12].map((n) => starsFor(LEVELS.hard, n)), [1, 2, 2, 3]);
});

test('pads: C major chord for the first four, then A4 and D5; every pad has a unique colour, shape, number and note', () => {
  assert.equal(PADS.length, 6);
  assert.deepEqual(PADS.slice(0, 4).map((p) => p.freqHz), [261.63, 329.63, 392.0, 523.25], 'C4 E4 G4 C5');
  assert.deepEqual(PADS.slice(4).map((p) => p.freqHz), [440.0, 587.33], 'A4 D5');
  for (const field of ['color', 'shape', 'key', 'freqHz', 'name']) assert.equal(new Set(PADS.map((p) => p[field])).size, 6, `unique ${field}`);
  assert.deepEqual(PADS.map((p) => p.id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(PADS.map((p) => p.key), ['1', '2', '3', '4', '5', '6']);
  assert.equal(padsFor(4).length, 4);
  assert.equal(padsFor(6).length, 6);
});

// ---- sequence player -------------------------------------------------------

/** Records what the player did, with a controllable fake `sleep`. */
function rig({ abortAfterSleeps = Infinity } = {}) {
  const log = [];
  let sleeps = 0;
  const controller = new AbortController();
  const sleep = async (ms, signal) => {
    log.push(`sleep ${ms}`);
    sleeps += 1;
    if (sleeps >= abortAfterSleeps) controller.abort();
    if (signal?.aborted) throw new GameError('ABORTED', 'aborted');
  };
  return {
    log, controller,
    options: {
      light: (id, on) => log.push(`light ${id} ${on ? 'on' : 'off'}`),
      tone: (id, ms) => log.push(`tone ${id} ${ms}`),
      sleep, signal: controller.signal, noteMs: 400, gapMs: 150,
    },
  };
}

test('the player lights, sounds, waits, darkens and pauses for each pad, in order', async () => {
  const r = rig();
  const done = await playSequence({ sequence: [2, 0], ...r.options });
  assert.equal(done, true);
  assert.deepEqual(r.log, [
    'light 2 on', 'tone 2 400', 'sleep 400', 'light 2 off', 'sleep 150',
    'light 0 on', 'tone 0 400', 'sleep 400', 'light 0 off', 'sleep 150',
  ]);
});

test('cancelling mid-note stops everything and leaves no pad glowing', async () => {
  const r = rig({ abortAfterSleeps: 1 }); // abort during the first note
  const done = await playSequence({ sequence: [1, 2, 3], ...r.options });
  assert.equal(done, false);
  assert.deepEqual(r.log.filter((l) => l.startsWith('tone')), ['tone 1 400'], 'no sound after the cancel');
  assert.equal(r.log.at(-1), 'light 1 off', 'the glowing pad was switched off');
});

test('cancelling before it starts plays nothing, and other errors are not swallowed', async () => {
  const r = rig();
  r.controller.abort();
  assert.equal(await playSequence({ sequence: [1], ...r.options }), false);
  assert.deepEqual(r.log, []);
  const boom = { ...rig().options, sleep: async () => { throw new Error('boom'); } };
  await assert.rejects(playSequence({ sequence: [1], ...boom }), /boom/);
});

// ---- Music Maker recorder --------------------------------------------------

test('the recorder keeps up to 16 notes in order and refuses more', () => {
  const rec = new Recorder();
  for (let i = 0; i < MAX_NOTES; i++) assert.equal(rec.add(i % 4), true);
  assert.equal(rec.full, true);
  assert.equal(rec.add(1), false);
  assert.equal(rec.notes.length, 16);
  assert.deepEqual(rec.notes.slice(0, 5), [0, 1, 2, 3, 0]);
  rec.clear();
  assert.deepEqual(rec.notes, []);
  assert.equal(MAX_NOTES, 16);
});
