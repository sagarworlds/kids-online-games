import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LEVELS, LEVEL_IDS, getLevel, levelOfWord, WORDS_PER_ROUND } from '../../src/games/word-builder-bubbles/logic/levels.js';
import { validateWords, wordsFor, pickWords } from '../../src/games/word-builder-bubbles/logic/words.js';
import { chooseDecoys } from '../../src/games/word-builder-bubbles/logic/decoys.js';
import { createBubbles, overlaps, radiusFor, respawn, MIN_RADIUS, MAX_RADIUS } from '../../src/games/word-builder-bubbles/logic/bubbleFactory.js';
import { step, bounce, circleCircle, fitToBounds, bubbleAt, displayPosition, BOB_AMPLITUDE } from '../../src/games/word-builder-bubbles/logic/physics.js';
import { startWord, tryLetter, nextLetter, isComplete, remainingLetters } from '../../src/games/word-builder-bubbles/logic/spellingState.js';
import { nearestWithLetter } from '../../src/games/word-builder-bubbles/logic/keyboard.js';
import { roundStars, trickyWords, roundScore, TRICKY_FROM } from '../../src/games/word-builder-bubbles/logic/scoring.js';
import { createRng } from '../../src/engine/utils/random.js';

const raw = JSON.parse(readFileSync(new URL('../../src/games/word-builder-bubbles/data/words.json', import.meta.url), 'utf8'));
const data = validateWords(raw);

const SIZES = [{ width: 1000, height: 480 }, { width: 700, height: 320 }, { width: 390, height: 260 }, { width: 320, height: 240 }];
const inside = (b, { width, height }) => b.x - b.r >= -1e-9 && b.x + b.r <= width + 1e-9 && b.y - b.r >= -1e-9 && b.y + b.r <= height + 1e-9;

// ---- word data -----------------------------------------------------------------------

test('there are five packs of at least 25 words, each with a full round at every level', () => {
  assert.deepEqual(data.packs.map((p) => p.id), ['animals', 'food', 'home', 'school', 'nature']);
  for (const pack of data.packs) {
    assert.ok(pack.words.length >= 25, `${pack.id} has ${pack.words.length} words`);
    for (const level of LEVEL_IDS) {
      assert.ok(wordsFor(data, pack.id, level).length >= WORDS_PER_ROUND, `${pack.id} ${level}`);
    }
  }
});

test('every word is lowercase letters, the right length for a level, with a clue and a picture, and appears once', () => {
  const seen = new Set();
  for (const pack of data.packs) {
    for (const w of pack.words) {
      assert.match(w.word, /^[a-z]{3,9}$/);
      assert.ok(levelOfWord(w.word), w.word);
      assert.ok(w.clue.length > 5 && w.clue.length <= 70, `${w.word} clue length`);
      assert.ok(w.emoji.length > 0);
      assert.ok(!seen.has(w.word), `${w.word} listed twice`);
      seen.add(w.word);
      assert.ok(!new RegExp(`\\b${w.word}\\b`, 'i').test(w.clue), `the clue for "${w.word}" must not contain the word itself`);
    }
  }
});

test('levels are chosen by word length', () => {
  assert.equal(levelOfWord('cat'), 'easy');
  assert.equal(levelOfWord('bear'), 'easy');
  assert.equal(levelOfWord('plant'), 'medium');
  assert.equal(levelOfWord('rabbit'), 'medium');
  assert.equal(levelOfWord('penguin'), 'hard');
  assert.equal(levelOfWord('butterfly'), 'hard');
  assert.equal(levelOfWord('to'), null);
  assert.equal(levelOfWord('chimpanzee'), null);
  assert.throws(() => getLevel('x'), { code: 'UNKNOWN_LEVEL' });
});

test('levels match the spec table', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].decoys), [2, 3, 4]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].speed), [40, 70, 100]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].collide), [false, false, true]);
  assert.equal(LEVELS.easy.prefillFirst, true);
  assert.equal(LEVELS.hard.picture, false);
});

test('word data validation names the problem', () => {
  const bad = (change) => () => { const copy = structuredClone(raw); change(copy); validateWords(copy); };
  const on = (field) => (e) => e.code === 'INVALID_DATA' && e.context.field === field;
  assert.throws(bad((d) => { d.packs = []; }), on('packs'));
  assert.throws(bad((d) => { d.packs[0].words[0].word = 'Cat'; }), on('packs[0].words[0].word'));
  assert.throws(bad((d) => { d.packs[0].words[0].word = 'to'; }), on('packs[0].words[0].word'));
  assert.throws(bad((d) => { d.packs[0].words[1].word = d.packs[1].words[0].word; }), /appears twice/);
  assert.throws(bad((d) => { d.packs[0].words[0].clue = ' '; }), on('packs[0].words[0].clue'));
  assert.throws(bad((d) => { d.packs[0].words[0].emoji = ''; }), on('packs[0].words[0].emoji'));
  assert.throws(bad((d) => { d.packs[1].words = d.packs[1].words.slice(0, 20); }), on('packs[1].words'));
  assert.throws(bad((d) => { d.packs[2].id = 'food'; }), /appears twice/);
  assert.throws(bad((d) => {
    // swap a pack's easy words for hard ones so one level is short
    d.packs[0].words = d.packs[0].words.filter((w) => w.word.length > 4).concat(Array.from({ length: 3 }, (_, i) => ({ word: `tab${'abc'[i]}`, clue: 'A table thing.', emoji: '🪑' })));
  }), /needs at least 10 easy words/);
});

test('a round has ten different words of the right level', () => {
  const rng = createRng(3);
  for (const level of LEVEL_IDS) {
    const words = pickWords(wordsFor(data, 'animals', level), rng);
    assert.equal(words.length, WORDS_PER_ROUND);
    assert.equal(new Set(words.map((w) => w.word)).size, WORDS_PER_ROUND);
    assert.ok(words.every((w) => levelOfWord(w.word) === level));
  }
  assert.deepEqual(pickWords(wordsFor(data, 'food', 'easy'), createRng(8)), pickWords(wordsFor(data, 'food', 'easy'), createRng(8)));
  assert.equal(pickWords([{ word: 'cat' }], rng).length, 1, 'a short list gives a short round');
  assert.throws(() => wordsFor(data, 'space', 'easy'), { code: 'UNKNOWN_PACK' });
});

// ---- decoys --------------------------------------------------------------------------

test('decoys are distinct letters that are never in the word', () => {
  const rng = createRng(1);
  for (const pack of data.packs) {
    for (const { word } of pack.words) {
      const level = LEVELS[levelOfWord(word)];
      for (const similar of [false, true]) {
        const decoys = chooseDecoys(word, level.decoys, rng, { similar });
        assert.equal(decoys.length, level.decoys, word);
        assert.equal(new Set(decoys).size, decoys.length, `distinct: ${word}`);
        assert.ok(decoys.every((d) => /^[a-z]$/.test(d) && !word.includes(d)), `${word}: ${decoys}`);
      }
    }
  }
});

test('on Hard the decoys look like letters of the word (b for d, m for n)', () => {
  const rng = createRng(2);
  // "dolphin": b/q/p look like d, "n" is in the word so m/h/u are lookalikes for n, etc.
  let lookAlike = 0;
  let total = 0;
  for (let i = 0; i < 200; i++) {
    for (const d of chooseDecoys('mountain', 4, rng, { similar: true })) {
      total += 1;
      if ('nwhuvoi'.includes(d) || 'ljtbd'.includes(d)) lookAlike += 1;
    }
  }
  assert.ok(lookAlike / total > 0.6, `${lookAlike}/${total} decoys look like a letter of the word`);
});

// ---- bubble creation -----------------------------------------------------------------

test('all letters plus the decoys spawn, with no overlap and fully inside the sea, for every word and screen size', () => {
  for (const pack of data.packs) {
    for (const { word } of pack.words) {
      const level = LEVELS[levelOfWord(word)];
      for (const size of SIZES) {
        const rng = createRng(word.length * 31 + size.width);
        const state = startWord(word, { prefillFirst: level.prefillFirst });
        const decoys = chooseDecoys(word, level.decoys, rng, { similar: level.similarDecoys });
        const bubbles = createBubbles({ letters: remainingLetters(state), decoys }, size, rng, level.speed);
        const label = `${word} in ${size.width}x${size.height}`;
        assert.equal(bubbles.length, remainingLetters(state).length + level.decoys, label);
        assert.deepEqual(bubbles.filter((b) => !b.isDecoy).map((b) => b.letter).sort(), remainingLetters(state).sort(), `${label}: one bubble per letter, repeats included`);
        assert.deepEqual(bubbles.filter((b) => b.isDecoy).map((b) => b.letter).sort(), [...decoys].sort());
        for (let i = 0; i < bubbles.length; i++) {
          assert.ok(inside(bubbles[i], size), `${label}: bubble ${i} inside`);
          for (let j = i + 1; j < bubbles.length; j++) assert.ok(!overlaps(bubbles[i], bubbles[j]), `${label}: ${i} and ${j} overlap`);
        }
        assert.equal(new Set(bubbles.map((b) => b.id)).size, bubbles.length, 'unique ids');
        for (const b of bubbles) assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - level.speed) < 1e-9, 'speed is the level speed');
      }
    }
  }
});

test('words with repeated letters get a bubble for each (apple has two p bubbles)', () => {
  const bubbles = createBubbles({ letters: ['a', 'p', 'p', 'l', 'e'], decoys: ['x', 'z', 'q'] }, SIZES[0], createRng(5), 70);
  assert.equal(bubbles.filter((b) => b.letter === 'p').length, 2);
});

test('the grid fallback is used when random placement cannot fit, and it still never overlaps', () => {
  // A tight area: random placement will often fail, the grid must still give a clean layout.
  const tight = { width: 330, height: 200 };
  for (let seed = 1; seed <= 60; seed++) {
    const bubbles = createBubbles({ letters: 'crocodile'.split(''), decoys: ['x', 'z', 'q', 'w'] }, tight, createRng(seed), 100);
    for (let i = 0; i < bubbles.length; i++) {
      assert.ok(inside(bubbles[i], tight));
      for (let j = i + 1; j < bubbles.length; j++) assert.ok(!overlaps(bubbles[i], bubbles[j]), `seed ${seed}`);
    }
  }
});

test('an area too small for the bubbles is an error, not an overlapping mess', () => {
  assert.throws(() => createBubbles({ letters: 'elephant'.split(''), decoys: ['x', 'z', 'q', 'w'] }, { width: 80, height: 80 }, createRng(1), 40), { code: 'NO_ROOM' });
});

test('bubble size shrinks on small screens but stays tappable', () => {
  assert.equal(radiusFor(13, { width: 1400, height: 900 }), MAX_RADIUS);
  assert.ok(radiusFor(13, { width: 390, height: 260 }) < radiusFor(13, { width: 1000, height: 480 }));
  assert.equal(radiusFor(13, { width: 100, height: 100 }), MIN_RADIUS);
  assert.ok(MIN_RADIUS >= 22, 'a 44px bubble: close to the 48px tap target');
});

test('a replacement bubble keeps its letter, enters from the bottom and heads upwards', () => {
  const old = { id: 3, letter: 'k', x: 10, y: 10, vx: 1, vy: 1, r: 30, isDecoy: true };
  const others = [{ id: 1, letter: 'a', x: 100, y: 440, vx: 0, vy: 0, r: 30, isDecoy: false }];
  const fresh = respawn(old, others, SIZES[0], createRng(2), 70, 99);
  assert.equal(fresh.letter, 'k');
  assert.equal(fresh.isDecoy, true);
  assert.equal(fresh.id, 99);
  assert.equal(fresh.y, SIZES[0].height - 30);
  assert.ok(fresh.vy < 0);
  assert.ok(fresh.x >= 30 && fresh.x <= SIZES[0].width - 30);
  assert.ok(!overlaps(fresh, others[0]), 'it avoids the bubble that is in the way when there is room');
});

// ---- physics -------------------------------------------------------------------------

const bubble = (over) => ({ id: 1, letter: 'a', x: 100, y: 100, vx: 50, vy: 0, r: 20, isDecoy: false, ...over });
const AREA = { width: 400, height: 300 };

test('bubbles move at constant velocity', () => {
  const [b] = step([bubble({ vx: 40, vy: -20 })], 0.5, AREA);
  assert.equal(b.x, 120);
  assert.equal(b.y, 90);
});

test('bubbles bounce off all four walls and stay inside', () => {
  const right = step([bubble({ x: 375, vx: 100 })], 0.1, AREA)[0];
  assert.equal(right.x, AREA.width - 20);
  assert.ok(right.vx < 0);
  const left = step([bubble({ x: 25, vx: -100 })], 0.1, AREA)[0];
  assert.equal(left.x, 20);
  assert.ok(left.vx > 0);
  const top = step([bubble({ y: 25, vx: 0, vy: -100 })], 0.1, AREA)[0];
  assert.equal(top.y, 20);
  assert.ok(top.vy > 0);
  const bottom = step([bubble({ y: 275, vx: 0, vy: 100 })], 0.1, AREA)[0];
  assert.equal(bottom.y, AREA.height - 20);
  assert.ok(bottom.vy < 0);
});

test('without collisions bubbles pass through each other (Easy and Medium)', () => {
  const a = bubble({ id: 1, x: 100, vx: 50 });
  const b = bubble({ id: 2, x: 130, vx: -50 });
  const [a2, b2] = step([a, b], 0.1, AREA, { collide: false });
  assert.equal(a2.vx, 50);
  assert.equal(b2.vx, -50);
});

test('physics never changes the bubbles it is given', () => {
  const input = Object.freeze([Object.freeze(bubble({ vx: 300 }))]);
  assert.doesNotThrow(() => step(input, 0.5, AREA, { collide: true }));
  assert.equal(input[0].x, 100);
});

test('a head-on collision swaps the velocities and separates the bubbles', () => {
  const a = bubble({ id: 1, x: 100, y: 100, vx: 60, vy: 0 });
  const b = bubble({ id: 2, x: 130, y: 100, vx: -60, vy: 0 });
  assert.ok(circleCircle(a, b));
  const [a2, b2] = bounce(a, b);
  assert.equal(a2.vx, -60);
  assert.equal(b2.vx, 60);
  assert.ok(!circleCircle(a2, b2) || Math.hypot(a2.x - b2.x, a2.y - b2.y) >= 39.999);
});

test('collisions conserve momentum and energy, and do nothing to bubbles already moving apart', () => {
  const rng = createRng(4);
  for (let i = 0; i < 200; i++) {
    const a = bubble({ id: 1, x: 100, y: 100, vx: (rng() - 0.5) * 200, vy: (rng() - 0.5) * 200 });
    const b = bubble({ id: 2, x: 100 + rng() * 38, y: 100 + (rng() - 0.5) * 20, vx: (rng() - 0.5) * 200, vy: (rng() - 0.5) * 200 });
    const [a2, b2] = bounce(a, b);
    const px = a.vx + b.vx;
    const py = a.vy + b.vy;
    assert.ok(Math.abs(a2.vx + b2.vx - px) < 1e-9 && Math.abs(a2.vy + b2.vy - py) < 1e-9, 'momentum');
    const e = (u, v) => u.vx ** 2 + u.vy ** 2 + v.vx ** 2 + v.vy ** 2;
    assert.ok(Math.abs(e(a2, b2) - e(a, b)) < 1e-6, 'energy');
  }
  const apart = bounce(bubble({ id: 1, x: 100, vx: -50 }), bubble({ id: 2, x: 130, vx: 50 }));
  assert.equal(apart[0].vx, -50, 'already separating: velocities unchanged');
  assert.equal(apart[1].vx, 50);
});

test('bubbles exactly on top of each other do not break the physics', () => {
  const [a, b] = bounce(bubble({ id: 1 }), bubble({ id: 2 }));
  for (const v of [a.x, a.y, b.x, b.y, a.vx, b.vx]) assert.ok(Number.isFinite(v));
});

test('a long Hard simulation keeps every bubble inside the sea and at a sensible speed', () => {
  const rng = createRng(6);
  const size = { width: 700, height: 320 };
  const letters = 'crocodile'.split('');
  let bubbles = createBubbles({ letters, decoys: ['x', 'z', 'q', 'w'] }, size, rng, 100);
  for (let i = 0; i < 3000; i++) {
    bubbles = step(bubbles, 1 / 60, size, { collide: true });
    for (const b of bubbles) {
      assert.ok(inside(b, size), `step ${i}`);
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.vx));
    }
  }
  const speeds = bubbles.map((b) => Math.hypot(b.vx, b.vy));
  assert.ok(speeds.every((s) => s < 400), `no runaway speeds: ${Math.max(...speeds)}`);
});

test('resizing keeps bubbles inside the new area', () => {
  const rng = createRng(7);
  const big = { width: 1000, height: 480 };
  const bubbles = createBubbles({ letters: 'elephant'.split(''), decoys: ['x', 'z', 'q', 'w'] }, big, rng, 100);
  for (const to of [{ width: 390, height: 520 }, { width: 520, height: 300 }, { width: 1200, height: 700 }]) {
    const moved = fitToBounds(bubbles, big, to);
    for (const b of moved) assert.ok(inside(b, to), `${to.width}x${to.height}`);
    assert.equal(moved.length, bubbles.length);
  }
  assert.equal(fitToBounds(bubbles, { width: 0, height: 0 }, big).length, bubbles.length, 'a zero-size old area does not divide by zero');
});

test('tapping finds the bubble under the finger, the top one when they overlap, and uses the bob', () => {
  const a = bubble({ id: 1, x: 100, y: 100, r: 30 });
  const b = bubble({ id: 2, x: 120, y: 100, r: 30 });
  assert.equal(bubbleAt([a, b], 80, 100, 0).id, 1, 'only the first bubble reaches this far left');
  assert.equal(bubbleAt([a, b], 125, 100, 0).id, 2, 'drawn last = on top');
  assert.equal(bubbleAt([a, b], 300, 300, 0), null);
  const t = 1.234;
  const shown = displayPosition(a, t);
  assert.ok(Math.abs(shown.y - a.y) <= BOB_AMPLITUDE);
  assert.equal(bubbleAt([a], shown.x, shown.y, t).id, 1, 'a tap on where it is drawn pops it');
});

// ---- spelling ------------------------------------------------------------------------

test('only the next correct letter fills a slot; wrong letters never do', () => {
  let s = startWord('cat');
  assert.equal(nextLetter(s), 'c');
  let r = tryLetter(s, 'a'); // in the word, but not next
  assert.equal(r.result, 'wrong');
  assert.equal(r.state.filled, 0, 'a letter from later in the word does not fill the slot');
  assert.equal(r.state.mistakes, 1);
  r = tryLetter(r.state, 'z');
  assert.deepEqual([r.result, r.state.filled, r.state.mistakes], ['wrong', 0, 2]);
  r = tryLetter(r.state, 'c');
  assert.deepEqual([r.result, r.state.filled], ['correct', 1]);
  r = tryLetter(r.state, 'a');
  assert.equal(r.result, 'correct');
  r = tryLetter(r.state, 't');
  assert.equal(r.result, 'complete');
  assert.equal(isComplete(r.state), true);
  assert.equal(nextLetter(r.state), null);
  assert.equal(r.state.mistakes, 2);
  assert.throws(() => tryLetter(r.state, 'c'), { code: 'WORD_COMPLETE' });
});

test('repeated letters: popping any matching bubble counts, in order', () => {
  let s = startWord('apple');
  const seq = [];
  for (const letter of 'apple') {
    const r = tryLetter(s, letter);
    seq.push(r.result);
    s = r.state;
  }
  assert.deepEqual(seq, ['correct', 'correct', 'correct', 'correct', 'complete']);
  assert.equal(s.mistakes, 0);
});

test('Easy starts with the first letter in place', () => {
  const s = startWord('sun', { prefillFirst: true });
  assert.equal(s.filled, 1);
  assert.equal(nextLetter(s), 'u');
  assert.deepEqual(remainingLetters(s), ['u', 'n']);
  assert.deepEqual(remainingLetters(startWord('sun')), ['s', 'u', 'n']);
});

test('spelling state is never changed in place', () => {
  const s = startWord('cat');
  tryLetter(s, 'x');
  assert.equal(s.mistakes, 0);
  assert.throws(() => startWord(''), { code: 'EMPTY_WORD' });
});

// ---- keyboard ------------------------------------------------------------------------

test('typing a letter picks the nearest bubble with that letter, in any case', () => {
  const bubbles = [
    bubble({ id: 1, letter: 'p', x: 50, y: 50 }),
    bubble({ id: 2, letter: 'p', x: 300, y: 50 }),
    bubble({ id: 3, letter: 'a', x: 290, y: 60 }),
  ];
  assert.equal(nearestWithLetter(bubbles, 'p', { x: 280, y: 40 }).id, 2);
  assert.equal(nearestWithLetter(bubbles, 'P', { x: 0, y: 0 }).id, 1);
  assert.equal(nearestWithLetter(bubbles, 'z', { x: 0, y: 0 }), null);
  for (const key of ['Enter', '1', ' ', 'Shift', 'ab', null, undefined]) assert.equal(nearestWithLetter(bubbles, key, { x: 0, y: 0 }), null, String(key));
});

// ---- scoring -------------------------------------------------------------------------

test('stars from the average mistakes per word', () => {
  const r = (...m) => m.map((mistakes) => ({ mistakes }));
  assert.equal(roundStars(r(0, 0, 0, 0)), 3);
  assert.equal(roundStars(r(1, 1, 1, 1)), 3, 'an average of exactly 1 is still 3');
  assert.equal(roundStars(r(1, 1, 1, 2)), 2, 'average 1.25');
  assert.equal(roundStars(r(2, 2, 2, 2)), 2, 'an average of exactly 2 is 2');
  assert.equal(roundStars(r(2, 2, 2, 3)), 1);
  assert.equal(roundStars([]), 1);
});

test('tricky words are those with two or more mistakes', () => {
  const results = [{ word: 'cat', mistakes: 0 }, { word: 'dog', mistakes: 1 }, { word: 'owl', mistakes: TRICKY_FROM }, { word: 'bee', mistakes: 5 }];
  assert.deepEqual(trickyWords(results), ['owl', 'bee']);
  assert.deepEqual(trickyWords([]), []);
  assert.equal(roundScore([{ mistakes: 0 }, { mistakes: 1 }, { mistakes: 9 }]), 10 + 7 + 0);
});
