import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameError } from '../../src/engine/utils/errors.js';
import { createRng } from '../../src/engine/utils/random.js';
import { SPACING, dist, line, bounds, pathLength } from '../../src/games/trace-trail/logic/shapes.js';
import { RULES, GLYPH_HEIGHT, defineGlyph } from '../../src/games/trace-trail/logic/glyphs/define.js';
import { STROKES, NUMBERS, CAPITALS, SMALLS } from '../../src/games/trace-trail/logic/glyphs/english.js';
import { LETTERS, SINGLE_LETTERS, letterById, writeStrokes, AA_SIGN } from '../../src/games/trace-trail/logic/glyphs/devanagari.js';
import {
  ENGLISH_WORDS, DEVANAGARI_WORDS, ENGLISH_WORD_GLYPHS, DEVANAGARI_WORD_GLYPHS, layoutEnglish, layoutDevanagari,
} from '../../src/games/trace-trail/logic/glyphs/words.js';
import { SETS, SET_IDS } from '../../src/games/trace-trail/logic/glyphs/index.js';
import { LEVELS, LEVEL_IDS, roundKey, pickGlyphs, glyphStars, roundStars, effectiveTolerance, MIN_TOLERANCE_PX } from '../../src/games/trace-trail/logic/levels.js';
import { GlyphTracer } from '../../src/games/trace-trail/logic/trace.js';
import { paginate, rowLayout, ROWS_PER_PAGE } from '../../src/games/trace-trail/logic/worksheet.js';

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GameError, `expected a GameError but got ${error}`);
    return error.code;
  }
  return null;
}

/** The direction a stroke sets off in, in degrees. */
const heading = (stroke) => (Math.atan2(stroke[Math.min(6, stroke.length - 1)][1] - stroke[0][1], stroke[Math.min(6, stroke.length - 1)][0] - stroke[0][0]) * 180) / Math.PI;

/** Writes a glyph with the pencil exactly on its paths, or pushed a little to each side in turn. */
function write(glyph, tolerance, side = 0) {
  const tracer = new GlyphTracer(glyph.strokes, { tolerance });
  for (const stroke of glyph.strokes) {
    assert.equal(tracer.pointerDown(stroke[0]).type, 'started', `${glyph.id}: the start of a stroke is accepted`);
    let event = null;
    for (let i = 1; i < stroke.length; i++) {
      event = tracer.pointerMove([stroke[i][0], stroke[i][1] + (i % 2 ? side : -side)]);
      if (event.type !== 'progress') break;
    }
    assert.notEqual(event?.type, 'progress', `${glyph.id}: a stroke is finished by following it`);
  }
  assert.equal(tracer.done, true, glyph.id);
  return tracer.results();
}

// ---- the rules and defining a glyph -----------------------------------------------------------

test('the ruled lines run from the top down: cap, x-height, baseline, descender; the headline is above the x-height', () => {
  assert.ok(RULES.cap < RULES.xHeight && RULES.xHeight < RULES.baseline && RULES.baseline < RULES.descender);
  assert.ok(RULES.headline > RULES.cap && RULES.headline < RULES.xHeight);
  assert.ok(RULES.descender < GLYPH_HEIGHT);
});

test('defineGlyph: evens out the strokes, and refuses a glyph that has no strokes, cannot be traced, or does not fit its box', () => {
  const g = defineGlyph({ id: 'bar', char: 'bar', w: 100, strokes: [line(10, 50, 90, 50)] });
  assert.equal(g.strokes.length, 1);
  assert.ok(g.strokes[0].length > 20);
  assert.ok(Object.isFrozen(g) && Object.isFrozen(g.strokes));
  assert.equal(g.guide, 'four-line');
  assert.equal(codeOf(() => defineGlyph({ id: 'x', char: 'x', w: 100, strokes: [] })), 'BAD_GLYPH');
  assert.equal(codeOf(() => defineGlyph({ id: 'x', char: 'x', w: 100, strokes: [[[5, 5], [5, 5]]] })), 'BAD_GLYPH', 'a stroke with no length');
  assert.equal(codeOf(() => defineGlyph({ id: 'x', char: 'x', w: 100, strokes: [line(10, 50, 150, 50)] })), 'BAD_GLYPH', 'sticks out of the side');
  assert.equal(codeOf(() => defineGlyph({ id: 'x', char: 'x', w: 100, strokes: [line(10, 50, 10, 400)] })), 'BAD_GLYPH', 'goes below the box');
  assert.equal(codeOf(() => defineGlyph({ id: 'x', char: 'x', w: 100, strokes: [line(-30, 50, 10, 50)] })), 'BAD_GLYPH');
});

// ---- the glyphs -------------------------------------------------------------------------------

test('the sets have what the spec asks for: strokes, digits, A to Z, a to z, Devanagari letters and words', () => {
  assert.equal(STROKES.length, 12);
  assert.deepEqual(NUMBERS.map((g) => g.char), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(CAPITALS.map((g) => g.char).join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  assert.deepEqual(SMALLS.map((g) => g.char).join(''), 'abcdefghijklmnopqrstuvwxyz');
  assert.ok(LETTERS.length >= 30, 'the consonants and some vowels');
  assert.deepEqual(SET_IDS, ['strokes', 'numbers', 'capitals', 'small', 'devanagari', 'words-en', 'words-dev']);
  for (const id of SET_IDS) {
    const set = SETS[id];
    assert.ok(set.label && set.icon && set.blurb && set.glyphs.length >= 10, id);
    assert.equal(new Set(set.glyphs.map((g) => g.id)).size, set.glyphs.length, `${id}: every glyph has its own id`);
  }
});

test('every glyph is well formed: strokes of a real length, inside the box, a sensible number of them, none starting on top of another', () => {
  for (const [id, set] of Object.entries(SETS)) {
    for (const glyph of set.glyphs) {
      const where = `${id}/${glyph.id}`;
      assert.ok(glyph.strokes.length >= 1 && glyph.strokes.length <= (id.startsWith('words') ? 20 : 8), `${where}: ${glyph.strokes.length} strokes`);
      assert.equal(glyph.guide, set.guide, where);
      const box = bounds(glyph.strokes);
      assert.ok(box.x0 >= -6 && box.x1 <= glyph.w + 6 && box.y0 >= -6 && box.y1 <= GLYPH_HEIGHT, `${where}: in its box`);
      for (const stroke of glyph.strokes) {
        assert.ok(stroke.length >= 3, `${where}: points`);
        // A dot is a tiny circle; everything else is a real stroke.
        assert.ok(pathLength(stroke) >= 20, `${where}: a stroke of length ${pathLength(stroke)}`);
        for (let i = 1; i < stroke.length - 1; i++) assert.ok(dist(stroke[i - 1], stroke[i]) <= SPACING + 1e-6, `${where}: even points`);
      }
      // Two strokes may begin on the same spot (the stem and the bowl of B both start at the top), but then they must set off in
      // clearly different directions, so that which one the child is writing can be told from the way the pencil goes.
      glyph.strokes.forEach((a, i) => glyph.strokes.slice(i + 1).forEach((b, j) => {
        if (dist(a[0], b[0]) > 3) return;
        const turn = Math.abs(((heading(a) - heading(b) + 540) % 360) - 180);
        assert.ok(turn >= 25, `${where}: strokes ${i + 1} and ${i + j + 2} start together and head the same way (${Math.round(turn)} degrees apart)`);
      }));
    }
  }
});

test('every glyph can be written by following its strokes in order (exactly, and a little off to each side)', () => {
  for (const [id, set] of Object.entries(SETS)) {
    for (const glyph of set.glyphs) {
      const exact = write(glyph, 9);
      assert.ok(exact.score >= 0.97, `${id}/${glyph.id}: exact score ${exact.score}`);
      assert.deepEqual([exact.orderMistakes, exact.directionMistakes], [0, 0]);
      const wobbly = write(glyph, 11, 5);
      assert.ok(wobbly.score >= 0.8, `${id}/${glyph.id}: a pencil 5 units off the path scores ${wobbly.score}`);
    }
  }
});

test('capital letters are tall, small letters sit on the baseline, and tall and hanging letters reach the right lines', () => {
  const top = (g) => bounds(g.strokes).y0;
  const bottom = (g) => bounds(g.strokes).y1;
  for (const g of CAPITALS) {
    assert.ok(top(g) <= RULES.cap + 1, `${g.id} reaches the cap line`);
    assert.ok(bottom(g) >= RULES.baseline - 5 && bottom(g) <= RULES.baseline + 6, `${g.id} stands on the baseline`);
  }
  for (const g of SMALLS) {
    const tall = 'bdfhklt'.includes(g.id);
    const dotted = 'ij'.includes(g.id);
    const hangs = 'gjpqy'.includes(g.id);
    // Tall letters reach up to the cap line (t a little short of it), letters with a dot have it between, the rest start at the x-height.
    const [low, high] = tall ? [RULES.cap - 1, 36] : dotted ? [30, 44] : [RULES.xHeight - 14, RULES.xHeight + 4];
    assert.ok(top(g) >= low && top(g) <= high, `${g.id} top ${top(g)} is not between ${low} and ${high}`);
    assert.ok(hangs ? bottom(g) > RULES.baseline + 20 : bottom(g) <= RULES.baseline + 6, `${g.id} bottom ${bottom(g)}`);
  }
  assert.ok(bounds(SMALLS.find((g) => g.id === 'o').strokes).y0 >= RULES.xHeight - 4, 'o is an x-height letter');
});

test('letters that need two parts have them: i and j have a dot, t and f a crossbar, A has a bar', () => {
  const count = (list, id) => list.find((g) => g.id === id).strokes.length;
  assert.deepEqual(['i', 'j', 't', 'f', 'k', 'x'].map((id) => count(SMALLS, id)), [2, 2, 2, 2, 3, 2]);
  assert.deepEqual(['A', 'E', 'H', 'T', 'I', 'O'].map((id) => count(CAPITALS, id)), [3, 4, 3, 2, 1, 1]);
  assert.deepEqual(['0', '1', '4', '5', '9'].map((id) => count(NUMBERS, id)), [1, 1, 2, 2, 2]);
});

test('numbers and letters are written the way they are taught: the first stroke starts at the top for the upright letters', () => {
  for (const id of ['E', 'F', 'H', 'I', 'K', 'L', 'M', 'N', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']) {
    const g = CAPITALS.find((c) => c.id === id);
    assert.ok(g.strokes[0][0][1] <= RULES.cap + 2 || id === 'M' || id === 'N', `${id} starts at the top (${g.strokes[0][0][1]})`);
  }
  assert.ok(NUMBERS[0].strokes[0][0][1] <= RULES.cap + 2, '0 starts at the top');
});

// ---- Devanagari -------------------------------------------------------------------------------

test('Devanagari: consonants and vowels, each written left to right and the headline last', () => {
  assert.ok(LETTERS.length === SINGLE_LETTERS.length);
  assert.deepEqual(LETTERS.slice(0, 5).map((l) => l.char), ['क', 'ख', 'ग', 'घ', 'च']);
  for (const letter of LETTERS) {
    const strokes = writeStrokes(letter);
    if (letter.headline) {
      const last = strokes.at(-1);
      assert.ok(last.every((p) => p[1] === RULES.headline), `${letter.id}: the headline is a level line at the headline height`);
      assert.ok(last.at(-1)[0] - last[0][0] > 30, `${letter.id}: it reaches across the letter`);
      assert.ok(last.length > 10, `${letter.id}: the headline is evened out like every stroke, so it can be traced`);
      assert.equal(strokes.length, letter.body.length + 1);
    } else {
      assert.equal(strokes.length, letter.body.length, `${letter.id} has no headline`);
    }
    assert.equal(letter.guide, 'headline');
  }
  assert.equal(letterById('ka').char, 'क');
  assert.equal(codeOf(() => letterById('zz')), 'UNKNOWN_GLYPH');
  assert.deepEqual(AA_SIGN.stroke[0], [11, RULES.headline]);
});

test('Devanagari: the stems of consonants start at the headline, as they are written hanging from it', () => {
  const ga = letterById('ga');
  const stem = [...ga.body].sort((a, b) => pathLength(b) - pathLength(a))[0];
  assert.ok(Math.abs(stem[0][0] - stem.at(-1)[0]) < 2, 'ग has an upright stem');
  assert.equal(stem[0][1], RULES.headline);
  assert.ok(stem.at(-1)[1] >= RULES.baseline - 4);
});

// ---- words ------------------------------------------------------------------------------------

test('English words: each is its letters side by side, written letter by letter on the four lines', () => {
  const cat = layoutEnglish('cat');
  const strokeCount = ['c', 'a', 't'].reduce((sum, c) => sum + SMALLS.find((g) => g.id === c).strokes.length, 0);
  assert.equal(cat.strokes.length, strokeCount);
  assert.equal(cat.guide, 'four-line');
  const widths = ['c', 'a', 't'].reduce((sum, c) => sum + SMALLS.find((g) => g.id === c).w - 4, 4);
  assert.equal(cat.w, widths);
  const firstA = cat.strokes[1][0];
  assert.ok(firstA[0] > SMALLS.find((g) => g.id === 'c').w - 10, 'the second letter is to the right of the first');
  assert.equal(codeOf(() => layoutEnglish('c@t')), 'UNKNOWN_GLYPH');
  assert.equal(ENGLISH_WORD_GLYPHS.length, ENGLISH_WORDS.length);
  assert.ok(ENGLISH_WORDS.every((w) => w === w.toLowerCase() && w.length >= 3 && w.length <= 4));
});

test('Devanagari words: letters left to right, a ा after its letter, and one headline across the whole word, last', () => {
  const kamal = layoutDevanagari('कमल');
  const parts = ['ka', 'ma', 'la'].map((id) => letterById(id).body.length);
  assert.equal(kamal.strokes.length, parts.reduce((a, b) => a + b, 0) + 1);
  const headline = kamal.strokes.at(-1);
  assert.ok(headline.every((p) => p[1] === RULES.headline));
  assert.ok(headline.at(-1)[0] - headline[0][0] > 100, 'one long line across three letters');
  assert.equal(kamal.guide, 'headline');
  const kaa = layoutDevanagari('का');
  assert.equal(kaa.strokes.length, letterById('ka').body.length + 2, 'the letter, the stem of ा, the headline');
  const stem = kaa.strokes.at(-2);
  assert.equal(stem[0][1], RULES.headline, 'the stem hangs from the headline');
  assert.ok(stem[0][0] > letterById('ka').w, 'to the right of the letter');
  assert.ok(kaa.strokes.at(-1).at(-1)[0] >= stem[0][0] - 1, 'and the headline reaches it');
  assert.equal(codeOf(() => layoutDevanagari('ाक')), 'UNKNOWN_GLYPH', 'ा needs a letter in front of it');
  assert.equal(codeOf(() => layoutDevanagari('abc')), 'UNKNOWN_GLYPH');
  assert.equal(codeOf(() => layoutDevanagari('')), 'UNKNOWN_GLYPH');
  assert.equal(DEVANAGARI_WORD_GLYPHS.length, DEVANAGARI_WORDS.length);
  assert.ok(DEVANAGARI_WORDS.some((w) => w.length === 2 && w.endsWith('ा')), 'joined syllables');
  assert.ok(DEVANAGARI_WORDS.some((w) => w.length >= 3), 'and short words');
});

test('every word is a glyph that fits the writing area and is not too wide to show on a phone', () => {
  for (const g of [...ENGLISH_WORD_GLYPHS, ...DEVANAGARI_WORD_GLYPHS]) assert.ok(g.w <= 340, `${g.id} is ${g.w} wide`);
});

// ---- levels and rounds ------------------------------------------------------------------------

test('levels: strokes and numbers, then letters, then words; the pencil is forgiven less as the levels go up', () => {
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].setIds), [['strokes', 'numbers'], ['capitals', 'small', 'devanagari'], ['words-en', 'words-dev']]);
  assert.ok(LEVELS.easy.tolerance > LEVELS.medium.tolerance && LEVELS.medium.tolerance > LEVELS.hard.tolerance);
  assert.ok(LEVEL_IDS.every((id) => LEVELS[id].setIds.every((s) => SETS[s])));
  assert.ok(LEVEL_IDS.every((id) => LEVELS[id].tolerance >= 9 && LEVELS[id].perRound >= 3));
  assert.throws(() => { LEVELS.easy.tolerance = 1; }, TypeError);
  assert.equal(roundKey('capitals'), 'trace-capitals');
});

test('pickGlyphs: different glyphs from the set, the same for the same seed', () => {
  const picks = pickGlyphs('capitals', 5, createRng(3));
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map((g) => g.id)).size, 5);
  assert.deepEqual(pickGlyphs('capitals', 5, createRng(3)).map((g) => g.id), picks.map((g) => g.id));
  assert.notDeepEqual(pickGlyphs('capitals', 5, createRng(4)).map((g) => g.id), picks.map((g) => g.id));
  assert.equal(pickGlyphs('strokes', 99, createRng(1)).length, 12, 'never more than there are');
  assert.equal(codeOf(() => pickGlyphs('emoji', 3, createRng(1))), 'UNKNOWN_SET');
});

test('stars: a careful glyph is 3, a fair one 2, and a round is the average with a half rounded up', () => {
  assert.deepEqual([1, 0.9, 0.89, 0.7, 0.69, 0].map(glyphStars), [3, 3, 2, 2, 1, 1]);
  assert.equal(roundStars([]), 0);
  assert.equal(roundStars([{ stars: 3 }, { stars: 3 }, { stars: 3 }]), 3);
  assert.equal(roundStars([{ stars: 3 }, { stars: 2 }]), 3);
  assert.equal(roundStars([{ stars: 1 }, { stars: 2 }]), 2);
  assert.equal(roundStars([{ stars: 2 }, { stars: 1 }, { stars: 1 }]), 1);
});

test('effectiveTolerance: the level\'s width, or wider where the page is shrunk to fit a small screen', () => {
  assert.equal(effectiveTolerance(LEVELS.hard, 2), 9, 'plenty of room: the level decides');
  assert.equal(effectiveTolerance(LEVELS.hard, 1), MIN_TOLERANCE_PX, 'at one pixel a unit the path is 16 pixels wide');
  assert.ok(Math.abs(effectiveTolerance(LEVELS.hard, 0.5) * 0.5 - MIN_TOLERANCE_PX) < 1e-9, 'never narrower than 16 screen pixels');
  assert.equal(effectiveTolerance(LEVELS.easy, 0), 14, 'a page with no size yet uses the level');
});

test('worksheets: pages of rows, and a row has fewer copies when the glyph is wide', () => {
  const pages = paginate(CAPITALS, ROWS_PER_PAGE['four-line']);
  assert.equal(pages.length, Math.ceil(26 / ROWS_PER_PAGE['four-line']));
  assert.deepEqual(pages.flat().map((g) => g.id).join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  assert.ok(pages.slice(0, -1).every((p) => p.length === ROWS_PER_PAGE['four-line']));
  assert.deepEqual(paginate([], 5), []);
  assert.equal(codeOf(() => paginate([1], 0)), 'BAD_PAGE_SIZE');
  assert.equal(codeOf(() => paginate([1], 2.5)), 'BAD_PAGE_SIZE');
  assert.deepEqual(rowLayout({ w: 60 }), { dotted: 3, empty: 2 });
  assert.deepEqual(rowLayout({ w: 120 }), { dotted: 2, empty: 1 });
  assert.deepEqual(rowLayout({ w: 220 }), { dotted: 1, empty: 1 });
  for (const g of ENGLISH_WORD_GLYPHS) assert.ok(rowLayout(g).dotted >= 1);
});
