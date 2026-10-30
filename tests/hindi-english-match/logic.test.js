import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDeck } from '../../src/games/hindi-english-match/logic/deck.js';
import { MatchGame } from '../../src/games/hindi-english-match/logic/matchState.js';
import { validatePairs, pairsForTopic, MIN_PAIRS_PER_TOPIC } from '../../src/games/hindi-english-match/logic/pairs.js';
import { starsFor, scoreFor } from '../../src/games/hindi-english-match/logic/scoring.js';
import { LEVELS, LEVEL_IDS, MIXED, getLevel } from '../../src/games/hindi-english-match/logic/levels.js';
import { createRng } from '../../src/engine/utils/random.js';

const here = (rel) => new URL(`../../src/games/hindi-english-match/${rel}`, import.meta.url);
const { topics, pairs } = validatePairs(JSON.parse(readFileSync(here('data/pairs.json'), 'utf8')));

// ---- the shipped vocabulary ------------------------------------------------

test('pairs.json has the six topics, each with at least 12 valid pairs', () => {
  assert.deepEqual(topics, ['Fruits', 'Animals', 'Colours', 'Body', 'Family', 'Numbers']);
  for (const topic of topics) assert.ok(pairsForTopic(pairs, topic, MIXED).length >= MIN_PAIRS_PER_TOPIC, topic);
  assert.equal(pairsForTopic(pairs, MIXED, MIXED).length, pairs.length);
  assert.equal(new Set(pairs.map((p) => p.pairId)).size, pairs.length, 'pairIds are unique');
  assert.ok(pairs.every((p) => /[ऀ-ॿ]/.test(p.hi) && p.en.trim()), 'every pair has Devanagari and an English meaning');
});

test('the look-alike groups from the spec exist (आम / आँख) and every group has two or more members', () => {
  const groups = new Map();
  for (const p of pairs) if (p.similar) groups.set(p.similar, [...(groups.get(p.similar) ?? []), p.hi]);
  assert.deepEqual(groups.get('aam-aankh')?.sort(), ['आँख', 'आम'].sort());
  assert.ok(groups.size >= 3);
  for (const [tag, members] of groups) assert.ok(members.length >= 2, tag);
});

test('the bundled Devanagari fonts are real WOFF2 files (guards against a corrupt download) and are licensed', () => {
  for (const name of ['NotoSansDevanagari-400.woff2', 'NotoSansDevanagari-700.woff2']) {
    const bytes = readFileSync(here(`assets/fonts/${name}`));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', name);
    assert.ok(bytes.length > 20_000, `${name} is a real font, not a stub`);
  }
  assert.match(readFileSync(here('assets/fonts/LICENSE.txt'), 'utf8'), /SIL OPEN FONT LICENSE/i);
});

test('bad data is rejected with the file and the exact field', () => {
  const good = JSON.parse(readFileSync(here('data/pairs.json'), 'utf8'));
  const bad = (mutate, field) => {
    const data = JSON.parse(JSON.stringify(good));
    mutate(data);
    assert.throws(() => validatePairs(data), (e) => e.code === 'INVALID_DATA' && e.context.file === 'pairs.json' && e.context.field === field, field);
  };
  bad((d) => { d.topics = []; }, 'topics');
  bad((d) => { d.pairs = []; }, 'pairs');
  bad((d) => { d.pairs[0].hi = 'apple'; }, 'pairs[0].hi');
  bad((d) => { d.pairs[0].en = ' '; }, 'pairs[0].en');
  bad((d) => { d.pairs[1].pairId = d.pairs[0].pairId; }, 'pairs[1].pairId');
  bad((d) => { d.pairs[0].topic = 'Planets'; }, 'pairs[0].topic');
  bad((d) => { d.pairs = d.pairs.filter((p) => p.topic !== 'Colours' || p.pairId === 'Colours-red'); }, 'topics["Colours"]');
  bad((d) => { d.pairs.find((p) => p.similar === 'aam-aankh').similar = 'lonely'; }, 'pairs[].similar');
});

// ---- deck ------------------------------------------------------------------

test('a deck has exactly two cards per pair, one Hindi and one English, all face down, ids in order', () => {
  for (const count of [6, 8, 10]) {
    const deck = buildDeck(pairs, count, createRng(count));
    assert.equal(deck.length, count * 2);
    assert.deepEqual(deck.map((c) => c.id), Array.from({ length: count * 2 }, (_, i) => i));
    assert.ok(deck.every((c) => c.state === 'down'));
    const byPair = Map.groupBy(deck, (c) => c.pairId);
    assert.equal(byPair.size, count, 'distinct pairs');
    for (const [pairId, cards] of byPair) {
      assert.deepEqual(cards.map((c) => c.lang).sort(), ['en', 'hi'], `${pairId}: one hi and one en`);
      const source = pairs.find((p) => p.pairId === pairId);
      assert.equal(cards.find((c) => c.lang === 'hi').text, source.hi);
      assert.equal(cards.find((c) => c.lang === 'en').text, source.en);
    }
  }
});

test('the deck is shuffled, deterministic for a seed, and different for another', () => {
  const order = (seed) => buildDeck(pairs, 8, createRng(seed)).map((c) => `${c.pairId}:${c.lang}`);
  assert.deepEqual(order(1), order(1));
  assert.notDeepEqual(order(1), order(2));
  // Not left in "hi, en, hi, en" pair order.
  const deck = buildDeck(pairs, 8, createRng(3));
  const adjacentPairs = deck.filter((c, i) => i % 2 === 0 && deck[i + 1].pairId === c.pairId).length;
  assert.ok(adjacentPairs < 8, 'pairs are not sitting next to each other');
});

test('a topic deck only uses that topic, and asking for more pairs than exist fails clearly', () => {
  const fruits = pairsForTopic(pairs, 'Fruits', MIXED);
  assert.ok(buildDeck(fruits, 8, createRng(1)).every((c) => c.pairId.startsWith('Fruits-')));
  assert.throws(() => buildDeck(fruits.slice(0, 5), 6, createRng(1)), { code: 'NOT_ENOUGH_PAIRS' });
  assert.throws(() => buildDeck(fruits, 0, createRng(1)), { code: 'NOT_ENOUGH_PAIRS' });
});

test('when pictures are shown, only pairs that have a picture are used (while enough exist)', () => {
  const fruits = pairsForTopic(pairs, 'Fruits', MIXED);
  assert.ok(fruits.some((p) => !p.image), 'the data has some pairs without a picture');
  for (let seed = 1; seed <= 30; seed++) {
    const deck = buildDeck(fruits, 6, createRng(seed), { needImages: true });
    assert.ok(deck.every((c) => c.image), `seed ${seed}: every card has a picture`);
  }
  // If there are not enough pairs with pictures, fall back to the whole pool rather than failing.
  const few = [...fruits.filter((p) => p.image).slice(0, 4), ...fruits.filter((p) => !p.image)];
  assert.equal(buildDeck(few, 6, createRng(1), { needImages: true }).length, 12);
});

test('Hard prefers complete look-alike groups; other levels do not', () => {
  const family = pairsForTopic(pairs, 'Family', MIXED);
  for (let seed = 1; seed <= 40; seed++) {
    const hard = buildDeck(family, 10, createRng(seed), { preferSimilar: true });
    const chosen = new Map();
    for (const c of hard) chosen.set(c.pairId, family.find((p) => p.pairId === c.pairId));
    const tags = [...chosen.values()].map((p) => p.similar).filter(Boolean);
    for (const tag of new Set(tags)) assert.equal(tags.filter((t) => t === tag).length, 2, `seed ${seed}: ${tag} is a complete pair`);
    assert.ok(new Set(tags).size >= 3, `seed ${seed}: all three look-alike groups (dada/dadi, nana/nani, chacha/chachi) are in`);
  }
  const mixed = buildDeck(pairs, 10, createRng(5), { preferSimilar: true });
  assert.ok(mixed.some((c) => c.text === 'आम') === mixed.some((c) => c.text === 'आँख'), 'आम and आँख come together or not at all');
});

// ---- the state machine -----------------------------------------------------

const game = (count = 3, seed = 1) => new MatchGame(buildDeck(pairs, count, createRng(seed)));
const partner = (g, id) => g.cards.find((c) => c.pairId === g.cards[id].pairId && c.id !== id).id;
const stranger = (g, id) => g.cards.find((c) => c.pairId !== g.cards[id].pairId && c.state === 'down').id;

test('start: idle, nothing up, no moves', () => {
  const g = game();
  assert.equal(g.phase, 'idle');
  assert.equal(g.moves, 0);
  assert.equal(g.totalPairs, 3);
  assert.ok(g.cards.every((c) => c.state === 'down'));
});

test('idle -> oneUp: the first flip turns the card up and is not yet a move', () => {
  const g = game();
  assert.deepEqual(g.flip(0), { type: 'flipped', cardId: 0 });
  assert.equal(g.phase, 'oneUp');
  assert.equal(g.cards[0].state, 'up');
  assert.equal(g.moves, 0);
});

test('oneUp -> idle on a match: both cards stay matched, one move counted', () => {
  const g = game();
  g.flip(0);
  const result = g.flip(partner(g, 0));
  assert.equal(result.type, 'matched');
  assert.deepEqual(result.ids, [0, partner(g, 0)]);
  assert.equal(g.phase, 'idle');
  assert.equal(g.moves, 1);
  assert.equal(g.matchedPairs, 1);
  assert.deepEqual(result.ids.map((id) => g.cards[id].state), ['matched', 'matched']);
});

test('oneUp -> twoUp on a mismatch: both stay up until settle() turns them back', () => {
  const g = game();
  g.flip(0);
  const other = stranger(g, 0);
  const result = g.flip(other);
  assert.deepEqual(result, { type: 'mismatch', ids: [0, other] });
  assert.equal(g.phase, 'twoUp');
  assert.equal(g.moves, 1);
  assert.deepEqual([0, other].map((id) => g.cards[id].state), ['up', 'up']);
  assert.deepEqual(g.settle(), [0, other]);
  assert.equal(g.phase, 'idle');
  assert.deepEqual([0, other].map((id) => g.cards[id].state), ['down', 'down']);
});

test('double tap: flipping the same card twice is ignored and is not a second flip', () => {
  const g = game();
  g.flip(2);
  assert.deepEqual(g.flip(2), { type: 'ignored', reason: 'already-up' });
  assert.equal(g.phase, 'oneUp', 'still waiting for a different second card');
  assert.equal(g.moves, 0);
  assert.equal(g.cards[2].state, 'up');
});

test('rapid taps while two mismatched cards are showing are ignored until settle()', () => {
  const g = game();
  g.flip(0);
  g.flip(stranger(g, 0));
  const third = g.cards.find((c) => c.state === 'down').id;
  assert.deepEqual(g.flip(third), { type: 'ignored', reason: 'waiting-for-flip-back' });
  assert.equal(g.cards[third].state, 'down', 'nothing changed');
  assert.equal(g.moves, 1);
  g.settle();
  assert.equal(g.flip(third).type, 'flipped', 'works again after the flip-back');
});

test('matched cards, unknown cards and a settle with nothing waiting are all harmless', () => {
  const g = game();
  g.flip(0);
  const mate = partner(g, 0);
  g.flip(mate);
  assert.deepEqual(g.flip(0), { type: 'ignored', reason: 'already-matched' });
  assert.deepEqual(g.flip(99), { type: 'ignored', reason: 'no-such-card' });
  assert.deepEqual(g.flip(-1), { type: 'ignored', reason: 'no-such-card' });
  assert.deepEqual(g.settle(), []);
  assert.equal(g.moves, 1);
});

test('the round ends when every pair is matched, and a perfect game takes exactly one move per pair', () => {
  const g = game(4, 9);
  for (let id = 0; id < 8; id++) {
    if (g.cards[id].state !== 'down') continue;
    g.flip(id);
    g.flip(partner(g, id));
  }
  assert.equal(g.done, true);
  assert.equal(g.matchedPairs, 4);
  assert.equal(g.moves, 4);
  assert.ok(g.cards.every((c) => c.state === 'matched'));
});

test('a messy game: mismatches cost moves and the game still finishes with all cards matched', () => {
  const g = game(3, 4);
  let guard = 0;
  while (!g.done && guard++ < 200) {
    const down = g.cards.filter((c) => c.state === 'down');
    g.flip(down[0].id);
    const wrong = g.cards.find((c) => c.state === 'down' && c.pairId !== down[0].pairId);
    if (wrong && guard % 2) { g.flip(wrong.id); g.settle(); } else g.flip(partner(g, down[0].id));
  }
  assert.equal(g.done, true);
  assert.ok(g.moves > 3, 'the wrong guesses were counted');
});

test('the cards snapshot cannot be used to cheat or break the game', () => {
  const g = game();
  g.cards[0].state = 'matched';
  assert.equal(g.cards[0].state, 'down');
});

// ---- levels and stars ------------------------------------------------------

test('level table matches the spec (6 / 8 / 10 pairs; pictures and tint on Easy; look-alikes on Hard)', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].pairs), [6, 8, 10]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].pictures), [true, false, false]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].tinted), [true, false, false]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].similarWords), [false, false, true]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].pairs * 2 / LEVELS[id].cols), [3, 4, 4], 'grids are 4x3, 4x4 and 5x4');
  assert.throws(() => getLevel('x'), { code: 'UNKNOWN_LEVEL' });
});

test('stars by moves: <= 1.5 x pairs = 3, <= 2.5 x pairs = 2, otherwise 1', () => {
  assert.deepEqual([6, 9, 10, 15, 16, 40].map((m) => starsFor(m, 6)), [3, 3, 2, 2, 1, 1]);
  assert.deepEqual([10, 15, 16, 25, 26].map((m) => starsFor(m, 10)), [3, 3, 2, 2, 1]);
});

test('score is 10 per pair minus moves beyond a perfect game, never negative', () => {
  assert.equal(scoreFor(6, 6), 60);
  assert.equal(scoreFor(10, 6), 56);
  assert.equal(scoreFor(500, 6), 0);
});
