import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { LEVELS, LEVEL_IDS, getLevel, TRIP_LENGTH, EXPLORED_AT } from '../../src/games/flag-capital-quest/logic/levels.js';
import { validateCountries, countriesFor, byCode, isCapitalOf, getCountry } from '../../src/games/flag-capital-quest/logic/countries.js';
import { CONTINENTS, CONTINENT_IDS, viewFor, reachesView, WORLD_VIEW } from '../../src/games/flag-capital-quest/logic/continents.js';
import { project, rectFor, WORLD_WIDTH, WORLD_HEIGHT } from '../../src/games/flag-capital-quest/logic/projection.js';
import { makeQuestion, pickDistractors, buildTrip, typesFor } from '../../src/games/flag-capital-quest/logic/questionFactory.js';
import { recordCorrect, isExplored, exploredCodes, newlyExplored, summarize, sanitizeProgress } from '../../src/games/flag-capital-quest/logic/progress.js';
import { tripStars, tripScore } from '../../src/games/flag-capital-quest/logic/scoring.js';
import { fitToAspect, clampView, zoomAt, panBy, pinchView, hitRadius, resolveTap, pixelsPerUnit, MIN_VIEW_WIDTH, MIN_HIT_RADIUS_PX, ON_NEIGHBOUR_SHARE } from '../../src/games/flag-capital-quest/logic/mapView.js';
import { createRng } from '../../src/engine/utils/random.js';

const GAME = new URL('../../src/games/flag-capital-quest/', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('data/countries.json', GAME), 'utf8'));
const data = validateCountries(raw);
const countries = data.countries;
const index = byCode(countries);
const worldSvg = readFileSync(new URL('assets/world.svg', GAME), 'utf8');

/** The aim point and size of every country path in world.svg. */
const anchors = new Map([...worldSvg.matchAll(/<path id="([A-Z]{2})" data-cx="([\d.-]+)" data-cy="([\d.-]+)" data-r="([\d.-]+)"/g)]
  .map(([, code, cx, cy, r]) => [code, { code, cx: Number(cx), cy: Number(cy), r: Number(r) }]));

// ---- data and assets ---------------------------------------------------------------------

test('there are 194 countries across six continents, with the level sizes the spec describes', () => {
  assert.equal(countries.length, 194);
  assert.deepEqual(CONTINENT_IDS, ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']);
  const count = (levels) => countriesFor(countries, levels).length;
  assert.ok(count(['easy']) >= 38 && count(['easy']) <= 48, `Easy ~40 (${count(['easy'])})`);
  assert.ok(count(['easy', 'medium']) >= 90 && count(['easy', 'medium']) <= 110, `Medium ~100 (${count(['easy', 'medium'])})`);
  assert.equal(count(['easy', 'medium', 'hard']), 194);
});

test('every continent has enough countries at every level to make four choices and a trip', () => {
  for (const id of LEVEL_IDS) {
    for (const continent of CONTINENT_IDS) {
      const eligible = countriesFor(countries, LEVELS[id].countries, continent);
      assert.ok(eligible.length >= 5, `${continent} at ${id}: ${eligible.length}`);
    }
  }
  for (const continent of CONTINENT_IDS) assert.ok(countries.filter((c) => c.continent === continent).length >= 4);
});

test('every country has a flag file and a map path (and nothing is missing from either side)', () => {
  for (const c of countries) {
    const flag = new URL(c.flag, GAME);
    assert.ok(existsSync(flag), `flag file for ${c.code}`);
    assert.match(readFileSync(flag, 'utf8'), /<svg[\s>]/, `${c.code} flag is an SVG`);
    assert.ok(anchors.has(c.svgPathId), `map path for ${c.code}`);
  }
  const ids = [...worldSvg.matchAll(/ id="([A-Z]{2})"/g)].map((m) => m[1]);
  assert.equal(ids.length, 194);
  assert.deepEqual([...ids].sort(), countries.map((c) => c.code).sort(), 'the map has exactly the countries in the list');
  assert.ok(existsSync(new URL('assets/flags/LICENSE.txt', GAME)), 'the flag licence is kept with the flags');
});

test('the map keeps the rest of the land neutral: grey shapes with no id', () => {
  const context = worldSvg.match(/<g id="context">(.*?)<\/g>/s)[1];
  assert.ok(context.includes('class="context"'));
  assert.ok(!/ id=/.test(context), 'nothing in the grey group can be answered');
  assert.ok(!/xlink|href=|<script|<image|http:/.test(worldSvg.replace('http://www.w3.org/2000/svg', '')), 'no outside links in the map');
});

test('aim points are on the map, and tiny countries are tiny', () => {
  for (const [code, a] of anchors) {
    assert.ok(a.cx >= 0 && a.cx <= WORLD_WIDTH && a.cy >= 0 && a.cy <= WORLD_HEIGHT, `${code} anchor on the map`);
  }
  for (const code of ['VA', 'MC', 'SM', 'SG', 'MT', 'LI', 'NR', 'TV']) assert.ok(anchors.get(code).r < 3, `${code} is small`);
  assert.ok(anchors.get('RU').r > 100 && anchors.get('BR').r > 40);
});

test('countries have one-sentence facts, and capitals are listed, including several for some countries', () => {
  for (const c of countries) {
    assert.ok(/[.!]$/.test(c.fact) && c.fact.length < 160, `${c.code} fact`);
    assert.equal(c.fact.split(/[.!?]\s/).length, 1, `${c.code}: one sentence (${c.fact})`);
    assert.ok(c.capital.length > 0 || c.code === 'IL', `${c.code} has a capital (only Israel's is left out as disputed)`);
  }
  assert.deepEqual(index.get('ZA').capital, ['Pretoria', 'Cape Town', 'Bloemfontein']);
  assert.deepEqual(index.get('BO').capital, ['Sucre', 'La Paz']);
  assert.ok(isCapitalOf(index.get('ZA'), 'cape town'));
  assert.ok(isCapitalOf(index.get('BO'), ' La Paz '));
  assert.ok(!isCapitalOf(index.get('BO'), 'Lima'));
  assert.deepEqual(index.get('IL').capital, [], 'a disputed capital is never asked');
});

test('disputed territories are not countries in the quiz', () => {
  const codes = new Set(countries.map((c) => c.code));
  for (const code of ['PS', 'XK', 'TW', 'EH']) assert.ok(!codes.has(code), code);
});

test('country data validation names the problem', () => {
  const bad = (change) => () => { const copy = structuredClone(raw); change(copy); validateCountries(copy); };
  const on = (field) => (e) => e.code === 'INVALID_DATA' && e.context.field === field;
  assert.throws(bad((d) => { d.countries = []; }), on('countries'));
  assert.throws(bad((d) => { d.countries[0].code = 'dz'; }), on('countries[0].code'));
  assert.throws(bad((d) => { d.countries[1].code = d.countries[0].code; }), /appears twice/);
  assert.throws(bad((d) => { d.countries[0].continent = 'Atlantis'; }), on('countries[0].continent'));
  assert.throws(bad((d) => { d.countries[0].level = 'impossible'; }), on('countries[0].level'));
  assert.throws(bad((d) => { d.countries[0].flag = 'assets/flags/zz.svg'; }), on('countries[0].flag'));
  assert.throws(bad((d) => { d.countries[0].svgPathId = 'XX'; }), on('countries[0].svgPathId'));
  assert.throws(bad((d) => { d.countries[0].fact = 'Short'; }), on('countries[0].fact'));
  assert.throws(bad((d) => { d.countries[0].capital = [3]; }), on('countries[0].capital'));
  assert.throws(() => getCountry('ZZ', index), { code: 'UNKNOWN_COUNTRY' });
  assert.throws(() => getLevel('x'), { code: 'UNKNOWN_LEVEL' });
});

// ---- questions ---------------------------------------------------------------------------

test('flag questions: four different names, the right one once, wrong ones from the same continent', () => {
  const rng = createRng(1);
  for (const c of countries) {
    for (let i = 0; i < 3; i++) {
      const q = makeQuestion('flag', c, countries, rng);
      assert.equal(q.type, 'flag');
      assert.equal(q.code, c.code);
      assert.equal(q.options.length, 4, c.code);
      assert.equal(new Set(q.options.map((o) => o.label)).size, 4, `${c.code}: different names`);
      assert.equal(q.options.filter((o) => o.code === c.code).length, 1, `${c.code}: the answer appears once`);
      assert.equal(q.options.find((o) => o.code === c.code).label, c.name);
      for (const o of q.options) assert.equal(index.get(o.code).continent, c.continent, `${c.code}: ${o.code} is from the same continent`);
    }
  }
});

test('capital questions: the right capital once, and no wrong button is a capital of the answer', () => {
  const rng = createRng(2);
  for (const c of countries.filter((x) => x.capital.length)) {
    for (let i = 0; i < 3; i++) {
      const q = makeQuestion('capital', c, countries, rng);
      assert.equal(q.options.length, 4, c.code);
      assert.equal(new Set(q.options.map((o) => o.label.toLowerCase())).size, 4, `${c.code}: different capitals`);
      const right = q.options.filter((o) => o.code === c.code);
      assert.equal(right.length, 1);
      assert.ok(isCapitalOf(c, right[0].label), `${c.code}: the right button shows one of its capitals`);
      for (const o of q.options.filter((x) => x.code !== c.code)) {
        assert.ok(!isCapitalOf(c, o.label), `${c.code}: "${o.label}" must not be an accepted capital`);
        assert.equal(index.get(o.code).continent, c.continent);
        assert.ok(index.get(o.code).capital.includes(o.label), 'a wrong button shows that country\'s own capital');
      }
    }
  }
});

test('a country with several capitals can show any of them as the right answer', () => {
  const shown = new Set();
  const rng = createRng(3);
  for (let i = 0; i < 100; i++) shown.add(makeQuestion('capital', index.get('ZA'), countries, rng).options.find((o) => o.code === 'ZA').label);
  assert.deepEqual([...shown].sort(), ['Bloemfontein', 'Cape Town', 'Pretoria']);
});

test('capital-to-country questions offer countries that have capitals', () => {
  const rng = createRng(4);
  for (const c of countries.filter((x) => x.capital.length)) {
    const q = makeQuestion('capital-country', c, countries, rng);
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter((o) => o.code === c.code).length, 1);
    for (const o of q.options) assert.ok(index.get(o.code).capital.length > 0 && index.get(o.code).continent === c.continent);
  }
});

test('map questions carry name buttons as a fallback; asking for a capital of a country without one is an error', () => {
  const q = makeQuestion('map', index.get('FR'), countries, createRng(1));
  assert.equal(q.type, 'map');
  assert.equal(q.options.length, 4);
  assert.equal(q.options.filter((o) => o.code === 'FR').length, 1);
  assert.ok(q.options.every((o) => index.get(o.code).continent === 'Europe'));
  assert.throws(() => makeQuestion('capital', index.get('IL'), countries, createRng(1)), { code: 'BAD_QUESTION' });
  assert.throws(() => makeQuestion('capital-country', index.get('IL'), countries, createRng(1)), { code: 'BAD_QUESTION' });
  assert.throws(() => makeQuestion('riddle', index.get('FR'), countries, createRng(1)), { code: 'BAD_QUESTION' });
});

test('too few countries on a continent is an error, not a duplicated option', () => {
  const tiny = countries.filter((c) => c.continent === 'Europe').slice(0, 3);
  assert.throws(() => pickDistractors(tiny[0], tiny, createRng(1)), { code: 'NOT_ENOUGH_DISTRACTORS' });
});

test('map questions are only asked about countries that can be tapped, capital ones only with a capital', () => {
  const il = index.get('IL');
  assert.deepEqual(typesFor(['flag', 'capital', 'map', 'capital-country'], il, () => true), ['flag', 'map']);
  assert.deepEqual(typesFor(['flag', 'capital', 'map', 'capital-country'], index.get('FR'), () => false), ['flag', 'capital', 'capital-country']);
});

// ---- trips -------------------------------------------------------------------------------

test('a trip has ten questions about countries of the chosen continent and level', () => {
  for (const levelId of LEVEL_IDS) {
    for (const continent of [...CONTINENT_IDS, 'world']) {
      const trip = buildTrip({ countries, continent, levelId, progress: {}, rng: createRng(5) });
      assert.equal(trip.length, TRIP_LENGTH);
      for (const q of trip) {
        const c = index.get(q.code);
        assert.ok(LEVELS[levelId].countries.includes(c.level), `${levelId}: ${c.code} is a ${c.level} country`);
        if (continent !== 'world') assert.equal(c.continent, continent);
        assert.ok(LEVELS[levelId].types.includes(q.type));
      }
    }
  }
});

test('question types unlock by level: Easy flags only, Medium adds capitals, Hard adds the map and capital-to-country', () => {
  const typesAt = (levelId) => {
    const seen = new Set();
    for (let seed = 1; seed <= 60; seed++) for (const q of buildTrip({ countries, continent: 'world', levelId, progress: {}, rng: createRng(seed) })) seen.add(q.type);
    return [...seen].sort();
  };
  assert.deepEqual(typesAt('easy'), ['flag']);
  assert.deepEqual(typesAt('medium'), ['capital', 'flag']);
  assert.deepEqual(typesAt('hard'), ['capital', 'capital-country', 'flag', 'map']);
});

test('a trip never asks about the same country twice in a row, and not twice at all when there are enough', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const trip = buildTrip({ countries, continent: 'Europe', levelId: 'hard', progress: {}, rng: createRng(seed) });
    for (let i = 1; i < trip.length; i++) assert.notEqual(trip[i].code, trip[i - 1].code);
    assert.equal(new Set(trip.map((q) => q.code)).size, trip.length);
  }
  // Oceania at Easy has only 5 countries: the trip goes round again, but never back to back.
  for (let seed = 1; seed <= 100; seed++) {
    const trip = buildTrip({ countries, continent: 'Oceania', levelId: 'easy', progress: {}, rng: createRng(seed) });
    assert.equal(trip.length, 10);
    for (let i = 1; i < trip.length; i++) assert.notEqual(trip[i].code, trip[i - 1].code, `seed ${seed}`);
  }
});

test('unexplored countries come first, so a trip adds to the map', () => {
  const eligible = countriesFor(countries, LEVELS.medium.countries, 'Asia');
  const fresh = new Set(eligible.slice(0, 4).map((c) => c.code));
  const progress = Object.fromEntries(eligible.filter((c) => !fresh.has(c.code)).map((c) => [c.code, { correct: EXPLORED_AT, explored: true }]));
  for (let seed = 1; seed <= 40; seed++) {
    const trip = buildTrip({ countries, continent: 'Asia', levelId: 'medium', progress, rng: createRng(seed) });
    assert.deepEqual(new Set(trip.slice(0, 4).map((q) => q.code)), fresh, `seed ${seed}: the four unexplored countries come first`);
  }
});

test('map questions respect which countries can be tapped, and nobody gets a capital question without a capital', () => {
  const hidden = new Set(['FR', 'DE', 'IT']);
  for (let seed = 1; seed <= 80; seed++) {
    const trip = buildTrip({ countries, continent: 'Europe', levelId: 'hard', progress: {}, rng: createRng(seed), canTap: (code) => !hidden.has(code) });
    for (const q of trip) if (q.type === 'map') assert.ok(!hidden.has(q.code));
  }
  for (let seed = 1; seed <= 80; seed++) {
    for (const q of buildTrip({ countries, continent: 'Asia', levelId: 'hard', progress: {}, rng: createRng(seed) })) {
      if (q.code === 'IL') assert.ok(['flag', 'map'].includes(q.type), `Israel: ${q.type}`);
    }
  }
});

test('a trip with nothing to ask is an error', () => {
  assert.throws(() => buildTrip({ countries: [], continent: 'world', levelId: 'easy', progress: {}, rng: createRng(1) }), { code: 'NO_COUNTRIES' });
});

test('trips are reproducible from a seed', () => {
  const make = () => buildTrip({ countries, continent: 'Africa', levelId: 'hard', progress: {}, rng: createRng(9) });
  assert.deepEqual(make(), make());
});

// ---- progress ----------------------------------------------------------------------------

test('a country is explored after two correct answers, and wrong answers change nothing', () => {
  let p = {};
  p = recordCorrect(p, 'FR');
  assert.deepEqual(p.FR, { correct: 1, explored: false });
  assert.equal(isExplored(p, 'FR'), false);
  const before = p;
  p = recordCorrect(p, 'FR');
  assert.deepEqual(p.FR, { correct: 2, explored: true });
  assert.ok(isExplored(p, 'FR'));
  assert.deepEqual(before.FR, { correct: 1, explored: false }, 'the old progress is not changed');
  p = recordCorrect(p, 'FR');
  assert.equal(p.FR.correct, 3);
  assert.ok(p.FR.explored);
  assert.ok(!isExplored(p, 'DE'));
});

test('explored sets, new stamps, and the percentage for each continent', () => {
  const africa = countries.filter((c) => c.continent === 'Africa');
  let before = {};
  for (const c of africa.slice(0, 5)) before = recordCorrect(recordCorrect(before, c.code), c.code);
  before = recordCorrect(before, 'FR'); // answered once: not explored
  assert.equal(exploredCodes(before).size, 5);
  let after = before;
  after = recordCorrect(after, 'FR');
  after = recordCorrect(recordCorrect(after, africa[5].code), africa[5].code);
  assert.deepEqual(newlyExplored(before, after).sort(), ['FR', africa[5].code].sort());
  const sum = summarize(after, countries);
  assert.equal(sum.world.explored, 7);
  assert.equal(sum.world.total, 194);
  assert.equal(sum.continents.Africa.explored, 6);
  assert.equal(sum.continents.Africa.total, 54);
  assert.equal(sum.continents.Africa.percent, Math.round((6 / 54) * 100));
  assert.equal(sum.continents.Europe.explored, 1);
  assert.equal(summarize({}, countries).world.percent, 0);
  const all = Object.fromEntries(countries.map((c) => [c.code, { correct: 2, explored: true }]));
  assert.equal(summarize(all, countries).world.percent, 100);
});

test('progress read from storage is cleaned', () => {
  const valid = new Set(['FR', 'DE']);
  assert.deepEqual(sanitizeProgress({ FR: { correct: 3, explored: false }, DE: { correct: 1, explored: true }, XX: { correct: 2 }, IT: { correct: 5 } }, valid),
    { FR: { correct: 3, explored: true }, DE: { correct: 1, explored: false } }, 'unknown countries dropped, explored recomputed');
  assert.deepEqual(sanitizeProgress({ FR: { correct: -1 }, DE: { correct: 2.5 }, }, valid), {});
  for (const junk of [null, undefined, 5, 'x', []]) assert.deepEqual(sanitizeProgress(junk, valid), {});
});

test('stars from correct answers in a trip', () => {
  assert.deepEqual([10, 9, 8, 7, 6, 0].map(tripStars), [3, 3, 2, 2, 1, 1]);
  assert.equal(tripScore(7), 70);
});

// ---- map projection and views ----------------------------------------------------------

test('the projection puts the equator and the prime meridian where expected', () => {
  assert.deepEqual(project(-180, 84), [0, 0]);
  assert.deepEqual(project(180, 84), [WORLD_WIDTH, 0]);
  assert.equal(project(0, 0)[0], WORLD_WIDTH / 2);
  assert.ok(project(0, 0)[1] > 0 && project(0, 0)[1] < WORLD_HEIGHT);
  const r = rectFor({ west: 0, east: 90, south: 0, north: 45 });
  assert.equal(Math.round(r.width), 250);
  assert.equal(Math.round(r.height), 125);
});

test('every continent has a view inside the map, and countries sit in the view of their continent', () => {
  for (const c of CONTINENTS) {
    const v = viewFor(c.id);
    assert.ok(v.x >= 0 && v.y >= 0 && v.x + v.width <= WORLD_WIDTH + 0.01 && v.y + v.height <= WORLD_HEIGHT + 0.01, c.id);
  }
  assert.deepEqual(viewFor('world'), WORLD_VIEW);
  // Everything is findable on its continent's map, except the few Pacific islands on the far side of the map's edge.
  const outside = countries.filter((c) => !reachesView(viewFor(c.continent), anchors.get(c.code))).map((c) => c.code).sort();
  assert.deepEqual(outside, ['KI', 'TO', 'WS'], 'only Kiribati, Tonga and Samoa lie outside the Oceania view');
  assert.ok(reachesView(viewFor('Europe'), anchors.get('RU')), 'Russia reaches into the Europe view');
  assert.ok(reachesView(viewFor('Africa'), anchors.get('CV')), 'Cabo Verde is in the Africa view');
  assert.ok(reachesView(viewFor('Asia'), anchors.get('SG')) && reachesView(viewFor('Asia'), anchors.get('MV')));
  assert.ok(!reachesView(viewFor('Oceania'), anchors.get('KI')));
});

// ---- pan and zoom ------------------------------------------------------------------------

const WORLD = { x: 0, y: 0, width: 1000, height: 394 };
const limits = { world: WORLD, minWidth: MIN_VIEW_WIDTH };

test('a view is grown to the shape of the screen without cropping the map', () => {
  const wide = fitToAspect({ x: 100, y: 100, width: 200, height: 100 }, 1);
  assert.equal(wide.width, 200);
  assert.equal(wide.height, 200, 'a wide rectangle gets taller on a square screen');
  assert.equal(wide.y + wide.height / 2, 150, 'about its centre');
  const tall = fitToAspect({ x: 100, y: 100, width: 100, height: 200 }, 1);
  assert.equal(tall.width, 200);
  assert.equal(tall.x + tall.width / 2, 150);
  const same = fitToAspect({ x: 0, y: 0, width: 400, height: 200 }, 2);
  assert.deepEqual(same, { x: 0, y: 0, width: 400, height: 200 });
});

test('zooming keeps the point under the finger or cursor where it is', () => {
  const view = { x: 200, y: 100, width: 400, height: 200 };
  const anchor = { x: 300, y: 150 };
  for (const factor of [1.5, 2, 0.8]) {
    const z = zoomAt(view, factor, anchor, limits);
    assert.ok(Math.abs((anchor.x - z.x) / z.width - (anchor.x - view.x) / view.width) < 1e-9, `x fraction for ×${factor}`);
    assert.ok(Math.abs((anchor.y - z.y) / z.height - (anchor.y - view.y) / view.height) < 1e-9);
    assert.ok(Math.abs(z.width / z.height - view.width / view.height) < 1e-9, 'aspect kept');
  }
  assert.equal(zoomAt(view, 2, anchor, limits).width, 200);
  assert.equal(zoomAt(view, 0.5, anchor, limits).width, 800);
});

test('zoom has limits: no further out than the whole world, no further in than the minimum', () => {
  let view = { x: 0, y: 0, width: 1000, height: 394 };
  assert.equal(zoomAt(view, 0.5, { x: 500, y: 200 }, limits).width, 1000, 'cannot zoom out past the world');
  view = { x: 400, y: 150, width: 40, height: 15.76 };
  for (let i = 0; i < 20; i++) view = zoomAt(view, 2, { x: view.x + view.width / 2, y: view.y + view.height / 2 }, limits);
  assert.equal(view.width, MIN_VIEW_WIDTH, 'cannot zoom in past the minimum');
});

test('panning moves the view but never lets the centre leave the map', () => {
  const view = { x: 400, y: 100, width: 200, height: 78.8 };
  const moved = panBy(view, 50, 20, limits);
  assert.equal(moved.x, 450);
  assert.equal(moved.y, 120);
  const far = panBy(view, 5000, -5000, limits);
  assert.ok(far.x + far.width / 2 <= 1000 && far.y + far.height / 2 >= 0);
  assert.equal(far.width, view.width, 'panning never changes the zoom');
});

test('a pinch zooms by the change in finger distance and follows the fingers', () => {
  const start = { x: 300, y: 100, width: 400, height: 157.6 };
  const middle = { x: 500, y: 178.8 }; // the fingers start at the centre
  const spread = pinchView(start, 100, 200, middle, { x: 0.5, y: 0.5 }, limits);
  assert.equal(spread.width, 200, 'fingers twice as far apart: twice as close');
  assert.ok(Math.abs(spread.x + spread.width / 2 - 500) < 1e-9, 'the point between the fingers stays between them');
  const squeeze = pinchView(start, 200, 100, middle, { x: 0.5, y: 0.5 }, limits);
  assert.equal(squeeze.width, 800);
  assert.deepEqual(pinchView(start, 0, 100, middle, { x: 0.5, y: 0.5 }, limits), start, 'a zero distance changes nothing');
  // dragging the fingers across the screen pans the map
  const dragged = pinchView(start, 100, 100, middle, { x: 0.4, y: 0.5 }, limits);
  assert.ok(dragged.x > start.x);
});

// ---- tapping small countries -------------------------------------------------------------

test('every country is at least 24 pixels wide as a tap target, whatever the zoom', () => {
  for (const scale of [0.5, 1.4, 6, 40]) {
    assert.ok(hitRadius(0.4, scale) * scale >= MIN_HIT_RADIUS_PX - 1e-9, `scale ${scale}`);
    assert.equal(hitRadius(100, scale), 100, 'a big country keeps its own size');
  }
  assert.equal(pixelsPerUnit({ x: 0, y: 0, width: 500, height: 200 }, 1000), 2);
});

test('a tap near a tiny country goes to it, even when a big neighbour is under the finger', () => {
  const a = [
    { code: 'SM', cx: 100, cy: 100, r: 0.5 },
    { code: 'IT', cx: 90, cy: 120, r: 30 },
    { code: 'MC', cx: 200, cy: 100, r: 0.4 },
  ];
  assert.equal(resolveTap({ x: 101, y: 100.5 }, 'IT', a, 10), 'SM', 'about 11 px from San Marino at 10 px per unit');
  assert.equal(resolveTap({ x: 110, y: 100 }, 'IT', a, 10), 'IT', 'far enough away: the big country');
  assert.equal(resolveTap({ x: 150, y: 150 }, null, a, 10), null, 'open sea');
  assert.equal(resolveTap({ x: 150, y: 150 }, 'IT', a, 10), 'IT');
});

test('on a big neighbour\'s own shape a tiny country\'s circle is only half as big', () => {
  const a = [{ code: 'SM', cx: 100, cy: 100, r: 0.4 }];
  // 24 px circle at 10 px per unit = 2.4 units; on a neighbour it shrinks to 1.2 units.
  assert.equal(ON_NEIGHBOUR_SHARE, 0.5);
  assert.equal(resolveTap({ x: 101, y: 100 }, 'IT', a, 10), 'SM', '10 px away: still the tiny country');
  assert.equal(resolveTap({ x: 101.8, y: 100 }, 'IT', a, 10), 'IT', '18 px away on Italy: Italy was meant');
  assert.equal(resolveTap({ x: 101.8, y: 100 }, null, a, 10), 'SM', '18 px away in open sea: the whole circle counts');
  assert.equal(resolveTap({ x: 101.8, y: 100 }, 'SM', a, 10), 'SM', 'on its own shape the whole circle counts');
});

test('a tap on a tiny country\'s own shape beats the circle of a tiny neighbour', () => {
  const a = [{ code: 'LC', cx: 330.6, cy: 194.7, r: 0.6 }, { code: 'VC', cx: 330, cy: 196.5, r: 0.3 }];
  assert.equal(resolveTap({ x: 330.2, y: 196.2 }, 'VC', a, 1.7), 'VC', 'nearer to Saint Vincent');
  assert.equal(resolveTap({ x: 330.6, y: 194.9 }, 'LC', a, 1.7), 'LC', 'nearer to Saint Lucia');
});

test('when two tiny countries are close, the nearer one wins', () => {
  const a = [{ code: 'A', cx: 100, cy: 100, r: 0.3 }, { code: 'B', cx: 101, cy: 100, r: 0.3 }];
  assert.equal(resolveTap({ x: 100.2, y: 100 }, null, a, 10), 'A');
  assert.equal(resolveTap({ x: 100.8, y: 100 }, null, a, 10), 'B');
});

test('a country that is already big on screen has no extra circle', () => {
  const a = [{ code: 'BIG', cx: 100, cy: 100, r: 5 }];
  assert.equal(resolveTap({ x: 103, y: 100 }, null, a, 10), null, 'r × scale = 50 px: its own shape is the target');
  assert.equal(resolveTap({ x: 103, y: 100 }, 'BIG', a, 10), 'BIG');
});
