import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDeck } from '../../src/games/hindi-english-match/logic/deck.js';
import {
  DEFAULT_LANGUAGE, ENGLISH, LANGUAGES, LANGUAGE_IDS, getLanguage, levelKey, readLanguage, similarTagOf, voiceOf, withLanguage, wordIn,
} from '../../src/games/hindi-english-match/logic/languages.js';
import { MIXED } from '../../src/games/hindi-english-match/logic/levels.js';
import { MIN_PAIRS_PER_TOPIC, pairsForTopic, validatePairs } from '../../src/games/hindi-english-match/logic/pairs.js';
import { createRng } from '../../src/engine/utils/random.js';

const RAW = JSON.parse(readFileSync(new URL('../../src/games/hindi-english-match/data/pairs.json', import.meta.url), 'utf8'));
const { topics, pairs } = validatePairs(RAW);
const WITHOUT_MARATHI = ['Family-maternal-grandfather', 'Family-maternal-grandmother'];

// ---- the languages ---------------------------------------------------------

test('Hindi and Marathi each have a name, a name in their own script, a voice, a card tag and an example word', () => {
  assert.deepEqual(LANGUAGE_IDS, ['hi', 'mr']);
  assert.equal(DEFAULT_LANGUAGE, 'hi', 'Hindi is what a child gets until they choose');
  assert.deepEqual(LANGUAGES.mr, { id: 'mr', name: 'Marathi', label: 'मराठी', voice: 'mr-IN', tag: 'मरा', example: 'सफरचंद' });
  for (const language of Object.values(LANGUAGES)) {
    assert.match(language.label, /[ऀ-ॿ]/);
    assert.match(language.tag, /[ऀ-ॿ]/);
    assert.match(language.example, /[ऀ-ॿ]/);
    assert.match(language.voice, /^[a-z]{2}-[A-Z]{2}$/);
  }
  assert.equal(ENGLISH.voice, 'en-IN');
});

test('an unknown language is an error with its code, including names an object happens to have', () => {
  for (const id of ['xx', '', 'constructor', '__proto__', 'toString']) assert.throws(() => getLanguage(id), { code: 'UNKNOWN_LANGUAGE' }, id);
  assert.equal(getLanguage('mr'), LANGUAGES.mr);
  assert.throws(() => voiceOf('xx'), { code: 'UNKNOWN_LANGUAGE' });
  assert.equal(voiceOf('en'), 'en-IN');
  assert.equal(voiceOf('mr'), 'mr-IN');
});

test('Hindi keeps the plain level id for its stars, so saves made before Marathi still count; Marathi has its own', () => {
  assert.equal(levelKey('hi', 'easy'), 'easy');
  assert.equal(levelKey('mr', 'easy'), 'mr-easy');
  assert.equal(levelKey('mr', 'hard'), 'mr-hard');
  assert.notEqual(levelKey('hi', 'medium'), levelKey('mr', 'medium'));
});

test('the saved language is read safely: anything that is not a known language means Hindi', () => {
  assert.equal(readLanguage({ language: 'mr' }), 'mr');
  assert.equal(readLanguage({ language: 'hi' }), 'hi');
  for (const extra of [undefined, null, {}, [], 'mr', 5, { language: 'xx' }, { language: 7 }, { language: null }, { language: 'constructor' }, { language: ['mr'] }]) {
    assert.equal(readLanguage(extra), 'hi', JSON.stringify(extra));
  }
});

test('remembering the language keeps the rest of the save, and refuses a language that does not exist', () => {
  assert.deepEqual(withLanguage({ learned: ['a'] }, 'mr'), { learned: ['a'], language: 'mr' });
  assert.deepEqual(withLanguage(undefined, 'mr'), { language: 'mr' });
  assert.deepEqual(withLanguage('not an object', 'hi'), { language: 'hi' });
  const before = { language: 'hi' };
  assert.deepEqual(withLanguage(before, 'mr'), { language: 'mr' });
  assert.deepEqual(before, { language: 'hi' }, 'the old save is not changed');
  assert.throws(() => withLanguage({}, 'xx'), { code: 'UNKNOWN_LANGUAGE' });
});

test('a pair\'s word in a language, and its look-alike tag, come from that language\'s own fields', () => {
  const apple = pairs.find((p) => p.pairId === 'Fruits-apple');
  assert.equal(wordIn(apple, 'hi'), 'सेब');
  assert.equal(wordIn(apple, 'mr'), 'सफरचंद');
  assert.equal(wordIn({ hi: 'सेब' }, 'mr'), null, 'a pair with no Marathi word has none');
  assert.equal(wordIn({ hi: 'सेब', mr: '' }, 'mr'), null);
  assert.equal(wordIn({ hi: 'सेब', mr: 5 }, 'mr'), null);
  assert.equal(similarTagOf({ similar: 'a', similarMr: 'b' }, 'hi'), 'a');
  assert.equal(similarTagOf({ similar: 'a', similarMr: 'b' }, 'mr'), 'b');
  assert.equal(similarTagOf({ similar: 'a' }, 'mr'), undefined);
});

// ---- the shipped Marathi ---------------------------------------------------

test('every pair has a Marathi word except the two maternal grandparents, and no word is used twice in a language', () => {
  assert.deepEqual(pairs.filter((p) => wordIn(p, 'mr') === null).map((p) => p.pairId), WITHOUT_MARATHI);
  for (const language of LANGUAGE_IDS) {
    const words = pairs.map((p) => wordIn(p, language)).filter(Boolean);
    assert.equal(new Set(words).size, words.length, `${language}: every word is its own`);
  }
  assert.ok(pairs.every((p) => wordIn(p, 'mr') === null || /[ऀ-ॿ]/.test(p.mr)));
  assert.equal(pairs.filter((p) => p.mr).length, 145);
});

test('every topic has at least twelve pairs in Marathi, as in Hindi, so any topic can fill a round', () => {
  for (const topic of topics) {
    for (const language of LANGUAGE_IDS) assert.ok(pairsForTopic(pairs, topic, MIXED, language).length >= MIN_PAIRS_PER_TOPIC, `${topic} in ${language}`);
  }
  assert.equal(pairsForTopic(pairs, MIXED, MIXED, 'hi').length, 147);
  assert.equal(pairsForTopic(pairs, MIXED, MIXED, 'mr').length, 145);
  assert.equal(pairsForTopic(pairs, MIXED, MIXED).length, 147, 'Hindi is the default language');
  assert.ok(pairsForTopic(pairs, 'Family', MIXED, 'mr').every((p) => !WITHOUT_MARATHI.includes(p.pairId)));
});

test('Marathi has its own look-alike groups, each of two or more words', () => {
  const groups = new Map();
  for (const p of pairs) {
    const tag = similarTagOf(p, 'mr');
    if (tag) groups.set(tag, [...(groups.get(tag) ?? []), p.mr]);
  }
  assert.deepEqual(groups.get('aajoba-aaji')?.sort(), ['आजी', 'आजोबा'].sort());
  assert.deepEqual(groups.get('kaka-kaku')?.sort(), ['काका', 'काकू'].sort());
  assert.deepEqual(groups.get('haat-hatti')?.sort(), ['हत्ती', 'हात'].sort());
  for (const [tag, members] of groups) assert.ok(members.length >= 2, tag);
  // The Hindi groups are untouched: nana/nani are still look-alikes in Hindi, and not in Marathi (they have no Marathi word).
  assert.ok(pairs.filter((p) => p.similar === 'nana-nani').length === 2 && pairs.filter((p) => p.similar === 'nana-nani').every((p) => !p.mr));
});

// ---- a deck in a language --------------------------------------------------

test('a Marathi deck has one Marathi and one English card for each pair, and Marathi is what the cards say', () => {
  const deck = buildDeck(pairsForTopic(pairs, 'Animals', MIXED, 'mr'), 8, createRng(3), { language: 'mr' });
  assert.equal(deck.length, 16);
  for (const card of deck) {
    const pair = pairs.find((p) => p.pairId === card.pairId);
    assert.equal(card.text, card.lang === 'en' ? pair.en : pair.mr);
    assert.ok(card.lang === 'en' || card.lang === 'mr', 'no Hindi card in a Marathi deck');
  }
  assert.equal(deck.filter((c) => c.lang === 'mr').length, 8);
  assert.equal(deck.filter((c) => c.lang === 'en').length, 8);
});

test('the deck is Hindi unless Marathi is asked for, exactly as it was before there was a choice', () => {
  const hindi = buildDeck(pairs, 6, createRng(9));
  assert.deepEqual(hindi, buildDeck(pairs, 6, createRng(9), { language: 'hi' }));
  assert.ok(hindi.some((c) => c.lang === 'hi') && !hindi.some((c) => c.lang === 'mr'));
});

test('a pair with no Marathi word never goes into a Marathi deck, however the cards are dealt', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const family = buildDeck(pairs.filter((p) => p.topic === 'Family'), 10, createRng(seed), { language: 'mr', preferSimilar: seed % 2 === 0 });
    for (const card of family) assert.ok(!WITHOUT_MARATHI.includes(card.pairId), `seed ${seed}: ${card.pairId}`);
  }
  // Only twelve Family pairs have a Marathi word, so a deck of thirteen cannot be made, and the error says what is short.
  assert.throws(() => buildDeck(pairs.filter((p) => p.topic === 'Family'), 13, createRng(1), { language: 'mr' }), (e) => e.code === 'NOT_ENOUGH_PAIRS' && e.context.available === 12 && e.context.language === 'mr');
});

test('Hard in Marathi prefers complete groups of Marathi look-alikes', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const deck = buildDeck(pairs, 10, createRng(seed), { language: 'mr', preferSimilar: true });
    const chosen = [...new Set(deck.map((c) => c.pairId))].map((id) => pairs.find((p) => p.pairId === id));
    const tags = chosen.map((p) => p.similarMr).filter(Boolean);
    for (const tag of new Set(tags)) assert.equal(tags.filter((t) => t === tag).length, 2, `seed ${seed}: ${tag} comes whole`);
    assert.equal(new Set(tags).size, 3, `seed ${seed}: all three Marathi groups are in a deck of ten`);
  }
});

// ---- the data checks for a second language ---------------------------------

test('validatePairs names the field of a Marathi mistake', () => {
  const bad = (mutate, field, pattern) => {
    const data = structuredClone(RAW);
    mutate(data);
    assert.throws(() => validatePairs(data), (e) => e.code === 'INVALID_DATA' && e.context.file === 'pairs.json' && e.context.field === field && pattern.test(e.message), field);
  };
  bad((d) => { d.pairs[0].mr = 'apple'; }, 'pairs[0].mr', /Marathi word written in Devanagari/);
  bad((d) => { d.pairs[1].mr = d.pairs[0].mr; }, 'pairs[1].mr', /also the word of "Fruits-apple"/);
  bad((d) => { d.pairs[1].hi = d.pairs[0].hi; }, 'pairs[1].hi', /so two cards would read the same/);
  bad((d) => { delete d.pairs[0].hi; }, 'pairs[0].hi', /Hindi word written in Devanagari/);
  bad((d) => { delete d.pairs.find((p) => p.pairId === 'Colours-red').mr; }, 'topics["Colours"]', /has 11 Marathi pairs; at least 12/);
  bad((d) => { d.pairs.find((p) => p.similarMr === 'kaka-kaku').similarMr = 'lonely'; }, 'pairs[].similar', /Marathi tag "lonely"/);
  // A tag nobody else shares is refused in Hindi too (the same rule), and the message says which language.
  bad((d) => { d.pairs.find((p) => p.similar === 'aam-aankh').similar = 'lonely'; }, 'pairs[].similar', /Hindi tag "lonely"/);
});
