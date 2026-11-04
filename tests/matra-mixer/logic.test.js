import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameError } from '../../src/engine/utils/errors.js';
import { createRng } from '../../src/engine/utils/random.js';
import {
  CONSONANTS, SIGNS, VOWEL_SETS, LANGS, LANG_IDS, consonantsFor, signsFor, composeSyllable, syllableId, signOnItsOwn, parseSyllables,
} from '../../src/games/matra-mixer/logic/devanagari.js';
import { LEVELS, LEVEL_IDS, contentFor, levelContent, roundKey } from '../../src/games/matra-mixer/logic/levels.js';
import { DEFAULT_PREFS, sanitizePrefs } from '../../src/games/matra-mixer/logic/prefs.js';
import { validateWords, wordsFor, MIN_WORDS } from '../../src/games/matra-mixer/logic/words.js';
import { validateManifest, clipFor, clipUrl, planSpeech, syllableParts, wordParts } from '../../src/games/matra-mixer/logic/audio.js';
import { makeBuildRounds, checkBuild, makeBubbleRounds, makeWordRounds } from '../../src/games/matra-mixer/logic/rounds.js';
import { RoundSession, MAX_TRIES } from '../../src/games/matra-mixer/logic/session.js';

const DATA = new URL('../../src/games/matra-mixer/data/', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8'));
const WORDS = validateWords(readJson('words.json'));
const quiet = { error() {} };

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GameError, `expected a GameError but got ${error}`);
    return error.code;
  }
  return null;
}

// ---- the letters ------------------------------------------------------------------------------

test('there are 14 vowel signs: the 12 of बाराखडी and the ॅ and ॉ that चौदाखडी adds', () => {
  assert.equal(SIGNS.length, 14);
  assert.equal(signsFor('baarah').length, 12);
  assert.equal(signsFor('chaudah').length, 14);
  assert.deepEqual(signsFor('chaudah').filter((s) => !signsFor('baarah').includes(s)).map((s) => s.char), ['ॅ', 'ॉ']);
  assert.deepEqual(signsFor('baarah').map((s) => s.id), ['a', 'aa', 'i', 'ii', 'u', 'uu', 'e', 'ai', 'o', 'au', 'am', 'ah']);
  assert.equal(SIGNS[0].char, '', 'the first is the sound a consonant has on its own');
  assert.ok(SIGNS.slice(1).every((s) => s.char.length === 1), 'every other sign is one character');
  assert.equal(new Set(SIGNS.map((s) => s.id)).size, SIGNS.length);
  assert.equal(new Set(SIGNS.map((s) => s.char)).size, SIGNS.length);
  assert.deepEqual(Object.keys(VOWEL_SETS), ['baarah', 'chaudah']);
});

test('consonants: Hindi and Marathi share the letters, and Marathi adds ळ', () => {
  const hi = consonantsFor('hi').map((c) => c.char);
  const mr = consonantsFor('mr').map((c) => c.char);
  assert.equal(hi.length, 34);
  assert.equal(mr.length, 35);
  assert.ok(mr.includes('ळ') && !hi.includes('ळ'));
  assert.ok(['क्ष', 'त्र', 'ज्ञ'].every((joined) => hi.includes(joined) && mr.includes(joined)));
  assert.equal(new Set(CONSONANTS.map((c) => c.id)).size, CONSONANTS.length, 'audio names are all different');
  assert.equal(new Set(CONSONANTS.map((c) => c.char)).size, CONSONANTS.length);
  assert.ok(CONSONANTS.every((c) => /^[a-z]+$/.test(c.id)), 'audio names are plain lowercase letters');
  assert.ok(SIGNS.every((s) => /^[a-z]+$/.test(s.id)));
});

test('syllables are the consonant with the sign after it, and have their own audio name', () => {
  const [k] = CONSONANTS;
  const sign = (id) => SIGNS.find((s) => s.id === id);
  assert.equal(composeSyllable(k, sign('a')), 'क');
  assert.equal(composeSyllable(k, sign('aa')), 'का');
  assert.equal(composeSyllable(k, sign('ii')), 'की');
  assert.equal(composeSyllable(k, sign('ah')), 'कः');
  assert.equal(syllableId(k, sign('aa')), 'k-aa');
  const ksh = CONSONANTS.find((c) => c.id === 'ksh');
  assert.equal(composeSyllable(ksh, sign('o')), 'क्षो');
  assert.equal(signOnItsOwn(sign('aa')), '◌ा');
  assert.equal(signOnItsOwn(sign('a')), 'अ');
});

test('every syllable of every language and vowel set is different, so each has its own sound to record', () => {
  for (const lang of LANG_IDS) for (const set of Object.keys(VOWEL_SETS)) {
    const { syllables } = contentFor({ tier: 3, lang, vowelSet: set });
    assert.equal(new Set(syllables.map((s) => s.text)).size, syllables.length, `${lang} ${set}`);
    assert.equal(new Set(syllables.map((s) => s.id)).size, syllables.length);
  }
});

test('parseSyllables: splits a word into consonants with their signs', () => {
  const read = (word) => parseSyllables(word).map((s) => s.consonant.id + '-' + s.sign.id);
  assert.deepEqual(read('कमल'), ['k-a', 'm-a', 'l-a']);
  assert.deepEqual(read('मासा'), ['m-aa', 's-aa']);
  assert.deepEqual(read('पतंग'), ['p-a', 't-am', 'g-a']);
  assert.deepEqual(read('नक्षत्र'), ['n-a', 'ksh-a', 'tr-a'], 'क्ष and त्र are single letters');
  assert.deepEqual(read('ज्ञान'), ['gy-aa', 'n-a']);
  assert.deepEqual(read('बॅट'), ['b-ae', 'tt-a']);
  assert.deepEqual(read('घर'), ['gh-a', 'r-a']);
});

test('parseSyllables: refuses what the game cannot show, naming the word', () => {
  for (const bad of ['आम', 'ऊँट', 'हत्ती', 'घोड़ा', 'abc', 'क ा', '', 'ा']) assert.equal(codeOf(() => parseSyllables(bad)), 'BAD_WORD', bad);
  try { parseSyllables('हत्ती'); } catch (error) { assert.equal(error.context.word, 'हत्ती'); }
});

// ---- levels -----------------------------------------------------------------------------------

test('levels: each adds consonants and signs; Hard adds the joined letters and ं ः', () => {
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  const sizes = LEVEL_IDS.map((id) => {
    const c = levelContent(id, 'hi', 'baarah');
    return [c.consonants.length, c.signs.length, c.syllables.length];
  });
  assert.deepEqual(sizes, [[12, 6, 72], [31, 10, 310], [34, 12, 408]], 'Hindi');
  assert.deepEqual(levelContent('easy', 'hi', 'baarah').consonants.map((c) => c.char).join(''), 'कखगघचजतनपमरल');
  assert.deepEqual(levelContent('easy', 'hi', 'baarah').signs.map((s) => s.id), ['a', 'aa', 'i', 'ii', 'u', 'uu']);
  assert.equal(levelContent('hard', 'hi', 'chaudah').signs.length, 14);
  assert.equal(levelContent('hard', 'mr', 'baarah').consonants.some((c) => c.char === 'ळ'), true);
  assert.equal(levelContent('medium', 'mr', 'chaudah').signs.length, 10, 'ॅ and ॉ wait for Hard');
  assert.equal(codeOf(() => levelContent('extreme', 'hi', 'baarah')), 'UNKNOWN_LEVEL');
  assert.throws(() => { LEVELS.easy.rounds = 3; }, TypeError);
});

test('levels: harder levels offer more choices', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].buildChoices), [4, 5, 6]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].bubbles), [4, 6, 8]);
  assert.ok(LEVEL_IDS.every((id) => LEVELS[id].rounds === 10));
});

test('roundKey names the activity, language and level', () => {
  assert.equal(roundKey('bubbles', 'mr', 'hard'), 'bubbles-mr-hard');
});

test('prefs: defaults, and a bad value falls back by itself and is named in the log', () => {
  assert.deepEqual(DEFAULT_PREFS, { lang: 'hi', vowelSet: 'baarah' });
  assert.deepEqual(sanitizePrefs(undefined, quiet), DEFAULT_PREFS);
  assert.deepEqual(sanitizePrefs({ lang: 'mr', vowelSet: 'chaudah' }, quiet), { lang: 'mr', vowelSet: 'chaudah' });
  assert.deepEqual(sanitizePrefs({ lang: 'mr' }, quiet), { lang: 'mr', vowelSet: 'baarah' });
  const logged = [];
  assert.deepEqual(sanitizePrefs({ lang: 'fr', vowelSet: 'chaudah' }, { error: (...a) => logged.push(a) }), { lang: 'hi', vowelSet: 'chaudah' });
  assert.match(logged[0][0], /lang "fr"/);
  assert.deepEqual(sanitizePrefs('text', { error: (...a) => logged.push(a) }), DEFAULT_PREFS);
  assert.deepEqual(sanitizePrefs([1], quiet), DEFAULT_PREFS);
  assert.equal(logged.length, 2);
  assert.notEqual(sanitizePrefs(undefined), DEFAULT_PREFS, 'a copy, so changing it changes nothing else');
});

// ---- the word lists ---------------------------------------------------------------------------

test('word lists: both languages have plenty, each word is made only of syllables the game can show', () => {
  for (const lang of LANG_IDS) {
    assert.ok(WORDS[lang].length >= MIN_WORDS, lang);
    for (const w of WORDS[lang]) {
      assert.ok(w.syllables.length >= 1 && w.emoji && w.meaning, w.word);
      assert.equal(w.syllables.map((s) => composeSyllable(s.consonant, s.sign)).join(''), w.word, `${w.word} reads back as itself`);
    }
    assert.equal(new Set(WORDS[lang].map((w) => w.emoji)).size, WORDS[lang].length, `${lang}: every picture is different`);
    assert.equal(new Set(WORDS[lang].map((w) => w.word)).size, WORDS[lang].length);
  }
});

test('word lists: ळ is only in Marathi words, and every word uses only letters of its language', () => {
  assert.ok(WORDS.hi.every((w) => w.syllables.every((s) => s.consonant.langs.includes('hi'))));
  assert.ok(WORDS.mr.every((w) => w.syllables.every((s) => s.consonant.langs.includes('mr'))));
  assert.ok(WORDS.mr.some((w) => w.word.includes('ळ')));
  assert.ok(!WORDS.hi.some((w) => w.word.includes('ळ')));
});

test('word lists: every level, language and vowel set has enough words for a round with real choices', () => {
  for (const lang of LANG_IDS) for (const set of Object.keys(VOWEL_SETS)) for (const id of LEVEL_IDS) {
    const words = wordsFor(WORDS[lang], levelContent(id, lang, set));
    assert.ok(words.length >= 8, `${lang} ${set} ${id}: only ${words.length} words`);
  }
});

test('word lists: easy words use only easy letters, and the words with ॅ ॉ need चौदाखडी and Hard', () => {
  for (const lang of LANG_IDS) {
    const easy = wordsFor(WORDS[lang], levelContent('easy', lang, 'baarah'));
    assert.ok(easy.every((w) => w.syllables.every((s) => s.consonant.tier === 1 && s.sign.tier === 1)));
    assert.ok(easy.some((w) => w.word === 'घर'));
    const hardBaarah = wordsFor(WORDS[lang], levelContent('hard', lang, 'baarah')).map((w) => w.word);
    const hardChaudah = wordsFor(WORDS[lang], levelContent('hard', lang, 'chaudah')).map((w) => w.word);
    assert.ok(!hardBaarah.includes('बॅट') && hardChaudah.includes('बॅट'));
    assert.ok(!wordsFor(WORDS[lang], levelContent('medium', lang, 'chaudah')).some((w) => w.word === 'बॅट'));
    assert.ok(hardChaudah.length > hardBaarah.length);
  }
});

test('validateWords: bad content is refused and the problem is named', () => {
  const good = () => JSON.parse(JSON.stringify(readJson('words.json')));
  const bad = (change) => codeOf(() => { const d = good(); change(d); validateWords(d); });
  assert.equal(bad(() => {}), null);
  assert.equal(codeOf(() => validateWords({})), 'INVALID_DATA');
  assert.equal(bad((d) => { d.hi = d.hi.slice(0, 5); }), 'INVALID_DATA', 'too few');
  assert.equal(bad((d) => { d.mr[3].word = 'आम'; }), 'INVALID_DATA', 'a letter on its own');
  assert.equal(bad((d) => { d.hi[2].word = d.hi[0].word; }), 'INVALID_DATA', 'a repeated word');
  assert.equal(bad((d) => { d.hi[2].emoji = d.hi[0].emoji; }), 'INVALID_DATA', 'a repeated picture');
  assert.equal(bad((d) => { d.hi[1].meaning = ''; }), 'INVALID_DATA');
  assert.equal(bad((d) => { delete d.mr[1].emoji; }), 'INVALID_DATA');
  try {
    const d = good();
    d.mr[3].word = 'हत्ती';
    validateWords(d);
  } catch (error) {
    assert.equal(error.context.field, 'mr[3].word');
    assert.equal(error.context.file, 'words.json');
  }
});

// ---- audio ------------------------------------------------------------------------------------

test('audio manifest: the shipped one is valid, and file names must look like syllable recordings', () => {
  assert.deepEqual(validateManifest(readJson('audio-manifest.json')), { hi: [], mr: [] });
  assert.deepEqual(validateManifest({ hi: ['k-aa.mp3', 'k-a.ogg'], mr: [] }), { hi: ['k-aa.mp3', 'k-a.ogg'], mr: [] });
  for (const bad of [{ hi: [] }, { hi: ['ka.mp3'], mr: [] }, { hi: ['k-aa.txt'], mr: [] }, { hi: ['../k-aa.mp3'], mr: [] }, { hi: [3], mr: [] }, { hi: ['k-aa.mp3', 'k-aa.mp3'], mr: [] }, { hi: 'k-aa.mp3', mr: [] }, null]) {
    assert.equal(codeOf(() => validateManifest(bad)), 'INVALID_DATA', JSON.stringify(bad));
  }
});

test('audio: a recording is found by the syllable name, in the right language', () => {
  const manifest = { hi: ['k-aa.mp3', 'm-a.ogg'], mr: ['k-aa.mp3'] };
  assert.equal(clipFor(manifest, 'hi', 'k-aa'), 'k-aa.mp3');
  assert.equal(clipFor(manifest, 'hi', 'm-a'), 'm-a.ogg');
  assert.equal(clipFor(manifest, 'hi', 'k-a'), null, 'k-a is not k-aa');
  assert.equal(clipFor(manifest, 'mr', 'm-a'), null);
  assert.equal(clipUrl('hi', 'k-aa.mp3'), 'assets/audio/hi/k-aa.mp3');
});

test('audio: recorded voices come first, and the browser speaks only when a recording is missing', () => {
  const manifest = { hi: ['k-a.mp3', 'm-a.mp3', 'l-a.mp3', 'k-aa.mp3'], mr: [] };
  const part = (id, text) => ({ id, text });
  assert.deepEqual(planSpeech(manifest, 'hi', [part('k-aa', 'का')]), { kind: 'clips', files: ['k-aa.mp3'] });
  assert.deepEqual(planSpeech(manifest, 'hi', [part('k-a', 'क'), part('m-a', 'म'), part('l-a', 'ल')]), { kind: 'clips', files: ['k-a.mp3', 'm-a.mp3', 'l-a.mp3'] }, 'a word from its syllables');
  assert.deepEqual(planSpeech(manifest, 'hi', [part('k-a', 'क'), part('g-a', 'ग')]), { kind: 'speech', text: 'कग' }, 'one missing, so the whole word is spoken');
  assert.deepEqual(planSpeech(manifest, 'mr', [part('k-aa', 'का')]), { kind: 'speech', text: 'का' });
  assert.deepEqual(planSpeech(manifest, 'hi', []), { kind: 'speech', text: '' });
  assert.equal(LANGS.hi.speechLang, 'hi-IN');
  assert.equal(LANGS.mr.speechLang, 'mr-IN');
});

test('audio: a syllable is one part and a word is one part for each syllable, in order', () => {
  const content = levelContent('easy', 'hi', 'baarah');
  const ka = content.syllables.find((s) => s.id === 'k-aa');
  assert.deepEqual(syllableParts(ka), [{ id: 'k-aa', text: 'का' }]);
  const word = WORDS.hi.find((w) => w.word === 'कमल');
  assert.deepEqual(wordParts(word), [{ id: 'k-a', text: 'क' }, { id: 'm-a', text: 'म' }, { id: 'l-a', text: 'ल' }]);
  const joined = WORDS.hi.find((w) => w.word === 'नक्षत्र');
  assert.deepEqual(wordParts(joined).map((p) => p.id), ['n-a', 'ksh-a', 'tr-a']);
  assert.equal(wordParts(joined).map((p) => p.text).join(''), 'नक्षत्र');
  for (const lang of LANG_IDS) for (const w of WORDS[lang]) assert.equal(wordParts(w).map((p) => p.text).join(''), w.word, w.word);
});

// ---- build ------------------------------------------------------------------------------------

test('build: ten different syllables, each with the right consonant and sign among the right number of choices', () => {
  for (const lang of LANG_IDS) for (const id of LEVEL_IDS) {
    const content = levelContent(id, lang, 'chaudah');
    for (let seed = 1; seed < 20; seed++) {
      const rounds = makeBuildRounds({ content, choices: LEVELS[id].buildChoices, count: LEVELS[id].rounds, rng: createRng(seed) });
      assert.equal(rounds.length, 10);
      assert.equal(new Set(rounds.map((r) => r.target.id)).size, 10, 'every target is different');
      for (const r of rounds) {
        assert.equal(r.consonants.length, LEVELS[id].buildChoices);
        assert.equal(r.signs.length, LEVELS[id].buildChoices);
        assert.equal(new Set(r.consonants).size, r.consonants.length);
        assert.equal(new Set(r.signs).size, r.signs.length);
        assert.ok(r.consonants.includes(r.target.consonant) && r.signs.includes(r.target.sign));
        assert.ok(r.consonants.every((c) => content.consonants.includes(c)) && r.signs.every((s) => content.signs.includes(s)));
      }
    }
  }
});

test('build: checking says which part was wrong', () => {
  const content = levelContent('easy', 'hi', 'baarah');
  const round = makeBuildRounds({ content, choices: 4, count: 1, rng: createRng(3) })[0];
  const otherConsonant = round.consonants.find((c) => c !== round.target.consonant);
  const otherSign = round.signs.find((s) => s !== round.target.sign);
  assert.deepEqual(checkBuild(round, round.target.consonant, round.target.sign), { consonantOk: true, signOk: true, correct: true });
  assert.deepEqual(checkBuild(round, otherConsonant, round.target.sign), { consonantOk: false, signOk: true, correct: false });
  assert.deepEqual(checkBuild(round, round.target.consonant, otherSign), { consonantOk: true, signOk: false, correct: false });
  assert.deepEqual(checkBuild(round, otherConsonant, otherSign), { consonantOk: false, signOk: false, correct: false });
});

test('build: the same seed gives the same rounds; there must be something to build', () => {
  const content = levelContent('medium', 'mr', 'baarah');
  const make = (seed) => makeBuildRounds({ content, choices: 5, count: 10, rng: createRng(seed) }).map((r) => [r.target.id, r.consonants.map((c) => c.id), r.signs.map((s) => s.id)]);
  assert.deepEqual(make(7), make(7));
  assert.notDeepEqual(make(7), make(8));
  assert.equal(codeOf(() => makeBuildRounds({ content: { consonants: [], signs: [], syllables: [] }, choices: 4, count: 3, rng: createRng(1) })), 'NOT_ENOUGH_CONTENT');
});

// ---- bubbles ----------------------------------------------------------------------------------

test('bubbles: the target is among the right number of different bubbles, with look-alikes', () => {
  for (const lang of LANG_IDS) for (const id of LEVEL_IDS) {
    const content = levelContent(id, lang, 'chaudah');
    for (let seed = 1; seed < 20; seed++) {
      const rounds = makeBubbleRounds({ content, bubbles: LEVELS[id].bubbles, count: 10, rng: createRng(seed) });
      assert.equal(rounds.length, 10);
      assert.equal(new Set(rounds.map((r) => r.target.id)).size, 10);
      for (const r of rounds) {
        assert.equal(r.bubbles.length, LEVELS[id].bubbles);
        assert.equal(new Set(r.bubbles.map((b) => b.id)).size, r.bubbles.length, 'no two bubbles show the same syllable');
        assert.ok(r.bubbles.includes(r.target));
        assert.ok(r.bubbles.every((b) => content.syllables.includes(b)));
      }
    }
  }
});

test('bubbles: some of the other bubbles share the consonant or the sign, to tell them apart', () => {
  const content = levelContent('hard', 'hi', 'baarah');
  let sameConsonant = 0;
  let sameSign = 0;
  for (let seed = 1; seed < 50; seed++) {
    for (const r of makeBubbleRounds({ content, bubbles: 8, count: 10, rng: createRng(seed) })) {
      sameConsonant += r.bubbles.filter((b) => b !== r.target && b.consonant === r.target.consonant).length;
      sameSign += r.bubbles.filter((b) => b !== r.target && b.sign === r.target.sign).length;
    }
  }
  assert.ok(sameConsonant / 500 >= 2 && sameSign / 500 >= 2, `look-alikes per round: ${sameConsonant / 500} and ${sameSign / 500}`);
  assert.equal(codeOf(() => makeBubbleRounds({ content: levelContent('easy', 'hi', 'baarah'), bubbles: 100, count: 3, rng: createRng(1) })), 'NOT_ENOUGH_CONTENT');
});

// ---- reading words ----------------------------------------------------------------------------

test('words: each round is a word that can be read at the level, with different pictures to choose from', () => {
  for (const lang of LANG_IDS) for (const set of Object.keys(VOWEL_SETS)) for (const id of LEVEL_IDS) {
    const content = levelContent(id, lang, set);
    for (let seed = 1; seed < 15; seed++) {
      const rounds = makeWordRounds({ words: WORDS[lang], content, choices: LEVELS[id].wordChoices, count: 8, rng: createRng(seed) });
      assert.equal(rounds.length, 8);
      assert.equal(new Set(rounds.map((r) => r.word.word)).size, 8);
      const readable = new Set(wordsFor(WORDS[lang], content));
      for (const r of rounds) {
        assert.ok(readable.has(r.word), `${r.word.word} is only made of syllables already learned`);
        assert.equal(r.options.length, LEVELS[id].wordChoices);
        assert.ok(r.options.includes(r.word));
        assert.equal(new Set(r.options.map((o) => o.emoji)).size, r.options.length);
        assert.ok(r.options.every((o) => readable.has(o)));
      }
    }
  }
});

test('words: too few readable words is an error that says so', () => {
  assert.equal(codeOf(() => makeWordRounds({ words: WORDS.hi.slice(0, 2), content: levelContent('hard', 'hi', 'baarah'), choices: 4, count: 8, rng: createRng(1) })), 'NOT_ENOUGH_CONTENT');
});

// ---- a run of rounds --------------------------------------------------------------------------

test('RoundSession: first tries count; a wrong try can be repeated; after two wrong tries the answer is shown', () => {
  assert.equal(MAX_TRIES, 2);
  const session = new RoundSession(['a', 'b', 'c', 'd']);
  assert.deepEqual([session.current, session.position, session.total, session.over], ['a', 1, 4, false]);
  assert.deepEqual(session.answer(true), { correct: true, tries: 1, reveal: true });
  assert.equal(session.answer(true), null, 'finished: advance first');
  session.advance();
  assert.deepEqual(session.answer(false), { correct: false, tries: 1, reveal: false });
  assert.deepEqual(session.answer(true), { correct: true, tries: 2, reveal: true });
  session.advance();
  assert.equal(session.current, 'c');
  assert.deepEqual(session.answer(false), { correct: false, tries: 1, reveal: false });
  assert.deepEqual(session.answer(false), { correct: false, tries: 2, reveal: true });
  session.advance();
  session.advance();
  assert.equal(session.current, 'd', 'advance does nothing before the round is finished');
  session.answer(true);
  session.advance();
  assert.equal(session.over, true);
  assert.equal(session.current, null);
  assert.equal(session.position, 4);
  assert.equal(session.answer(true), null);
  const summary = session.summary();
  assert.deepEqual({ total: summary.total, correct: summary.correct, answered: summary.answered, stars: summary.stars }, { total: 4, correct: 2, answered: 4, stars: 1 });
  assert.deepEqual(summary.missed, ['b', 'c']);
});

test('RoundSession: stars by first-try accuracy, and rounds never reached count as wrong', () => {
  const run = (rights, total) => {
    const s = new RoundSession(Array.from({ length: total }, (_, i) => i));
    for (let i = 0; i < rights.length; i++) { s.answer(rights[i]); if (!rights[i]) s.answer(true); s.advance(); }
    return s.summary();
  };
  assert.equal(run(Array(10).fill(true), 10).stars, 3);
  assert.equal(run([...Array(9).fill(true), false], 10).stars, 3);
  assert.equal(run([...Array(8).fill(true), false, false], 10).stars, 2);
  assert.equal(run([...Array(7).fill(true), false, false, false], 10).stars, 2);
  assert.equal(run([...Array(6).fill(true), ...Array(4).fill(false)], 10).stars, 1);
  const early = run([true, true, true], 10);
  assert.deepEqual({ correct: early.correct, answered: early.answered, stars: early.stars }, { correct: 3, answered: 3, stars: 1 });
  assert.equal(codeOf(() => new RoundSession([])), 'NO_ROUNDS');
});
