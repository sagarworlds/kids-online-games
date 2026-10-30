import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameError } from '../../src/engine/utils/errors.js';
import { createRng } from '../../src/engine/utils/random.js';
import { LEVELS, LEVEL_IDS, SCENES_PER_ROUND, HINTS_PER_ROUND, COOLDOWN_MS, SCENE_WIDTH, SCENE_HEIGHT } from '../../src/games/spot-the-difference/logic/levels.js';
import { hexToRgb, rgbToHex, hexToHsl, hslToHex, hueDistance, rgbDistance, shade, randomColor, differentColor } from '../../src/games/spot-the-difference/logic/color.js';
import { objectBox, boxesOverlap, unionBox, inflateBox, boxInBounds, boxContains, boxCentre } from '../../src/games/spot-the-difference/logic/geometry.js';
import { validateTemplates, validateTheme, shapeExtents, MIN_THEME_OBJECTS, MAX_THEME_OBJECTS } from '../../src/games/spot-the-difference/logic/templates.js';
import { buildScene, newObject, MAX_OBJECT_SIZE } from '../../src/games/spot-the-difference/logic/sceneBuilder.js';
import { fits, findFreeSpot, GAP, MARGIN } from '../../src/games/spot-the-difference/logic/placement.js';
import { MUTATIONS } from '../../src/games/spot-the-difference/logic/mutations/index.js';
import { RECOLOR_LIMITS, SUBTLE_LIMITS } from '../../src/games/spot-the-difference/logic/mutations/recolor.js';
import { MIN_MOVE, MAX_MOVE } from '../../src/games/spot-the-difference/logic/mutations/move.js';
import { MIN_TURN, MAX_TURN } from '../../src/games/spot-the-difference/logic/mutations/rotate.js';
import { makeDifferences } from '../../src/games/spot-the-difference/logic/differenceMaker.js';
import { generatePuzzle, diffScenes, MAX_PUZZLE_ATTEMPTS } from '../../src/games/spot-the-difference/logic/puzzle.js';
import { hitArea, findDifferenceAt, MIN_TAP_PX, HIT_PAD } from '../../src/games/spot-the-difference/logic/hitTest.js';
import {
  createPlay, createRound, puzzleSeed, tap, foundCount, isComplete, useHint, sceneStars, timeBonus, sceneScore, roundStars, isRoundOver,
} from '../../src/games/spot-the-difference/logic/round.js';
import { article, withArticle } from '../../src/games/spot-the-difference/logic/labels.js';

// ---- the real data ----------------------------------------------------------------------------

const GAME = new URL('../../src/games/spot-the-difference/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, GAME), 'utf8'));
const THEME_IDS = ['park', 'kitchen', 'beach', 'classroom', 'space'];
const templates = validateTemplates(readJson('data/objects.json'));
const themes = new Map(THEME_IDS.map((id) => [id, validateTheme(readJson(`data/themes/${id}.json`), templates, `themes/${id}.json`)]));
const BOUNDS = { w: SCENE_WIDTH, h: SCENE_HEIGHT };

/** The code of the error thrown by `fn`, so a test can check what went wrong and not only that something did. */
function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GameError, `expected a GameError but got ${error}`);
    return error.code;
  }
  return null;
}

test('the data: at least 60 object shapes and 5 themes, each theme with 20 to 30 of them', () => {
  assert.ok(templates.size >= 60, `only ${templates.size} templates`);
  assert.equal(themes.size, 5);
  for (const [id, theme] of themes) {
    assert.ok(theme.objects.length >= MIN_THEME_OBJECTS && theme.objects.length <= MAX_THEME_OBJECTS, `${id} has ${theme.objects.length}`);
    assert.ok(theme.objects.length >= LEVELS.hard.objects + 2, `${id} needs room to add things at the hardest level`);
  }
});

test('the data: every template is used by a theme, and drawn only with colours and numbers', () => {
  const used = new Set([...themes.values()].flatMap((t) => t.objects));
  for (const id of templates.keys()) assert.ok(used.has(id), `${id} is not in any theme`);
  const text = readFileSync(new URL('data/objects.json', GAME), 'utf8');
  assert.ok(!/https?:|data:|<script|<image/i.test(text), 'drawings must not load anything');
});

test('the data: names read well in a sentence ("The cat moved")', () => {
  for (const t of templates.values()) assert.match(t.name, /^[a-z]+( [a-z]+)?$/, t.id);
});

// ---- checking the data ------------------------------------------------------------------------

const goodTemplate = () => ({ id: 'box', name: 'box', w: 60, h: 60, shapes: [{ k: 'rect', x: -25, y: -25, w: 50, h: 50, fill: '$', stroke: '#222222', sw: 2 }] });
const check = (change) => codeOf(() => { const t = goodTemplate(); change(t); validateTemplates({ templates: [t] }); });

test('template checks: a good one passes and bad ones are explained', () => {
  assert.equal(check(() => {}), null);
  assert.equal(codeOf(() => validateTemplates({})), 'INVALID_DATA');
  assert.equal(codeOf(() => validateTemplates({ templates: [] })), 'INVALID_DATA');
  assert.equal(check((t) => { t.id = 'Bad Id'; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.name = ''; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.shapes = []; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.shapes[0].k = 'star'; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.shapes[0].fill = 'red'; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.shapes[0].w = 'wide'; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.shapes[0].sw = -1; }), 'INVALID_DATA');
  assert.equal(check((t) => { t.w = 30; t.h = 30; }), 'INVALID_DATA', 'too small to spot');
  assert.equal(check((t) => { t.w = 200; t.h = 200; }), 'INVALID_DATA', 'too big to place');
  assert.equal(check((t) => { t.w = 20; }), 'INVALID_DATA', 'the drawing sticks out of its box');
  assert.equal(check((t) => { t.shapes[0].fill = '#aa0000'; }), 'INVALID_DATA', 'nothing can change colour');
  assert.equal(check((t) => { t.shapes.push({ k: 'path', d: 'M 0 0 A 5 5 0 0 1 10 10', stroke: '#222222' }); }), 'INVALID_DATA', 'arcs are not allowed');
  assert.equal(check((t) => { t.asymmetric = 'yes'; }), 'INVALID_DATA');
  assert.equal(codeOf(() => validateTemplates({ templates: [goodTemplate(), goodTemplate()] })), 'INVALID_DATA', 'the same id twice');
});

test('template checks: a shape that is only a thin line cannot be the part that changes colour', () => {
  assert.equal(check((t) => { t.shapes[0] = { k: 'rect', x: -25, y: -2, w: 50, h: 4, fill: '$' }; }), 'INVALID_DATA');
});

test('shapeExtents covers turned shapes and half of each outline', () => {
  const plain = shapeExtents([{ k: 'rect', x: -10, y: -5, w: 20, h: 10, sw: 2 }]);
  assert.deepEqual(plain, { x0: -11, x1: 11, y0: -6, y1: 6 });
  const turned = shapeExtents([{ k: 'rect', x: -10, y: -5, w: 20, h: 10, rot: 90 }]);
  assert.ok(turned.y1 - turned.y0 >= 19.9, 'a rectangle turned a quarter turn is as tall as it was wide');
});

const themeData = (over = {}) => ({
  id: 'zoo', name: 'Zoo', icon: '🦁', background: [{ k: 'rect', x: 0, y: 0, w: 800, h: 500, fill: '#aaddff' }],
  objects: [...themes.get('park').objects], ...over,
});
const checkTheme = (over) => codeOf(() => validateTheme(themeData(over), templates, 'themes/zoo.json'));

test('theme checks: a good one passes and bad ones are explained', () => {
  assert.equal(checkTheme({}), null);
  assert.equal(checkTheme({ id: 'Zoo!' }), 'INVALID_DATA');
  assert.equal(checkTheme({ name: '' }), 'INVALID_DATA');
  assert.equal(checkTheme({ background: [] }), 'INVALID_DATA');
  assert.equal(checkTheme({ background: [{ k: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '$' }] }), 'INVALID_DATA', 'a background cannot use object colours');
  assert.equal(checkTheme({ objects: themes.get('park').objects.slice(0, 10) }), 'INVALID_DATA', 'too few');
  assert.equal(checkTheme({ objects: [...themes.get('park').objects, ...themes.get('beach').objects] }), 'INVALID_DATA', 'repeats or too many');
  assert.equal(checkTheme({ objects: [...themes.get('park').objects.slice(1), 'unicorn'] }), 'INVALID_DATA', 'unknown object');
  const symmetric = [...templates.values()].filter((t) => !t.asymmetric).map((t) => t.id).slice(0, 22);
  assert.equal(checkTheme({ objects: symmetric }), 'INVALID_DATA', 'no object can be flipped');
});

// ---- colours ----------------------------------------------------------------------------------

test('colour maths: hex and RGB round-trip, hue distance wraps round', () => {
  assert.deepEqual(hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 });
  assert.equal(rgbToHex({ r: 255, g: 128, b: 0 }), '#ff8000');
  assert.equal(rgbToHex({ r: 300, g: -5, b: 0.4 }), '#ff0000', 'out of range values are held in range');
  assert.equal(hueDistance(350, 10), 20);
  assert.equal(hueDistance(0, 180), 180);
  assert.equal(hueDistance(90, 90), 0);
  assert.ok(Math.abs(rgbDistance('#000000', '#ffffff') - 441.67) < 0.1);
  for (const hex of ['#e53935', '#2196f3', '#4caf50', '#808080']) {
    const hsl = hexToHsl(hex);
    assert.ok(rgbDistance(hex, hslToHex(hsl)) < 4, `${hex} round-trips`);
  }
});

test('colour maths: bad colours are refused with a clear error', () => {
  for (const bad of ['red', '#abc', '#gggggg', '', null, undefined, 12]) assert.equal(codeOf(() => hexToRgb(bad)), 'BAD_COLOR', String(bad));
});

test('shade makes a darker or a lighter version of a colour', () => {
  assert.ok(hexToHsl(shade('#e53935', 'd')).l < hexToHsl('#e53935').l);
  assert.ok(hexToHsl(shade('#e53935', 'l')).l > hexToHsl('#e53935').l);
});

test('randomColor is always a clear colour that shows on every background', () => {
  const rng = createRng(3);
  for (let i = 0; i < 500; i++) {
    const { s, l } = hexToHsl(randomColor(rng));
    assert.ok(s >= 45 && l >= 35 && l <= 70, `s ${s} l ${l}`);
  }
});

test('differentColor: always clearly different, whatever the starting colour', () => {
  const rng = createRng(8);
  for (const limits of [RECOLOR_LIMITS, SUBTLE_LIMITS]) {
    for (let i = 0; i < 500; i++) {
      const from = randomColor(rng);
      const to = differentColor(from, rng, limits);
      assert.ok(hueDistance(hexToHsl(from).h, hexToHsl(to).h) >= limits.minHue - 3, `${from} -> ${to}`);
      assert.ok(rgbDistance(from, to) >= limits.minRgb, `${from} -> ${to} too close in RGB`);
    }
  }
});

// ---- geometry ---------------------------------------------------------------------------------

test('objectBox: size, scale and turning', () => {
  const t = { w: 100, h: 40 };
  const flat = objectBox({ x: 200, y: 100, scale: 1, rotation: 0 }, t);
  assert.deepEqual(flat, { x: 150, y: 80, w: 100, h: 40 });
  const big = objectBox({ x: 200, y: 100, scale: 2, rotation: 0 }, t);
  assert.deepEqual([big.w, big.h], [200, 80]);
  const upright = objectBox({ x: 200, y: 100, scale: 1, rotation: 90 }, t);
  assert.ok(Math.abs(upright.w - 40) < 1e-9 && Math.abs(upright.h - 100) < 1e-9, 'a quarter turn swaps width and height');
  const tilted = objectBox({ x: 0, y: 0, scale: 1, rotation: 45 }, t);
  assert.ok(Math.abs(tilted.w - 98.995) < 0.01 && Math.abs(tilted.h - 98.995) < 0.01, 'half the width and half the height, both slanted');
  assert.deepEqual(boxCentre(tilted), { x: 0, y: 0 }, 'it turns about its centre');
});

test('box helpers: overlap with a gap, union, inflate, bounds, contains', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(boxesOverlap(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(boxesOverlap(a, { x: 10, y: 0, w: 10, h: 10 }), false, 'touching is not overlapping');
  assert.equal(boxesOverlap(a, { x: 14, y: 0, w: 10, h: 10 }, 5), true, 'closer than the gap');
  assert.equal(boxesOverlap(a, { x: 14, y: 0, w: 10, h: 10 }, 4), false);
  assert.deepEqual(unionBox(a, { x: 20, y: 5, w: 5, h: 20 }), { x: 0, y: 0, w: 25, h: 25 });
  assert.deepEqual(inflateBox(a, 3), { x: -3, y: -3, w: 16, h: 16 });
  assert.equal(boxInBounds(a, { w: 10, h: 10 }), true);
  assert.equal(boxInBounds(a, { w: 10, h: 10 }, 1), false);
  assert.equal(boxContains(a, { x: 10, y: 10 }), true, 'the edge counts');
  assert.equal(boxContains(a, { x: 10.1, y: 5 }), false);
});

// ---- building a picture -----------------------------------------------------------------------

test('newObject: a different size, tilt and colour each time, never bigger than the cap', () => {
  const rng = createRng(2);
  const seen = new Set();
  for (const t of templates.values()) {
    const o = newObject('o1', t, rng);
    assert.ok(o.scale >= 0.84 && o.scale <= 1.1, `${t.id} scale ${o.scale}`);
    assert.ok(Math.max(t.w, t.h) * o.scale <= MAX_OBJECT_SIZE + 0.5, `${t.id} is too big`);
    assert.ok(Math.abs(o.rotation) <= 8);
    assert.equal(o.flip, false);
    seen.add(o.color);
  }
  assert.ok(seen.size > 30, 'colours vary');
});

test('buildScene: the right number of different objects, inside the picture, none touching', () => {
  for (const [themeId, theme] of themes) {
    for (const count of [12, 15, 18]) {
      const scene = buildScene({ theme, templates, count, rng: createRng(count * 31), bounds: BOUNDS });
      assert.equal(scene.length, count);
      assert.equal(new Set(scene.map((o) => o.template)).size, count, `${themeId}: every object is a different thing`);
      assert.equal(new Set(scene.map((o) => o.id)).size, count);
      assert.deepEqual(scene.map((o) => o.id), scene.map((_, i) => `o${i + 1}`), 'ids follow the order made');
      scene.forEach((o) => {
        assert.ok(theme.objects.includes(o.template));
        assert.ok(boxInBounds(objectBox(o, templates.get(o.template)), BOUNDS, MARGIN), `${themeId}/${o.template} is out of the picture`);
      });
      for (let i = 0; i < scene.length; i++) {
        for (let j = i + 1; j < scene.length; j++) {
          assert.ok(!boxesOverlap(objectBox(scene[i], templates.get(scene[i].template)), objectBox(scene[j], templates.get(scene[j].template)), GAP - 0.01), `${scene[i].template} touches ${scene[j].template}`);
        }
      }
    }
  }
});

test('buildScene: errors say what went wrong', () => {
  const theme = themes.get('park');
  assert.equal(codeOf(() => buildScene({ theme, templates, count: theme.objects.length + 1, rng: createRng(1), bounds: BOUNDS })), 'BAD_SCENE');
  assert.equal(codeOf(() => buildScene({ theme, templates, count: 18, rng: createRng(1), bounds: { w: 200, h: 120 } })), 'SCENE_CROWDED');
});

test('placement: fits checks the edge and the neighbours; findFreeSpot gives up instead of looping', () => {
  const t = new Map([['a', { id: 'a', w: 60, h: 60 }]]);
  const o = (id, x, y) => ({ id, template: 'a', x, y, scale: 1, color: '#e53935', flip: false, rotation: 0 });
  assert.equal(fits(o('x', 100, 100), [], t, BOUNDS), true);
  assert.equal(fits(o('x', 10, 100), [], t, BOUNDS), false, 'over the edge');
  assert.equal(fits(o('x', 100, 100), [o('y', 150, 100)], t, BOUNDS), false, 'too close');
  assert.equal(fits(o('x', 100, 100), [o('y', 100 + 60 + GAP + 1, 100)], t, BOUNDS), true, 'just clear');
  assert.equal(fits(o('x', 100, 100), [o('x', 100, 100)], t, BOUNDS), true, 'an object does not block itself');
  assert.equal(findFreeSpot(o('x', 0, 0), [], t, { w: 50, h: 50 }, createRng(1), 10), null, 'too big for the picture');
  const spot = findFreeSpot(o('x', 0, 0), [], t, BOUNDS, createRng(1), 10);
  assert.ok(spot && fits(spot, [], t, BOUNDS));
  const full = [o('a1', 50, 50)];
  assert.equal(findFreeSpot(o('x', 0, 0), full, t, { w: 100, h: 100 }, createRng(1), 50), null, 'no room left');
});

// ---- the kinds of difference ------------------------------------------------------------------

const small = new Map([
  ['ball', { id: 'ball', name: 'ball', w: 60, h: 60, noRotate: true }],
  ['bird', { id: 'bird', name: 'bird', w: 70, h: 50, asymmetric: true }],
  ['apple', { id: 'apple', name: 'apple', w: 50, h: 50 }],
  ['tiny', { id: 'tiny', name: 'tiny', w: 44, h: 44 }],
]);
const thing = (id, template, x, y, extra = {}) => ({ id, template, x, y, scale: 1, color: '#e53935', flip: false, rotation: 0, ...extra });
const theme4 = { id: 'mini', objects: ['ball', 'bird', 'apple', 'tiny'] };
const ctxFor = (target, scene, over = {}) => ({
  rng: createRng(4), templates: small, theme: theme4, usedTemplates: new Set(scene.map((o) => o.template)),
  others: scene.filter((o) => o !== target), bounds: BOUNDS, nextId: () => 'o99', ...over,
});

test('the mutations are all in the table and say what they are', () => {
  assert.deepEqual(Object.keys(MUTATIONS).sort(), ['add', 'flip', 'move', 'recolor', 'remove', 'resize', 'rotate', 'subtle-recolor']);
  for (const [id, m] of Object.entries(MUTATIONS)) {
    assert.equal(m.id, id);
    assert.ok(['recolor', 'remove', 'add', 'resize', 'flip', 'move', 'rotate'].includes(m.type), id);
    assert.ok(['object', 'scene'].includes(m.targetKind));
  }
  for (const level of Object.values(LEVELS)) for (const id of level.mutations) assert.ok(MUTATIONS[id], `${level.id} uses unknown "${id}"`);
});

test('levels: each level builds on the one before', () => {
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].differences), [3, 5, 7]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].objects), [12, 15, 18]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].targetSeconds), [60, 90, 120]);
  for (let i = 1; i < LEVEL_IDS.length; i++) {
    const before = LEVELS[LEVEL_IDS[i - 1]].mutations;
    assert.ok(before.every((m) => LEVELS[LEVEL_IDS[i]].mutations.includes(m)));
    assert.ok(LEVELS[LEVEL_IDS[i]].mutations.length > before.length);
  }
  assert.throws(() => { LEVELS.easy.differences = 9; }, TypeError, 'levels cannot be changed by accident');
});

test('recolor: a new colour that is clearly different, and says so', () => {
  const o = thing('o1', 'ball', 200, 200, { color: '#2196f3' });
  for (const id of ['recolor', 'subtle-recolor']) {
    const limits = id === 'recolor' ? RECOLOR_LIMITS : SUBTLE_LIMITS;
    const r = MUTATIONS[id].apply(o, ctxFor(o, [o]));
    assert.equal(r.label, 'The ball changed colour');
    assert.ok(hueDistance(hexToHsl(r.replace.color).h, hexToHsl(o.color).h) >= limits.minHue - 3);
    assert.deepEqual(r.box, objectBox(o, small.get('ball')));
    assert.equal(r.replace.x, o.x);
    assert.equal(MUTATIONS[id].type, 'recolor');
  }
});

test('remove: the object is gone and the place to look is where it was', () => {
  const o = thing('o1', 'apple', 300, 120);
  const r = MUTATIONS.remove.apply(o, ctxFor(o, [o]));
  assert.equal(r.replace, null);
  assert.equal(r.label, 'The apple is missing');
  assert.deepEqual(r.box, objectBox(o, small.get('apple')));
});

test('add: a new kind of thing, in free space, with a or an in front', () => {
  const scene = [thing('o1', 'ball', 100, 100), thing('o2', 'bird', 300, 100)];
  const ctx = ctxFor(null, scene, { others: scene });
  assert.equal(MUTATIONS.add.canApply(null, ctx), true);
  const r = MUTATIONS.add.apply(null, ctx);
  assert.equal(r.add.id, 'o99');
  assert.ok(['apple', 'tiny'].includes(r.add.template), 'not one that is already there');
  assert.ok(fits(r.add, scene, small, BOUNDS));
  assert.equal(r.label, r.add.template === 'apple' ? 'An apple was added' : 'A tiny was added');
  assert.deepEqual(r.box, objectBox(r.add, small.get(r.add.template)));
  const allUsed = { ...ctx, usedTemplates: new Set(['ball', 'bird', 'apple', 'tiny']) };
  assert.equal(MUTATIONS.add.canApply(null, allUsed), false, 'nothing new to add');
});

test('add: gives up when there is no room, without looping', () => {
  const scene = [thing('o1', 'ball', 100, 100)];
  const r = MUTATIONS.add.apply(null, ctxFor(null, scene, { others: scene, bounds: { w: 70, h: 70 } }));
  assert.equal(r, null);
});

test('resize: 30% bigger or smaller, only where it still fits', () => {
  const o = thing('o1', 'ball', 400, 250);
  const sizes = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const r = MUTATIONS.resize.apply(o, ctxFor(o, [o], { rng: createRng(seed) }));
    sizes.add(Math.round((r.replace.scale / o.scale) * 100) / 100);
    assert.match(r.label, /^The ball got (bigger|smaller)$/);
  }
  assert.deepEqual([...sizes].sort(), [0.7, 1.3]);
});

test('resize: will not make something too small to see, nor push it into a neighbour', () => {
  const tiny = thing('o1', 'tiny', 400, 250, { scale: 0.85 });
  // Its left edge is 14 clear of the little one now, but only 9 clear once the little one has grown.
  const neighbour = thing('o2', 'ball', 463, 250);
  for (let seed = 1; seed < 20; seed++) {
    assert.equal(MUTATIONS.resize.apply(tiny, ctxFor(tiny, [tiny, neighbour], { rng: createRng(seed) })), null, 'shrinking would leave it under 36 and growing would touch the ball');
  }
});

test('flip: only for things that look different the other way round', () => {
  const bird = thing('o1', 'bird', 200, 200);
  const ball = thing('o2', 'ball', 400, 200);
  assert.equal(MUTATIONS.flip.canApply(bird, ctxFor(bird, [bird])), true);
  assert.equal(MUTATIONS.flip.canApply(ball, ctxFor(ball, [ball])), false);
  const r = MUTATIONS.flip.apply(bird, ctxFor(bird, [bird]));
  assert.equal(r.replace.flip, true);
  assert.equal(MUTATIONS.flip.apply(r.replace, ctxFor(r.replace, [r.replace])).replace.flip, false, 'flipping back');
  assert.equal(r.label, 'The bird faces the other way');
});

test('move: a clear distance, still inside and clear of the others', () => {
  const o = thing('o1', 'apple', 400, 250);
  const other = thing('o2', 'ball', 150, 250);
  for (let seed = 1; seed < 60; seed++) {
    const r = MUTATIONS.move.apply(o, ctxFor(o, [o, other], { rng: createRng(seed) }));
    const d = Math.hypot(r.replace.x - o.x, r.replace.y - o.y);
    assert.ok(d >= MIN_MOVE - 1e-9 && d <= MAX_MOVE + 1e-9, `moved ${d}`);
    assert.ok(fits(r.replace, [other], small, BOUNDS));
    assert.equal(r.label, 'The apple moved');
    const before = objectBox(o, small.get('apple'));
    const after = objectBox(r.replace, small.get('apple'));
    assert.deepEqual(r.box, unionBox(before, after), 'look at the old and the new place');
  }
  assert.equal(MUTATIONS.move.apply(o, ctxFor(o, [o], { bounds: { w: 80, h: 80 }, rng: createRng(1) })), null, 'no room to move');
});

test('rotate: turns by a clear angle, never for round things', () => {
  const bird = thing('o1', 'bird', 400, 250, { rotation: 5 });
  const ball = thing('o2', 'ball', 100, 100);
  assert.equal(MUTATIONS.rotate.canApply(ball, ctxFor(ball, [ball])), false);
  assert.equal(MUTATIONS.rotate.canApply(bird, ctxFor(bird, [bird])), true);
  for (let seed = 1; seed < 60; seed++) {
    const r = MUTATIONS.rotate.apply(bird, ctxFor(bird, [bird], { rng: createRng(seed) }));
    const turned = Math.abs(r.replace.rotation - bird.rotation);
    assert.ok(turned >= MIN_TURN && turned <= MAX_TURN + 0.1, `turned ${turned}`);
    assert.equal(r.label, 'The bird turned');
  }
});

test('labels use a and an', () => {
  assert.equal(article('apple'), 'an');
  assert.equal(article('umbrella'), 'an');
  assert.equal(article('cat'), 'a');
  assert.equal(withArticle('orange'), 'An orange');
  assert.equal(withArticle('kite'), 'A kite');
});

// ---- making the differences -------------------------------------------------------------------

test('makeDifferences: errors when a difference cannot be made', () => {
  const theme = { id: 'mini', objects: ['ball', 'apple', 'tiny', 'bird'] };
  const left = [thing('o1', 'ball', 200, 200), thing('o2', 'apple', 500, 200)];
  assert.equal(codeOf(() => makeDifferences({ left, templates: small, theme, mutations: ['flip'], count: 1, rng: createRng(1), bounds: BOUNDS })), 'DIFFERENCES_FAILED', 'nothing in the picture can be flipped');
  assert.equal(codeOf(() => makeDifferences({ left, templates: small, theme, mutations: ['recolor'], count: 3, rng: createRng(1), bounds: BOUNDS })), 'DIFFERENCES_FAILED', 'more differences than objects');
});

test('makeDifferences: kinds are used in turn so a picture is never all one kind', () => {
  const theme = themes.get('park');
  const rng = createRng(11);
  const left = buildScene({ theme, templates, count: 15, rng, bounds: BOUNDS });
  const { differences } = makeDifferences({ left, templates, theme, mutations: LEVELS.medium.mutations, count: 5, rng, bounds: BOUNDS });
  assert.equal(new Set(differences.map((d) => d.mutation)).size, 5, 'five differences, five kinds');
});

// ---- whole puzzles ----------------------------------------------------------------------------

/** What a child needs to be true of a puzzle, checked without trusting how it was made. */
function assertGoodPuzzle(p, level, label) {
  const info = diffScenes(p.left, p.right);
  assert.equal(info.length, level.differences, `${label}: exactly ${level.differences} differences, found ${info.length}`);
  assert.equal(p.differences.length, level.differences);
  assert.deepEqual(info.map((d) => d.id).sort(), p.differences.map((d) => d.objectId).sort(), `${label}: the listed differences are the real ones`);
  for (const found of info) {
    assert.equal(found.kinds.length, 1, `${label}: ${found.id} differs in more than one way: ${found.kinds}`);
    const listed = p.differences.find((d) => d.objectId === found.id);
    const [kind] = found.kinds;
    assert.equal(listed.type, kind, `${label}: ${found.id}`);
    const a = p.left.find((o) => o.id === found.id);
    const b = p.right.find((o) => o.id === found.id);
    if (kind === 'recolor') {
      const limits = listed.mutation === 'subtle-recolor' ? SUBTLE_LIMITS : RECOLOR_LIMITS;
      assert.ok(hueDistance(hexToHsl(a.color).h, hexToHsl(b.color).h) >= limits.minHue - 3, `${label}: hue ${a.color} ${b.color}`);
      assert.ok(rgbDistance(a.color, b.color) >= limits.minRgb, `${label}: RGB ${a.color} ${b.color}`);
    }
    if (kind === 'resize') assert.ok(found.ratio >= 1.29, `${label}: size ratio ${found.ratio}`);
    if (kind === 'move') assert.ok(found.moved >= MIN_MOVE - 1e-6, `${label}: moved ${found.moved}`);
    if (kind === 'rotate') assert.ok(found.turned >= MIN_TURN - 1e-6, `${label}: turned ${found.turned}`);
    if (kind === 'flip') assert.equal(templates.get(a.template).asymmetric, true, `${label}: ${a.template} looks the same flipped`);
    if (kind === 'rotate') assert.ok(!templates.get(a.template).noRotate, `${label}: ${a.template} looks the same turned`);
    if (kind === 'remove') assert.equal(p.right.some((o) => o.id === found.id), false);
    if (kind === 'add') assert.ok(!p.left.some((o) => o.template === b.template), `${label}: ${b.template} was already in the picture`);
  }
  for (const d of p.differences) assert.ok(level.mutations.includes(d.mutation), `${label}: ${d.mutation} is not a ${level.id} kind`);
  // The right picture is as tidy as the left one: everything inside, nothing touching.
  for (const scene of [p.left, p.right]) {
    const boxes = scene.map((o) => objectBox(o, templates.get(o.template)));
    boxes.forEach((box, i) => {
      assert.ok(boxInBounds(box, BOUNDS, MARGIN - 0.01), `${label}: ${scene[i].template} is out of the picture`);
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!boxesOverlap(box, boxes[j], GAP - 0.5), `${label}: ${scene[i].template} touches ${scene[j].template}`);
    });
  }
  // Each place to tap is its own: no two overlap, and each is at least 48 wide and tall.
  const areas = p.differences.map((d) => hitArea(d.box, MIN_TAP_PX));
  areas.forEach((area, i) => {
    assert.ok(area.w >= MIN_TAP_PX && area.h >= MIN_TAP_PX);
    for (let j = i + 1; j < areas.length; j++) assert.ok(!boxesOverlap(area, areas[j]), `${label}: places to tap ${i} and ${j} overlap`);
  });
  for (const d of p.differences) assert.ok(d.label.length > 5 && /^(The|An?) /.test(d.label), d.label);
}

for (const levelId of LEVEL_IDS) {
  test(`puzzles (${levelId}): 300 seeds all have exactly ${LEVELS[levelId].differences} clear, separate differences`, () => {
    for (let seed = 1; seed <= 300; seed++) {
      const themeId = THEME_IDS[seed % THEME_IDS.length];
      const p = generatePuzzle({ themeId, levelId, seed, themes, templates });
      assert.equal(p.left.length, LEVELS[levelId].objects);
      assertGoodPuzzle(p, LEVELS[levelId], `${levelId}/${themeId}/${seed}`);
    }
  });
}

test('puzzles: every theme works at every level', () => {
  for (const themeId of THEME_IDS) for (const levelId of LEVEL_IDS) {
    for (let seed = 1000; seed < 1040; seed++) assertGoodPuzzle(generatePuzzle({ themeId, levelId, seed, themes, templates }), LEVELS[levelId], `${themeId}/${levelId}/${seed}`);
  }
});

test('puzzles: the same seed makes the same puzzle, another seed a different one', () => {
  const make = (seed) => generatePuzzle({ themeId: 'beach', levelId: 'hard', seed, themes, templates });
  assert.deepEqual(make(77), make(77));
  assert.notDeepEqual(make(77).left, make(78).left);
  assert.notDeepEqual(make(77).right, make(79).right);
});

test('puzzles: the kinds of difference are spread out over many puzzles', () => {
  const counts = {};
  for (let seed = 1; seed <= 200; seed++) {
    for (const d of generatePuzzle({ themeId: THEME_IDS[seed % 5], levelId: 'hard', seed, themes, templates }).differences) counts[d.mutation] = (counts[d.mutation] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(counts).sort(), Object.keys(MUTATIONS).filter((id) => LEVELS.hard.mutations.includes(id)).sort());
  for (const [id, n] of Object.entries(counts)) assert.ok(n > 80, `${id} is rare: ${n}`);
});

test('puzzles: an easy puzzle has only colour, missing and added things', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const types = generatePuzzle({ themeId: 'kitchen', levelId: 'easy', seed, themes, templates }).differences.map((d) => d.type).sort();
    assert.deepEqual(types, ['add', 'recolor', 'remove']);
  }
});

test('puzzles: bad input is a clear error, not a crash', () => {
  assert.equal(codeOf(() => generatePuzzle({ themeId: 'moon', levelId: 'easy', seed: 1, themes, templates })), 'UNKNOWN_THEME');
  assert.equal(codeOf(() => generatePuzzle({ themeId: 'park', levelId: 'extreme', seed: 1, themes, templates })), 'UNKNOWN_LEVEL');
});

test('puzzles: when nothing can be built the error says which theme, level and seed', () => {
  // Twenty huge things cannot fit 18 to a picture, however many times it is tried.
  const huge = new Map(Array.from({ length: 20 }, (_, i) => [`big${i}`, { id: `big${i}`, name: 'big', w: 140, h: 140, shapes: [] }]));
  const bigTheme = new Map([['big', { id: 'big', objects: [...huge.keys()] }]]);
  try {
    generatePuzzle({ themeId: 'big', levelId: 'hard', seed: 5, themes: bigTheme, templates: huge });
    assert.fail('should not be possible');
  } catch (error) {
    assert.ok(error instanceof GameError);
    assert.equal(error.code, 'PUZZLE_FAILED');
    assert.deepEqual([error.context.themeId, error.context.levelId, error.context.seed], ['big', 'hard', 5]);
    assert.equal(error.context.cause, 'SCENE_CROWDED');
  }
  assert.ok(MAX_PUZZLE_ATTEMPTS >= 2, 'an unlucky seed gets another go');
});

test('puzzles: a bug is not hidden by the retry', () => {
  const broken = new Map([['park', { id: 'park', objects: Array.from({ length: 20 }, (_, i) => `ghost${i}`) }]]);
  assert.throws(() => generatePuzzle({ themeId: 'park', levelId: 'easy', seed: 1, themes: broken, templates }), TypeError);
});

test('diffScenes: finds each kind of change on its own, and nothing else', () => {
  const a = [thing('o1', 'ball', 100, 100), thing('o2', 'bird', 300, 100), thing('o3', 'apple', 500, 100), thing('o4', 'tiny', 100, 300)];
  assert.deepEqual(diffScenes(a, a.map((o) => ({ ...o }))), []);
  const b = [
    { ...a[0], color: '#2196f3' }, { ...a[1], flip: true }, { ...a[2], x: 560 },
    { ...a[3], scale: 1.4, rotation: 30 }, thing('o5', 'ball', 600, 400),
  ];
  const found = Object.fromEntries(diffScenes(a, b).map((d) => [d.id, d.kinds]));
  assert.deepEqual(found, { o1: ['recolor'], o2: ['flip'], o3: ['move'], o4: ['rotate', 'resize'], o5: ['add'] });
  assert.deepEqual(diffScenes(a, a.slice(1)).map((d) => [d.id, d.kinds]), [['o1', ['remove']]]);
  const turn = diffScenes([thing('o1', 'ball', 0, 0, { rotation: -170 })], [thing('o1', 'ball', 0, 0, { rotation: 170 })]);
  assert.ok(Math.abs(turn[0].turned - 20) < 1e-9, 'turning the short way round');
});

// ---- tapping ----------------------------------------------------------------------------------

const box = (x, y, w, h) => ({ x, y, w, h });

test('hitArea: a little room round the difference, never smaller than the minimum', () => {
  assert.deepEqual(hitArea(box(100, 100, 80, 80), 48), box(100 - HIT_PAD, 100 - HIT_PAD, 80 + 2 * HIT_PAD, 80 + 2 * HIT_PAD));
  const smallArea = hitArea(box(100, 100, 10, 10), 48);
  assert.deepEqual([smallArea.w, smallArea.h], [48, 48]);
  assert.deepEqual(boxCentre(smallArea), { x: 105, y: 105 }, 'it grows round the middle');
  const phone = hitArea(box(100, 100, 40, 40), 48 / 0.45);
  assert.ok(phone.w >= 106 && phone.h >= 106, 'in a smaller picture the area is bigger in picture units, so it stays 48 px');
});

test('findDifferenceAt: nearest centre wins, found ones can be skipped, nothing is -1', () => {
  const diffs = [{ box: box(100, 100, 60, 60) }, { box: box(170, 100, 60, 60) }];
  assert.equal(findDifferenceAt({ x: 130, y: 130 }, diffs), 0);
  assert.equal(findDifferenceAt({ x: 200, y: 130 }, diffs), 1);
  assert.equal(findDifferenceAt({ x: 168, y: 130 }, diffs), 1, 'between the two: the nearer centre');
  assert.equal(findDifferenceAt({ x: 160, y: 130 }, diffs), 0);
  assert.equal(findDifferenceAt({ x: 130, y: 130 }, diffs, { ignore: (i) => i === 0 }), -1);
  assert.equal(findDifferenceAt({ x: 600, y: 400 }, diffs), -1);
  assert.equal(findDifferenceAt({ x: 100 - HIT_PAD, y: 100 }, diffs), 0, 'the edge of the area counts');
  assert.equal(findDifferenceAt({ x: 100 - HIT_PAD - 1, y: 100 }, diffs), -1);
  assert.equal(findDifferenceAt({ x: 0, y: 0 }, []), -1);
});

test('every difference in a real puzzle can be tapped in its middle', () => {
  const p = generatePuzzle({ themeId: 'space', levelId: 'hard', seed: 9, themes, templates });
  p.differences.forEach((d, i) => assert.equal(findDifferenceAt(boxCentre(d.box), p.differences), i));
});

// ---- playing a round --------------------------------------------------------------------------

const puzzle = () => generatePuzzle({ themeId: 'park', levelId: 'easy', seed: 21, themes, templates });
const centreOf = (p, i) => boxCentre(p.differences[i].box);

test('tap: finding all the differences in any order completes the picture', () => {
  const p = puzzle();
  const play = createPlay(p.differences.length);
  assert.equal(isComplete(play), false);
  [2, 0, 1].forEach((i, n) => {
    const r = tap(play, p, centreOf(p, i), { now: 1000 + n });
    assert.deepEqual(r, { outcome: 'hit', index: i });
    assert.equal(foundCount(play), n + 1);
  });
  assert.equal(isComplete(play), true);
  assert.equal(play.misses, 0);
});

test('tap: tapping one you found already changes nothing and costs nothing', () => {
  const p = puzzle();
  const play = createPlay(3);
  tap(play, p, centreOf(p, 1), { now: 0 });
  assert.deepEqual(tap(play, p, centreOf(p, 1), { now: 10 }), { outcome: 'already', index: 1 });
  assert.equal(play.misses, 0);
  assert.equal(play.cooldownUntil, 0, 'no pause for a repeat tap');
  assert.equal(foundCount(play), 1);
});

test('tap: a miss counts, then taps are ignored for 300 ms so tapping at random cannot win', () => {
  const p = puzzle();
  const play = createPlay(3);
  const empty = { x: 5, y: 5 };
  assert.ok(findDifferenceAt(empty, p.differences) === -1, 'the corner has no difference');
  assert.deepEqual(tap(play, p, empty, { now: 1000 }), { outcome: 'miss', index: -1 });
  assert.equal(play.misses, 1);
  assert.equal(COOLDOWN_MS, 300);
  assert.deepEqual(tap(play, p, centreOf(p, 0), { now: 1000 + COOLDOWN_MS - 1 }), { outcome: 'cooldown', index: -1 }, 'a right answer too soon is ignored');
  assert.equal(foundCount(play), 0);
  assert.equal(play.misses, 1, 'an ignored tap is not another miss');
  assert.equal(tap(play, p, centreOf(p, 0), { now: 1000 + COOLDOWN_MS }).outcome, 'hit', 'then it works again');
});

test('tap: uses the minimum size it is given', () => {
  const p = puzzle();
  const d = p.differences[0];
  const edge = { x: d.box.x - HIT_PAD - 8, y: boxCentre(d.box).y };
  assert.equal(findDifferenceAt(edge, p.differences, { minSize: 48 }), -1, 'just outside the normal area');
  assert.equal(tap(createPlay(3), p, edge, { now: 0, minSize: 48 }).outcome, 'miss');
  const wide = tap(createPlay(3), p, edge, { now: 0, minSize: Math.max(d.box.w, d.box.h) + 2 * HIT_PAD + 40 });
  assert.deepEqual(wide, { outcome: 'hit', index: 0 }, 'a bigger minimum (a smaller picture on a phone) catches it');
});

test('hints: two per round, each shows a difference not found yet, and they are shared by the pictures', () => {
  const p = puzzle();
  const round = createRound('easy', 5);
  const play = createPlay(3);
  assert.equal(round.hintsLeft, HINTS_PER_ROUND);
  assert.equal(HINTS_PER_ROUND, 2);
  assert.equal(useHint(round, play), 0);
  tap(play, p, centreOf(p, 0), { now: 0 });
  assert.equal(useHint(round, play), 1, 'the next one not found');
  assert.equal(round.hintsLeft, 0);
  assert.equal(useHint(round, play), -1, 'none left');
  assert.equal(useHint(createRound('easy', 5), createPlay(0)), -1, 'nothing to find');
  const nextPicture = createPlay(3);
  assert.equal(useHint(round, nextPicture), -1, 'the next picture has no more hints either');
  assert.equal(round.hintsLeft, 0, 'a refused hint costs nothing');
});

test('stars for a picture: clean and quick is 3, a few misses 2, otherwise 1', () => {
  const t = 60;
  assert.equal(sceneStars({ misses: 0, elapsed: 20, target: t }), 3);
  assert.equal(sceneStars({ misses: 1, elapsed: 59.9, target: t }), 3);
  assert.equal(sceneStars({ misses: 1, elapsed: 60, target: t }), 2, 'too slow for 3');
  assert.equal(sceneStars({ misses: 2, elapsed: 10, target: t }), 2);
  assert.equal(sceneStars({ misses: 3, elapsed: 500, target: t }), 2);
  assert.equal(sceneStars({ misses: 4, elapsed: 10, target: t }), 1);
  assert.equal(sceneStars({ misses: 0, elapsed: 9999, target: t }), 2, 'slow but clean: still 2');
});

test('time bonus: what is left of the target, less 3 seconds for each miss, never negative', () => {
  assert.equal(timeBonus({ misses: 0, elapsed: 20, target: 60 }), 40);
  assert.equal(timeBonus({ misses: 2, elapsed: 20, target: 60 }), 34);
  assert.equal(timeBonus({ misses: 0, elapsed: 61, target: 60 }), 0);
  assert.equal(timeBonus({ misses: 30, elapsed: 0, target: 60 }), 0);
  assert.equal(timeBonus({ misses: 0, elapsed: 20.4, target: 60 }), 40, 'whole points');
  assert.equal(sceneScore({ misses: 0, elapsed: 20, target: 60 }, 3), 340);
});

test('stars for a round: the average of the pictures, a half rounds up', () => {
  assert.equal(roundStars([]), 0);
  assert.equal(roundStars([{ stars: 3 }, { stars: 3 }, { stars: 3 }, { stars: 3 }, { stars: 3 }]), 3);
  assert.equal(roundStars([{ stars: 3 }, { stars: 2 }]), 3, '2.5 rounds up');
  assert.equal(roundStars([{ stars: 1 }, { stars: 2 }]), 2, '1.5 rounds up');
  assert.equal(roundStars([{ stars: 2 }, { stars: 2 }, { stars: 1 }, { stars: 1 }, { stars: 1 }]), 1, '1.4 rounds down');
});

test('a round is five pictures with their own seeds', () => {
  assert.equal(SCENES_PER_ROUND, 5);
  const round = createRound('hard', 123);
  assert.equal(isRoundOver(round), false);
  round.results.push(...Array.from({ length: SCENES_PER_ROUND }, () => ({ stars: 2 })));
  assert.equal(isRoundOver(round), true);
  const seeds = Array.from({ length: SCENES_PER_ROUND }, (_, i) => puzzleSeed(123, i));
  assert.equal(new Set(seeds).size, SCENES_PER_ROUND);
  assert.deepEqual(seeds, Array.from({ length: SCENES_PER_ROUND }, (_, i) => puzzleSeed(123, i)), 'repeatable');
  assert.notDeepEqual(seeds, Array.from({ length: SCENES_PER_ROUND }, (_, i) => puzzleSeed(124, i)));
  seeds.forEach((s) => assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32));
});
