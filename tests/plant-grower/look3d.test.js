// How the 3D garden looks for a state of the game: the plant's height, its droop, its colour, the weather and the sun. None of it
// imports three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { WEATHER } from '../../src/games/plant-grower/logic/weather.js';
import { PROBLEMS, HAPPY } from '../../src/games/plant-grower/logic/messages.js';
import { STAGE_COUNT } from '../../src/games/plant-grower/logic/plants.js';
import {
  STAGE_GROWTH, growthOf, droopFor, mixHex, tintFor, weatherLook, sunPosition, skyAt, rainLayout,
} from '../../src/games/plant-grower/logic/look3d.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);
const brightness = (hex) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);

test('the plant grows taller at every stage until it is full height, from no stem at the seed to the whole stem', () => {
  assert.equal(STAGE_GROWTH.length, STAGE_COUNT);
  assert.equal(growthOf(0), 0);
  assert.equal(growthOf(STAGE_COUNT - 1), 1);
  for (let stage = 1; stage < 6; stage++) assert.ok(growthOf(stage) > growthOf(stage - 1), `stage ${stage}`);
  assert.equal(growthOf(5), 1, 'the flower stage is full height');
  assert.equal(growthOf(-3), 0);
  assert.equal(growthOf(99), 1);
  assert.equal(growthOf(NaN), 0);
});

test('a wilting plant droops most, a thirsty one a good deal, a hungry one only its leaves, and a happy one not at all', () => {
  const wilting = droopFor({ mood: 'wilting', problem: 'thirsty' });
  const thirsty = droopFor({ mood: 'ok', problem: 'thirsty' });
  const hungry = droopFor({ mood: 'ok', problem: 'hungry' });
  const ok = droopFor({ mood: 'ok' });
  const happy = droopFor({ mood: 'happy' });
  assert.ok(wilting.lean > thirsty.lean && thirsty.lean > hungry.lean);
  assert.ok(wilting.leaf > thirsty.leaf && thirsty.leaf > hungry.leaf && hungry.leaf > ok.leaf && ok.leaf > happy.leaf);
  assert.deepEqual(happy, { lean: 0, leaf: 0 });
  assert.equal(hungry.lean, 0);
  // Every problem the game can name gives a sensible droop (never negative, never past a full droop).
  for (const problem of [...Object.values(PROBLEMS), HAPPY]) {
    for (const mood of ['happy', 'ok', 'wilting']) {
      const d = droopFor({ mood, problem: problem.id });
      assert.ok(d.lean >= 0 && d.lean <= 0.6 && d.leaf >= 0 && d.leaf <= 1, `${mood} ${problem.id}`);
    }
  }
});

test('mixing colours gives the ends at 0 and 1 and a colour between them, and holds out-of-range amounts at the ends', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
  assert.equal(mixHex('#ff0000', '#0000ff', -4), '#ff0000');
  assert.equal(mixHex('#ff0000', '#0000ff', 9), '#0000ff');
});

test('each problem changes the leaves or the light in its own way, and a plant with nothing wrong looks normal', () => {
  assert.deepEqual(tintFor(null), { leaf: null, amount: 0, light: 1 });
  assert.deepEqual(tintFor('happy'), tintFor(null));
  assert.deepEqual(tintFor('puddle'), tintFor(null), 'a puddle shows as a puddle, not as a colour');
  assert.deepEqual(tintFor('thirsty'), tintFor(null), 'thirst shows as a droop');
  assert.ok(tintFor('burnt').amount > tintFor('hungry').amount, 'burnt leaves are browner than pale ones');
  assert.ok(tintFor('shady').light < 1, 'too little sun dims the light');
  assert.ok(brightness(tintFor('burnt').leaf) < brightness(tintFor('hungry').leaf), 'burnt is darker than hungry');
  for (const kind of ['burnt', 'hungry', 'sweaty', 'shady']) assert.match(tintFor(kind).leaf, /^#[0-9a-f]{6}$/);
});

test('every weather the game has gets a look, and the looks fit the weather: sun, cloud, rain and heat', () => {
  for (const kind of Object.keys(WEATHER)) assert.ok(weatherLook(kind), kind);
  assert.equal(weatherLook('rainy').rain, true);
  for (const kind of ['sunny', 'cloudy', 'heat']) assert.equal(weatherLook(kind).rain, false);
  assert.ok(weatherLook('rainy').sun === 0, 'no sun in the rain');
  assert.ok(weatherLook('cloudy').sun < weatherLook('sunny').sun, 'clouds hide the sun');
  assert.ok(weatherLook('cloudy').clouds > weatherLook('sunny').clouds);
  assert.ok(weatherLook('heat').sun > weatherLook('sunny').sun, 'a heat wave has the biggest sun');
  assert.ok(weatherLook('heat').haze > 0 && weatherLook('sunny').haze === 0);
  assert.ok(brightness(weatherLook('rainy').sky) < brightness(weatherLook('sunny').sky), 'a rainy sky is darker');
  throwsCode(() => weatherLook('snow'), 'BAD_WEATHER');
  throwsCode(() => weatherLook(undefined), 'BAD_WEATHER');
});

test('the sun rises on the left, is highest at noon, sets on the right, and stays behind the plant', () => {
  const sunrise = sunPosition(0);
  const noon = sunPosition(0.5);
  const sunset = sunPosition(1);
  assert.ok(sunrise.x < 0 && sunset.x > 0);
  near(noon.x, 0, 1e-9);
  near(sunrise.x, -sunset.x, 1e-9);
  assert.ok(noon.y > sunrise.y && noon.y > sunset.y);
  near(sunrise.y, sunset.y, 1e-9);
  assert.ok(sunrise.y >= 0, 'never below the ground');
  for (let p = 0; p <= 1; p += 0.05) assert.ok(sunPosition(p).z < 0, 'behind the plant, so it is seen above it');
  assert.deepEqual(sunPosition(-1), sunPosition(0));
  assert.deepEqual(sunPosition(7), sunPosition(1));
});

test('turning the sun path moves it round the plant without changing its height or its distance', () => {
  for (const p of [0, 0.3, 0.5, 1]) {
    const flat = sunPosition(p);
    const turned = sunPosition(p, 0.4);
    near(turned.y, flat.y);
    near(Math.hypot(turned.x, turned.z), Math.hypot(flat.x, flat.z), 1e-9);
    assert.ok(turned.z < 0, 'still behind the plant');
  }
  // Turned a quarter, "behind" becomes the left, so the noon sun is out to the side.
  const side = sunPosition(0.5, Math.PI / 2);
  assert.ok(Math.abs(side.x) > 10 && Math.abs(side.z) < 1e-9);
});

test('the sky keeps its colour through the day and fades towards dusk as the sun sets', () => {
  const sky = weatherLook('sunny').sky;
  assert.equal(skyAt(sky, 0), sky);
  assert.equal(skyAt(sky, 0.5), sky);
  assert.equal(skyAt(sky, 0.7), sky);
  assert.ok(brightness(skyAt(sky, 0.85)) < brightness(sky));
  assert.ok(brightness(skyAt(sky, 1)) < brightness(skyAt(sky, 0.85)));
});

test('the rain is the same every time for a seed, stays inside its box and falls at a believable speed', () => {
  const options = { count: 120, seed: 9, width: 12, depth: 10, height: 14 };
  const drops = rainLayout(options);
  assert.equal(drops.length, 120);
  assert.deepEqual(drops, rainLayout(options), 'the same seed gives the same rain');
  assert.notDeepEqual(drops, rainLayout({ ...options, seed: 10 }));
  for (const d of drops) {
    assert.ok(Math.abs(d.x) <= 6 && Math.abs(d.z) <= 5 && d.y >= 0 && d.y <= 14);
    assert.ok(d.speed >= 9 && d.speed <= 14);
  }
  assert.ok(new Set(drops.map((d) => d.y.toFixed(2))).size > 100, 'the drops start at different heights, so the rain is not in lines');
  assert.deepEqual(rainLayout({ ...options, count: 0 }), []);
});
