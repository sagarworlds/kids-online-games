import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LEVELS, LEVEL_IDS, getLevel, SENTENCES_PER_ROUND, MAX_RETRIES } from '../../src/games/sentence-train/logic/levels.js';
import { validateSentences, sentencesFor, pickSentences, acceptedOrders, sentenceText } from '../../src/games/sentence-train/logic/sentences.js';
import { scramble } from '../../src/games/sentence-train/logic/scrambler.js';
import { check } from '../../src/games/sentence-train/logic/checker.js';
import { newBoard, place, remove, placeInFirstEmpty, nudge, hintNext, solved, sidingCarriages, slotWords, isFull } from '../../src/games/sentence-train/logic/board.js';
import { roundStars, mistakeTotals, roundScore } from '../../src/games/sentence-train/logic/scoring.js';
import { createRng } from '../../src/engine/utils/random.js';

const raw = JSON.parse(readFileSync(new URL('../../src/games/sentence-train/data/sentences.json', import.meta.url), 'utf8'));
const data = validateSentences(raw);
const entry = (words, extra = {}) => ({ id: 'x', level: 'easy', words, ...extra });

// ---- data ------------------------------------------------------------------------------

test('there are at least 30 sentences per level, each the right length for its level', () => {
  for (const id of LEVEL_IDS) {
    const list = sentencesFor(data, id);
    assert.ok(list.length >= 30, `${id}: ${list.length}`);
    for (const s of list) {
      assert.ok(s.words.length >= LEVELS[id].minWords && s.words.length <= LEVELS[id].maxWords, `${s.id}`);
    }
  }
});

test('every sentence starts with a capital letter and ends with a full stop, question mark or exclamation mark', () => {
  for (const s of data.sentences) {
    assert.match(s.words[0], /^[A-Z]/, s.id);
    assert.match(s.words.at(-1), /[.?!]$/, s.id);
    assert.ok(s.words.slice(0, -1).every((w) => !/[.?!]$/.test(w)), `${s.id}: only the last word ends the sentence`);
  }
});

test('Medium has questions, and every Hard sentence has an extra word that is not in it', () => {
  assert.ok(sentencesFor(data, 'medium').filter((s) => s.words.at(-1).endsWith('?')).length >= 8, 'plenty of questions');
  for (const s of sentencesFor(data, 'hard')) {
    assert.match(s.distractor, /^[a-z]+$/);
    assert.ok(!s.words.some((w) => w.toLowerCase().replace(/[^a-z]/g, '') === s.distractor), `${s.id}: "${s.distractor}" is not part of the sentence`);
  }
  assert.ok(sentencesFor(data, 'hard').some((s) => /\b(because|and|but)\b/.test(s.words.join(' '))), 'Hard has because / and / but clauses');
  for (const s of [...sentencesFor(data, 'easy'), ...sentencesFor(data, 'medium')]) assert.equal(s.distractor, undefined);
});

test('every alternative is the same carriages in another order', () => {
  const withAlternatives = data.sentences.filter((s) => s.alternatives);
  assert.ok(withAlternatives.length >= 5);
  for (const s of withAlternatives) {
    for (const alt of s.alternatives) {
      assert.deepEqual([...alt].sort(), [...s.words].sort(), s.id);
      assert.notDeepEqual(alt, s.words);
    }
  }
});

test('sentence data validation names the problem', () => {
  const bad = (change) => () => { const copy = structuredClone(raw); change(copy); validateSentences(copy); };
  const on = (field) => (e) => e.code === 'INVALID_DATA' && e.context.field === field;
  assert.throws(bad((d) => { d.sentences = []; }), on('sentences'));
  assert.throws(bad((d) => { d.sentences[0].words[0] = 'the'; }), on('sentences[0].words'));
  assert.throws(bad((d) => { d.sentences[0].words[d.sentences[0].words.length - 1] = 'sleeping'; }), on('sentences[0].words'));
  assert.throws(bad((d) => { d.sentences[0].words[1] = 'cat.'; }), on('sentences[0].words'));
  assert.throws(bad((d) => { d.sentences[0].words = ['Hi.', 'there.']; }), on('sentences[0].words'));
  assert.throws(bad((d) => { d.sentences[0].level = 'hard'; }), on('sentences[0].words'));
  assert.throws(bad((d) => { d.sentences[0].level = 'nope'; }), on('sentences[0].level'));
  assert.throws(bad((d) => { d.sentences[1].id = d.sentences[0].id; }), /appears twice/);
  assert.throws(bad((d) => { d.sentences[14].alternatives = [['Mia', 'and', 'Ben', 'ride', 'cars.']]; }), /same words/);
  assert.throws(bad((d) => { const h = d.sentences.find((s) => s.level === 'hard'); delete h.distractor; }), /distractor/);
  assert.throws(bad((d) => { const h = d.sentences.find((s) => s.level === 'hard'); h.distractor = h.words[0].toLowerCase(); }), /must not be a word of the sentence/);
  assert.throws(bad((d) => { d.sentences[0].distractor = 'extra'; }), /only hard sentences/);
  assert.throws(bad((d) => { d.sentences = d.sentences.filter((s) => s.level !== 'medium'); }), /at least 30 medium/);
});

test('a round has eight different sentences of the level', () => {
  const rng = createRng(2);
  for (const id of LEVEL_IDS) {
    const picked = pickSentences(sentencesFor(data, id), rng);
    assert.equal(picked.length, SENTENCES_PER_ROUND);
    assert.equal(new Set(picked.map((s) => s.id)).size, SENTENCES_PER_ROUND);
  }
  assert.throws(() => sentencesFor(data, 'x'), { code: 'UNKNOWN_LEVEL' });
  assert.throws(() => getLevel('x'), { code: 'UNKNOWN_LEVEL' });
  assert.equal(sentenceText(entry(['The', 'cat', 'sleeps.'])), 'The cat sleeps.');
});

test('levels match the spec', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].distractor), [false, false, true]);
  assert.equal(SENTENCES_PER_ROUND, 8);
  assert.equal(MAX_RETRIES, 2);
});

// ---- checker ---------------------------------------------------------------------------

test('the checker accepts the main order and every listed alternative, for every sentence', () => {
  for (const s of data.sentences) {
    for (const order of acceptedOrders(s)) assert.deepEqual(check(order, s), { ok: true }, `${s.id}: ${order.join(' ')}`);
  }
  const names = data.sentences.find((s) => s.words.join(' ') === 'Mia and Ben ride bikes.');
  assert.equal(check(['Ben', 'and', 'Mia', 'ride', 'bikes.'], names).ok, true);
});

test('any other order is wrong, and a single swap of two different words is caught', () => {
  for (const s of data.sentences) {
    const accepted = acceptedOrders(s).map((o) => o.join('|'));
    for (let i = 0; i < s.words.length - 1; i++) {
      const swapped = [...s.words];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      const result = check(swapped, s);
      assert.equal(result.ok, accepted.includes(swapped.join('|')), `${s.id}: swap ${i}`);
    }
  }
});

test('firstWrongIndex is the first slot that differs from the closest accepted order', () => {
  const s = entry(['The', 'cat', 'is', 'sleeping.']);
  assert.equal(check(['The', 'is', 'cat', 'sleeping.'], s).firstWrongIndex, 1);
  assert.equal(check(['The', 'cat', 'sleeping.', 'is'], s).firstWrongIndex, 2);
  // with an alternative, the track is compared with the order it is closest to
  const names = entry(['Mia', 'and', 'Ben', 'ride', 'bikes.'], { alternatives: [['Ben', 'and', 'Mia', 'ride', 'bikes.']] });
  const result = check(['Ben', 'and', 'Mia', 'bikes.', 'ride'], names);
  assert.equal(result.firstWrongIndex, 3, 'not slot 0, which matches the alternative');
});

test('an unfinished track is not a wrong answer', () => {
  const s = entry(['The', 'cat', 'sleeps.']);
  assert.deepEqual(check(['The', null, 'sleeps.'], s), { ok: false, reason: 'incomplete' });
  assert.deepEqual(check(['The', 'cat'], s), { ok: false, reason: 'incomplete' });
});

test('mistakes are typed: ignoring the capital or the full stop is punctuation, otherwise order', () => {
  const s = entry(['The', 'cat', 'is', 'sleeping.']);
  assert.equal(check(['The', 'is', 'cat', 'sleeping.'], s).type, 'order', 'capital first and full stop last, but words swapped');
  assert.equal(check(['cat', 'The', 'is', 'sleeping.'], s).type, 'punctuation', 'a lower-case word first ignores the capital-letter clue');
  assert.equal(check(['is', 'The', 'cat', 'sleeping.'], s).type, 'punctuation', 'first carriage is not the capitalised word');
  assert.equal(check(['The', 'cat', 'sleeping.', 'is'], s).type, 'punctuation', 'the last carriage has no full stop');
  assert.equal(check(['sleeping.', 'is', 'cat', 'The'], s).type, 'punctuation');
  const q = entry(['Where', 'is', 'my', 'hat?']);
  assert.equal(check(['Where', 'my', 'is', 'hat?'], q).type, 'order');
  assert.equal(check(['is', 'Where', 'my', 'hat?'], q).type, 'punctuation');
});

test('on Hard the extra carriage on the track makes the sentence wrong, with its own mistake type', () => {
  const s = entry(['I', 'wore', 'a', 'coat.'], { distractor: 'banana', level: 'hard' });
  assert.deepEqual(check(['I', 'wore', 'a', 'coat.'], s), { ok: true }, 'leaving it on the siding is correct');
  const result = check(['I', 'wore', 'banana', 'coat.'], s);
  assert.equal(result.ok, false);
  assert.equal(result.type, 'extra');
  assert.equal(result.firstWrongIndex, 2);
  // a track with the extra word in the right-looking place can never match
  for (const h of sentencesFor(data, 'hard')) {
    const withExtra = [...h.words.slice(0, -1), h.distractor];
    assert.equal(check(withExtra, h).ok, false, h.id);
  }
});

test('identical words may swap places freely (two carriages that look the same)', () => {
  const s = entry(['I', 'see', 'a', 'big', 'big', 'dog.']);
  assert.equal(check(['I', 'see', 'a', 'big', 'big', 'dog.'], s).ok, true);
  const dup = entry(['Go', 'go', 'go', 'now.']);
  assert.equal(check(['Go', 'go', 'go', 'now.'], dup).ok, true);
});

// ---- scrambler -------------------------------------------------------------------------

test('a scramble is never a correct order (any accepted order, ignoring the extra carriage on Hard)', () => {
  for (const s of data.sentences) {
    for (let seed = 1; seed <= 40; seed++) {
      const carriages = scramble(s, createRng(seed * 7 + s.id.length));
      const words = carriages.map((c) => c.word);
      const real = s.distractor ? words.filter((w) => w !== s.distractor) : words;
      for (const order of acceptedOrders(s)) assert.notDeepEqual(real, order, `${s.id} seed ${seed}`);
    }
  }
});

test('a scramble has exactly the sentence words (plus the extra one on Hard), with unique ids', () => {
  for (const s of data.sentences) {
    const carriages = scramble(s, createRng(5));
    const expected = s.distractor ? [...s.words, s.distractor] : [...s.words];
    assert.deepEqual(carriages.map((c) => c.word).sort(), expected.sort(), s.id);
    assert.equal(new Set(carriages.map((c) => c.id)).size, carriages.length);
  }
});

test('scrambling is reproducible, and still works when the shuffle keeps returning the answer', () => {
  const s = sentencesFor(data, 'easy')[0];
  assert.deepEqual(scramble(s, createRng(3)), scramble(s, createRng(3)));
  // An rng that never swaps leaves the order unchanged, which is the answer: the fallback must still produce a scramble.
  const stuck = scramble(entry(['The', 'cat', 'sleeps.']), () => 0.999999);
  assert.notDeepEqual(stuck.map((c) => c.word), ['The', 'cat', 'sleeps.']);
});

test('a sentence that cannot be scrambled is an error', () => {
  assert.throws(() => scramble(entry(['Go', 'Go', 'Go']), createRng(1)), { code: 'CANNOT_SCRAMBLE' });
});

// ---- the board -------------------------------------------------------------------------

const carriages = [{ id: 1, word: 'sleeping.' }, { id: 2, word: 'The' }, { id: 3, word: 'is' }, { id: 4, word: 'cat' }];
const cat = entry(['The', 'cat', 'is', 'sleeping.']);

test('a new board has every carriage on the siding and empty slots', () => {
  const b = newBoard(carriages, 4);
  assert.deepEqual(sidingCarriages(b).map((c) => c.id), [1, 2, 3, 4]);
  assert.deepEqual(slotWords(b), [null, null, null, null]);
  assert.equal(isFull(b), false);
});

test('dropping a siding carriage on an empty slot puts it there', () => {
  const b = place(newBoard(carriages, 4), 2, 0);
  assert.deepEqual(slotWords(b), ['The', null, null, null]);
  assert.deepEqual(sidingCarriages(b).map((c) => c.id), [1, 3, 4]);
});

test('dropping a siding carriage on a full slot swaps it in and the old one goes back to the siding', () => {
  let b = place(newBoard(carriages, 4), 2, 0);
  b = place(b, 4, 0);
  assert.deepEqual(slotWords(b), ['cat', null, null, null]);
  assert.deepEqual(sidingCarriages(b).map((c) => c.id), [1, 2, 3], 'The is back, in its original place in the order');
});

test('carriages on the track can be moved and swapped by dropping one on another', () => {
  let b = place(place(newBoard(carriages, 4), 2, 0), 4, 1);
  b = place(b, 4, 3); // move to an empty slot
  assert.deepEqual(slotWords(b), ['The', null, null, 'cat']);
  b = place(b, 4, 0); // drop on the carriage in slot 0: they swap
  assert.deepEqual(slotWords(b), ['cat', null, null, 'The']);
  assert.equal(place(b, 4, 0), b, 'dropping on its own slot changes nothing');
});

test('a carriage can be dragged back to the siding', () => {
  let b = place(newBoard(carriages, 4), 2, 0);
  b = remove(b, 2);
  assert.deepEqual(slotWords(b), [null, null, null, null]);
  assert.equal(remove(b, 2), b, 'removing one that is already on the siding does nothing');
});

test('the keyboard routes: first empty slot, and nudging along the track', () => {
  let b = newBoard(carriages, 4);
  b = placeInFirstEmpty(b, 2);
  b = placeInFirstEmpty(b, 3);
  assert.deepEqual(slotWords(b), ['The', 'is', null, null]);
  assert.equal(placeInFirstEmpty(b, 2), b, 'a carriage already on the track stays');
  b = nudge(b, 3, 1);
  assert.deepEqual(slotWords(b), ['The', null, 'is', null]);
  b = nudge(b, 3, -1);
  b = nudge(b, 2, 1);
  assert.deepEqual(slotWords(b), ['is', 'The', null, null], 'nudging onto a full slot swaps');
  assert.equal(nudge(b, 3, -1), b, 'refused at the start of the track');
  assert.equal(nudge(newBoard(carriages, 4), 1, 1).slots.every((s) => s === null), true, 'a siding carriage cannot be nudged');
  const full = newBoard(carriages, 1);
  assert.equal(placeInFirstEmpty(placeInFirstEmpty(full, 1), 2).slots[0], 1, 'no empty slot: nothing happens');
});

test('the whistle works only when every slot is full; on Hard the extra carriage stays on the siding', () => {
  const hard = [...carriages, { id: 5, word: 'banana' }];
  let b = newBoard(hard, 4);
  for (const id of [2, 4, 3]) b = place(b, id, b.slots.indexOf(null));
  assert.equal(isFull(b), false);
  b = place(b, 1, 3);
  assert.equal(isFull(b), true);
  assert.deepEqual(sidingCarriages(b).map((c) => c.word), ['banana']);
  assert.equal(check(slotWords(b), { ...cat, distractor: 'banana' }).ok, true);
});

test('bad ids and slots are errors', () => {
  const b = newBoard(carriages, 4);
  assert.throws(() => place(b, 99, 0), { code: 'NO_SUCH_CARRIAGE' });
  assert.throws(() => place(b, 1, 4), { code: 'NO_SUCH_SLOT' });
  assert.throws(() => place(b, 1, -1), { code: 'NO_SUCH_SLOT' });
  assert.throws(() => remove(b, 99), { code: 'NO_SUCH_CARRIAGE' });
});

test('the board is never changed in place', () => {
  const b = newBoard(carriages, 4);
  place(b, 2, 0);
  assert.deepEqual(b.slots, [null, null, null, null]);
  assert.ok(Object.isFrozen(b.slots));
});

test('the hint locks the next correct carriage into the first empty or wrong slot', () => {
  let b = newBoard(carriages, 4);
  let h = hintNext(b, cat);
  assert.equal(h.slot, 0);
  assert.deepEqual(slotWords(h.board), ['The', null, null, null]);
  assert.equal(h.board.locked[0], true);
  assert.equal(place(h.board, 4, 0), h.board, 'a locked slot cannot be changed');
  assert.equal(remove(h.board, 2), h.board, 'and its carriage cannot be removed');

  // a wrong carriage in the next slot is replaced, and the displaced one goes back to the siding
  b = place(h.board, 3, 1); // "is" in slot 1 is wrong
  h = hintNext(b, cat);
  assert.equal(h.slot, 1);
  assert.deepEqual(slotWords(h.board), ['The', 'cat', null, null]);
  assert.ok(sidingCarriages(h.board).some((c) => c.word === 'is'));
});

test('the hint takes the right carriage from elsewhere on the track by swapping, and stops when everything is right', () => {
  let b = place(place(newBoard(carriages, 4), 4, 0), 2, 3); // cat . . The
  let h = hintNext(b, cat);
  assert.equal(h.slot, 0);
  assert.deepEqual(slotWords(h.board), ['The', null, null, 'cat'], 'swapped with the carriage that was there');
  h = hintNext(h.board, cat);
  assert.equal(h.slot, 1);
  assert.deepEqual(slotWords(h.board), ['The', 'cat', null, null]);
  b = solved(newBoard(carriages, 4), cat);
  assert.equal(hintNext(b, cat), null);
});

test('the hint follows the accepted order the track already matches (alternatives)', () => {
  const names = entry(['Mia', 'and', 'Ben', 'ride', 'bikes.'], { alternatives: [['Ben', 'and', 'Mia', 'ride', 'bikes.']] });
  const cs = [{ id: 1, word: 'bikes.' }, { id: 2, word: 'Ben' }, { id: 3, word: 'ride' }, { id: 4, word: 'and' }, { id: 5, word: 'Mia' }];
  let b = place(place(newBoard(cs, 5), 2, 0), 5, 2); // Ben . Mia . .
  const h = hintNext(b, names);
  assert.equal(h.slot, 1, 'it keeps Ben first (the alternative) and asks for "and"');
  assert.deepEqual(slotWords(h.board).slice(0, 3), ['Ben', 'and', 'Mia']);
});

test('the hint never uses the extra carriage, and the solved board shows the answer', () => {
  const s = { ...cat, distractor: 'banana', level: 'hard' };
  const cs = [...carriages, { id: 5, word: 'banana' }];
  let b = newBoard(cs, 4);
  for (let i = 0; i < 4; i++) b = hintNext(b, s).board;
  assert.deepEqual(slotWords(b), ['The', 'cat', 'is', 'sleeping.']);
  assert.deepEqual(sidingCarriages(b).map((c) => c.word), ['banana']);
  const shown = solved(newBoard(cs, 4), s);
  assert.deepEqual(slotWords(shown), ['The', 'cat', 'is', 'sleeping.']);
  assert.equal(check(slotWords(shown), s).ok, true);
});

test('solved handles a sentence with repeated words', () => {
  const s = entry(['I', 'see', 'a', 'big', 'big', 'dog.']);
  const cs = scramble(s, createRng(3));
  assert.deepEqual(slotWords(solved(newBoard(cs, 6), s)), s.words);
});

// ---- scoring ---------------------------------------------------------------------------

test('stars from sentences right on the first whistle', () => {
  const r = (n) => Array.from({ length: 8 }, (_, i) => ({ status: i < n ? 'first' : 'retry' }));
  assert.equal(roundStars(r(8)), 3);
  assert.equal(roundStars(r(7)), 3);
  assert.equal(roundStars(r(6)), 2);
  assert.equal(roundStars(r(5)), 2);
  assert.equal(roundStars(r(4)), 1);
  assert.equal(roundStars(r(0)), 1);
});

test('mistakes are added up by type, and the score rewards first-time sentences', () => {
  const results = [
    { status: 'first', mistakes: { order: 0, punctuation: 0, extra: 0 } },
    { status: 'retry', mistakes: { order: 2, punctuation: 1, extra: 0 } },
    { status: 'failed', mistakes: { order: 1, punctuation: 0, extra: 3 } },
  ];
  assert.deepEqual(mistakeTotals(results), { order: 3, punctuation: 1, extra: 3 });
  assert.deepEqual(mistakeTotals([]), { order: 0, punctuation: 0, extra: 0 });
  assert.equal(roundScore(results), 15);
});
