import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../src/engine/utils/random.js';
import { GameError } from '../../src/engine/utils/errors.js';
import { LEVELS, LEVEL_IDS, roundKey } from '../../src/games/plant-grower/logic/levels.js';
import { validatePlants, plantsFor, NEEDS, MAX_NEED, STAGE_COUNT } from '../../src/games/plant-grower/logic/plants.js';
import { createWeather, WEATHER, DAYS, RAIN_WATER, HEAT_WATER_LOSS, CLOUD_CAP } from '../../src/games/plant-grower/logic/weather.js';
import { needScore, effectiveInputs, nextDay, createPlant, starsForHealth, roundScore, isFinished, START_HEALTH, GROW_AT, WILT_BELOW, MAX_STAGE } from '../../src/games/plant-grower/logic/simulation.js';
import { diagnose, worstNeed, problemFor, dayMessage, explainDay, PROBLEMS, HAPPY } from '../../src/games/plant-grower/logic/messages.js';

const GAME = new URL('../../src/games/plant-grower/', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('data/plants.json', GAME), 'utf8'));
const plants = validatePlants(raw);
const plant = (id) => plants.find((p) => p.id === id);
const sunflower = plant('sunflower');
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);
const clone = (v) => structuredClone(v);
const I = (water, sun, food) => ({ water, sun, food });

/** The inputs a child who knows the plant would choose for a day: the best sum of scores after weather. */
function bestInputs(p, weather) {
  let best = null;
  for (let w = 0; w <= MAX_NEED; w++) for (let s = 0; s <= MAX_NEED; s++) for (let f = 0; f <= MAX_NEED; f++) {
    const e = effectiveInputs(I(w, s, f), weather);
    const sum = NEEDS.reduce((total, n) => total + needScore(e[n], p.ideal[n]), 0);
    if (!best || sum > best.sum) best = { inputs: I(w, s, f), sum };
  }
  return best.inputs;
}
function growWeek(p, weather) {
  let state = createPlant();
  for (let day = 0; day < DAYS; day++) state = nextDay(state, bestInputs(p, weather[day]), p, weather[day]).state;
  return state;
}

// ---- data --------------------------------------------------------------------------------------

test('the plant file has sunflower, tomato, cactus and rice, with the ranges from the spec', () => {
  assert.deepEqual(plants.map((p) => p.id), ['sunflower', 'tomato', 'cactus', 'rice']);
  assert.deepEqual(plant('sunflower').ideal.water, [5, 7]);
  assert.deepEqual(plant('cactus').ideal.water, [1, 2]);
  assert.deepEqual(plant('rice').ideal.water, [8, 10]);
  for (const p of plants) {
    assert.equal(p.stages.length, STAGE_COUNT, p.id);
    for (const n of NEEDS) assert.ok(p.ideal[n][0] >= 0 && p.ideal[n][1] <= MAX_NEED && p.ideal[n][0] <= p.ideal[n][1], `${p.id} ${n}`);
  }
});

test('each level offers the right seeds: Easy sunflower; Medium adds tomato and cactus; Hard adds rice', () => {
  assert.deepEqual(plantsFor(plants, 'easy').map((p) => p.id), ['sunflower']);
  assert.deepEqual(plantsFor(plants, 'medium').map((p) => p.id), ['sunflower', 'tomato', 'cactus']);
  assert.deepEqual(plantsFor(plants, 'hard').map((p) => p.id), ['sunflower', 'tomato', 'cactus', 'rice']);
  assert.equal(roundKey('rice', 'hard'), 'rice-hard');
});

test('validatePlants names the file and field for each kind of mistake', () => {
  const cases = [
    ['a range with low above high', (d) => { d.plants[0].ideal.water = [7, 5]; }, /plants\[0\]\.ideal\.water/],
    ['a range outside 0 to 10', (d) => { d.plants[1].ideal.sun = [6, 11]; }, /plants\[1\]\.ideal\.sun/],
    ['a range that is not whole numbers', (d) => { d.plants[0].ideal.food = [4.5, 6]; }, /plants\[0\]\.ideal\.food/],
    ['a missing need', (d) => { delete d.plants[2].ideal.food; }, /plants\[2\]\.ideal\.food/],
    ['seven stages', (d) => { d.plants[0].stages.pop(); }, /plants\[0\]\.stages.*exactly 8/],
    ['a blank stage name', (d) => { d.plants[0].stages[3] = ' '; }, /plants\[0\]\.stages/],
    ['a repeated id', (d) => { d.plants[1].id = 'sunflower'; }, /appears twice/],
    ['a bad level', (d) => { d.plants[0].unlock = 'expert'; }, /plants\[0\]\.unlock/],
    ['no fact', (d) => { d.plants[0].fact = ''; }, /plants\[0\]\.fact/],
    ['no Easy plant', (d) => { d.plants[0].unlock = 'medium'; }, /needs a plant for the Easy level/],
    ['no plants', (d) => { d.plants = []; }, /plants/],
  ];
  for (const [what, mutate, expected] of cases) {
    const bad = clone(raw);
    mutate(bad);
    assert.throws(() => validatePlants(bad), (e) => e instanceof GameError && e.code === 'INVALID_DATA' && /^plants\.json:/.test(e.message) && expected.test(e.message), what);
  }
});

// ---- need score -------------------------------------------------------------------------------

test('a need scores 1 inside the ideal range, edges included', () => {
  for (const v of [5, 6, 7]) assert.equal(needScore(v, [5, 7]), 1, String(v));
  assert.equal(needScore(2, [2, 2]), 1);
});

test('a need scores 0.5 when it is one or two outside the range, on either side', () => {
  for (const v of [3, 4, 8, 9]) assert.equal(needScore(v, [5, 7]), 0.5, String(v));
  assert.equal(needScore(0, [1, 2]), 0.5);
  assert.equal(needScore(4, [1, 2]), 0.5);
});

test('a need scores 0 when it is three or more outside the range', () => {
  for (const v of [0, 1, 2, 10]) assert.equal(needScore(v, [5, 7]), 0, String(v));
  assert.equal(needScore(10, [1, 2]), 0);
  assert.equal(needScore(5, [8, 10]), 0);
  assert.equal(needScore(0, [8, 10]), 0);
});

// ---- weather ----------------------------------------------------------------------------------------

test('effective inputs: rain adds 3 water (never above 10), heat takes 3 away (never below 0), clouds cap sunlight at 4', () => {
  assert.deepEqual(effectiveInputs(I(5, 8, 5), 'sunny'), I(5, 8, 5));
  assert.deepEqual(effectiveInputs(I(5, 8, 5), 'rainy'), I(5 + RAIN_WATER, 8, 5));
  assert.deepEqual(effectiveInputs(I(9, 8, 5), 'rainy'), I(10, 8, 5));
  assert.deepEqual(effectiveInputs(I(5, 8, 5), 'cloudy'), I(5, CLOUD_CAP, 5));
  assert.deepEqual(effectiveInputs(I(5, 3, 5), 'cloudy'), I(5, 3, 5), 'below the cap is untouched');
  assert.deepEqual(effectiveInputs(I(5, 8, 5), 'heat'), I(5 - HEAT_WATER_LOSS, 8, 5));
  assert.deepEqual(effectiveInputs(I(2, 8, 5), 'heat'), I(0, 8, 5));
  for (const w of Object.keys(WEATHER)) assert.equal(effectiveInputs(I(4, 6, 7), w).food, 7, 'fertiliser is never changed by weather');
});

test('effectiveInputs refuses values the sliders cannot give, and unknown weather', () => {
  for (const bad of [I(-1, 5, 5), I(5, 11, 5), I(5, 5, 5.5), I(5, 5, NaN), I(5, 5, '5'), { water: 5, sun: 5 }, null]) {
    throwsCode(() => effectiveInputs(bad, 'sunny'), 'BAD_INPUT');
  }
  throwsCode(() => effectiveInputs(I(5, 5, 5), 'snow'), 'BAD_WEATHER');
});

test('the week\'s weather: Easy none, Medium one rain and one cloud, Hard adds two heat days in a row', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const easy = createWeather(createRng(seed), 'easy');
    assert.deepEqual(easy, Array(7).fill('sunny'));
    const medium = createWeather(createRng(seed), 'medium');
    assert.equal(medium.length, DAYS);
    assert.equal(medium.filter((w) => w === 'rainy').length, 1);
    assert.equal(medium.filter((w) => w === 'cloudy').length, 1);
    assert.equal(medium.filter((w) => w === 'sunny').length, 5);
    const hard = createWeather(createRng(seed), 'hard');
    assert.equal(hard.filter((w) => w === 'rainy').length, 1);
    assert.equal(hard.filter((w) => w === 'cloudy').length, 1);
    assert.equal(hard.filter((w) => w === 'heat').length, 2);
    const first = hard.indexOf('heat');
    assert.equal(hard[first + 1], 'heat', `the heat wave is back to back (seed ${seed})`);
  }
});

test('the weather is repeatable for a seed, varies between seeds and every day of the week can get an event', () => {
  const make = (seed) => createWeather(createRng(seed), 'hard');
  assert.deepEqual(make(7), make(7));
  assert.notDeepEqual(make(7), make(8));
  const rainDays = new Set();
  for (let seed = 1; seed <= 300; seed++) rainDays.add(make(seed).indexOf('rainy'));
  assert.equal(rainDays.size, DAYS);
  throwsCode(() => createWeather(createRng(1), 'expert'), 'BAD_LEVEL');
});

test('every kind of weather has an icon, a label and a sentence saying what it does', () => {
  assert.deepEqual(Object.keys(WEATHER), ['sunny', 'rainy', 'cloudy', 'heat']);
  for (const w of Object.values(WEATHER)) assert.ok(w.icon && w.label && w.effect.length > 10 && /^(it is|there is) /.test(w.because), w.label);
  assert.match(WEATHER.rainy.effect, /adds 3 water/);
});

// ---- nextDay ------------------------------------------------------------------------------------------

test('a day with every need in range gives +10 health and a new stage', () => {
  const { state, log } = nextDay({ ...createPlant(), health: 70 }, I(6, 8, 5), sunflower, 'sunny');
  assert.equal(log.rawChange, 10);
  assert.equal(log.healthChange, 10);
  assert.equal(state.health, 80);
  assert.equal(state.stage, 1);
  assert.equal(log.advanced, true);
  assert.equal(state.day, 1);
  assert.equal(log.day, 1);
  assert.deepEqual(log.scores, { water: 1, sun: 1, food: 1 });
  assert.equal(log.weather, 'sunny');
  assert.deepEqual(log.inputs, I(6, 8, 5));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0], log);
});

test('near the range: three near misses give -5, and each combination follows 10 x (sum - 2)', () => {
  const near = nextDay(createPlant(), I(4, 6, 3), sunflower, 'sunny').log; // 0.5 + 0.5 + 0.5
  assert.deepEqual(near.scores, { water: 0.5, sun: 0.5, food: 0.5 });
  assert.equal(near.rawChange, -5);
  const table = [
    [I(6, 8, 5), 10], // 3
    [I(4, 8, 5), 5], // 2.5
    [I(1, 8, 5), 0], // 2
    [I(4, 6, 5), 0], // 2
    [I(4, 6, 3), -5], // 1.5
    [I(1, 6, 5), -5], // 1.5
    [I(1, 3, 5), -10], // 1
    [I(1, 3, 3), -15], // 0.5
    [I(1, 3, 0), -20], // 0
  ];
  for (const [inputs, expected] of table) assert.equal(nextDay(createPlant(), inputs, sunflower, 'sunny').log.rawChange, expected, JSON.stringify(inputs));
});

test('out of range on everything gives -20, and health goes down but never below 0', () => {
  const one = nextDay(createPlant(), I(0, 0, 10), sunflower, 'sunny');
  assert.equal(one.log.rawChange, -20);
  assert.equal(one.state.health, 50);
  let state = createPlant();
  for (let i = 0; i < DAYS; i++) state = nextDay(state, I(0, 0, 10), sunflower, 'sunny').state;
  assert.equal(state.health, 0, '70 - 20 - 20 - 20 then held at 0');
  assert.ok(state.history.every((l) => l.health >= 0));
  assert.equal(state.history[3].healthChange, -10, 'the change shown is what really happened after the limit (10 -> 0)');
  assert.equal(state.history[3].rawChange, -20);
});

test('health is held at 100 as well', () => {
  let state = createPlant();
  for (let i = 0; i < DAYS; i++) state = nextDay(state, I(6, 8, 5), sunflower, 'sunny').state;
  assert.equal(state.health, 100);
  assert.deepEqual(state.history.map((l) => l.health), [80, 90, 100, 100, 100, 100, 100]);
  assert.equal(state.history[3].healthChange, 0, '100 stays 100');
  assert.equal(state.history[3].rawChange, 10, 'the formula still says +10');
});

test('the plant grows a stage at 60 health or more at the end of the day, stays at 30 to 59, and wilts below 30', () => {
  const day = (health, inputs) => nextDay({ ...createPlant(), health }, inputs, sunflower, 'sunny');
  // +0 changes: exactly on the thresholds
  assert.equal(day(60, I(1, 8, 5)).log.advanced, true, '60 grows');
  assert.equal(day(59, I(1, 8, 5)).log.advanced, false, '59 stays');
  assert.equal(day(30, I(1, 8, 5)).log.advanced, false);
  assert.equal(day(30, I(1, 8, 5)).log.wilting, false, '30 does not wilt');
  assert.equal(day(29, I(1, 8, 5)).log.wilting, true, '29 wilts');
  assert.equal(day(29, I(1, 8, 5)).state.stage, 0, 'a wilting plant keeps its stage');
  // the check is made after the day's change
  assert.equal(day(55, I(6, 8, 5)).log.advanced, true, '55 + 10 = 65 grows');
  assert.equal(day(65, I(1, 3, 0)).log.advanced, false, '65 - 20 = 45 does not');
});

test('a wilting plant can recover', () => {
  let r = nextDay({ ...createPlant(), health: 10, stage: 2 }, I(0, 0, 0), sunflower, 'sunny');
  assert.equal(r.state.health, 0);
  assert.equal(r.log.wilting, true);
  assert.equal(r.state.stage, 2);
  let state = r.state;
  const wilting = [];
  for (let i = 0; i < 6; i++) {
    r = nextDay(state, I(6, 8, 5), sunflower, 'sunny');
    state = r.state;
    wilting.push(r.log.wilting);
  }
  assert.deepEqual(state.history.map((l) => l.health), [0, 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(wilting, [true, true, false, false, false, false], 'it stops wilting once health reaches 30');
  assert.equal(state.stage, 3, 'and it grows again as soon as health reaches 60');
  assert.equal(state.day, 7);
});

test('the stage never goes beyond the last one', () => {
  let state = { ...createPlant(), stage: MAX_STAGE };
  state = nextDay(state, I(6, 8, 5), sunflower, 'sunny').state;
  assert.equal(state.stage, MAX_STAGE);
  assert.equal(nextDay({ ...createPlant(), stage: MAX_STAGE }, I(6, 8, 5), sunflower, 'sunny').log.advanced, false);
});

test('nextDay is deterministic and leaves the old state alone', () => {
  const state = createPlant();
  const a = nextDay(state, I(4, 9, 7), plant('tomato'), 'rainy');
  const b = nextDay(state, I(4, 9, 7), plant('tomato'), 'rainy');
  assert.deepEqual(a, b);
  assert.deepEqual(state, createPlant(), 'the old state is not changed');
  const inputs = I(4, 9, 7);
  const r = nextDay(state, inputs, sunflower, 'sunny');
  inputs.water = 0;
  assert.equal(r.log.inputs.water, 4, 'the log keeps its own copy of the inputs');
});

test('weather changes the result: rain and a naive child get +5 instead of +10, and the log shows both numbers', () => {
  const calm = nextDay(createPlant(), I(6, 8, 5), sunflower, 'sunny').log;
  const rain = nextDay(createPlant(), I(6, 8, 5), sunflower, 'rainy').log;
  assert.equal(calm.rawChange, 10);
  assert.equal(rain.rawChange, 5, '6 + 3 = 9 is two above 5-7: near');
  assert.deepEqual(rain.inputs, I(6, 8, 5));
  assert.deepEqual(rain.effective, I(9, 8, 5));
  assert.equal(nextDay(createPlant(), I(3, 8, 5), sunflower, 'rainy').log.rawChange, 10, 'the child who lowers the water gets +10');
  assert.equal(nextDay(createPlant(), I(6, 9, 5), sunflower, 'cloudy').log.rawChange, 0, 'cloud caps the sun at 4: out of range for a sunflower');
});

test('after day 7 there is no day 8', () => {
  let state = createPlant();
  assert.equal(isFinished(state), false);
  for (let i = 0; i < DAYS; i++) state = nextDay(state, I(6, 8, 5), sunflower, 'sunny').state;
  assert.equal(isFinished(state), true);
  throwsCode(() => nextDay(state, I(6, 8, 5), sunflower, 'sunny'), 'ALREADY_FINISHED');
});

test('a neglected plant never dies: it ends at 0 health, still a seed, with 1 star and only kind words', () => {
  let state = createPlant();
  for (let i = 0; i < DAYS; i++) state = nextDay(state, I(0, 0, 0), sunflower, 'sunny').state;
  assert.equal(state.health, 0);
  assert.equal(state.stage, 0, 'it never grew');
  assert.equal(starsForHealth(state.health), 1);
  assert.ok(state.history.every((l) => l.message.length > 10 && !/dead|die/i.test(l.message)));
});

// ---- stars ------------------------------------------------------------------------------------------------

test('stars: 80 health or more = 3, 60 or more = 2, otherwise 1', () => {
  assert.deepEqual([100, 80, 79, 60, 59, 1, 0].map(starsForHealth), [3, 3, 2, 2, 1, 1, 1]);
  assert.equal(roundScore({ health: 90, stage: 7 }), 160);
  assert.equal(START_HEALTH, 70);
  assert.equal(GROW_AT, 60);
  assert.equal(WILT_BELOW, 30);
});

test('every plant can reach 3 stars and the final stage with ideal inputs, at every level, for any week of weather', () => {
  for (const levelId of LEVEL_IDS) {
    for (const p of plantsFor(plants, levelId)) {
      for (let seed = 1; seed <= 120; seed++) {
        const weather = createWeather(createRng(seed), levelId);
        const state = growWeek(p, weather);
        assert.equal(starsForHealth(state.health), 3, `${p.id} ${levelId} seed ${seed}: health ${state.health} with ${weather}`);
        assert.equal(state.stage, MAX_STAGE, `${p.id} ${levelId} seed ${seed} reaches the last stage`);
        assert.ok(state.history.every((l) => l.health >= GROW_AT && l.healthChange >= 0), 'ideal play never hurts the plant');
      }
    }
  }
});

test('ideal play is never beaten by ignoring the weather in Medium and Hard (weather matters)', () => {
  const rainy = ['sunny', 'sunny', 'rainy', 'sunny', 'cloudy', 'sunny', 'sunny'];
  const middle = (p) => I(...NEEDS.map((n) => Math.round((p.ideal[n][0] + p.ideal[n][1]) / 2)));
  let naive = createPlant();
  for (let d = 0; d < DAYS; d++) naive = nextDay(naive, middle(sunflower), sunflower, rainy[d]).state;
  const smart = growWeek(sunflower, rainy);
  assert.ok(naive.health < smart.health || naive.history.some((l) => l.healthChange < 10), 'the weather costs a child who ignores it');
  assert.equal(naive.history[2].rawChange, 5, 'rain: 6 + 3 = 9');
  assert.equal(naive.history[4].rawChange, 0, 'cloud: sun capped at 4');
});

// ---- messages ----------------------------------------------------------------------------------------------

const logFor = (inputs, weather = 'sunny', p = sunflower) => nextDay(createPlant(), inputs, p, weather).log;

test('diagnose says low, ok or high for each need, and by how much', () => {
  const log = logFor(I(2, 8, 9));
  const d = diagnose(log.effective, sunflower, log.scores);
  assert.deepEqual(d.map((x) => [x.need, x.direction, x.distance, x.score]), [['water', 'low', 3, 0], ['sun', 'ok', 0, 1], ['food', 'high', 3, 0]]);
});

test('the worst need is the lowest score, then the furthest away, then water before sun before fertiliser', () => {
  const pick = (inputs) => worstNeed(diagnose(...(() => { const l = logFor(inputs); return [l.effective, sunflower, l.scores]; })()))?.need ?? null;
  assert.equal(pick(I(6, 8, 5)), null, 'all just right');
  assert.equal(pick(I(2, 8, 5)), 'water');
  assert.equal(pick(I(4, 3, 5)), 'sun', 'sun is 4 below (score 0), water only 1 below (0.5)');
  assert.equal(pick(I(2, 3, 5)), 'sun', 'both score 0: sun is further out (4 against 3)');
  assert.equal(pick(I(1, 8, 9)), 'water', 'water is 4 below the range, fertiliser only 3 above');
  assert.equal(pick(I(2, 6, 9)), 'water', 'a tie in distance goes to water first');
  assert.equal(pick(I(6, 8, 0)), 'food');
});

test('each way to go wrong has its own kid-friendly sentence, and none is unkind', () => {
  assert.deepEqual(Object.keys(PROBLEMS).sort(), ['food-high', 'food-low', 'sun-high', 'sun-low', 'water-high', 'water-low']);
  assert.match(PROBLEMS['water-low'].bubble, /thirsty/);
  assert.match(PROBLEMS['water-high'].message, /puddle/);
  assert.match(PROBLEMS['sun-high'].message, /sweat/);
  for (const p of [...Object.values(PROBLEMS), HAPPY]) {
    assert.ok(p.id && p.icon && p.bubble && p.message.length > 15, p.id);
    assert.ok(!/bad|dead|die|fail|stupid|wrong/i.test(p.message), p.id);
  }
  assert.equal(problemFor(null), HAPPY);
  assert.equal(dayMessage(logFor(I(6, 8, 5)), sunflower), HAPPY.message);
  assert.equal(dayMessage(logFor(I(1, 8, 5)), sunflower), PROBLEMS['water-low'].message);
  assert.equal(dayMessage(logFor(I(10, 8, 5)), sunflower), PROBLEMS['water-high'].message);
  assert.equal(dayMessage(logFor(I(6, 8, 5), 'sunny'), sunflower), logFor(I(6, 8, 5)).message);
});

test('the journal explains a day with numbers, what the plant likes, and the weather', () => {
  const log = logFor(I(6, 9, 5), 'rainy');
  const lines = explainDay(log, sunflower);
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^Water was 9 \(you set 6, the weather made it 9\), but this plant likes 5 to 7: too wet\./);
  assert.match(lines[1], /^Sunlight was 9: just right\./);
  assert.match(lines[2], /^Fertiliser was 5: just right\./);
  assert.match(lines[3], /^Rainy: The rain adds 3 water/);
  const dry = explainDay(logFor(I(1, 2, 9)), sunflower);
  assert.match(dry[0], /too dry/);
  assert.match(dry[1], /too dark/);
  assert.match(dry[2], /too much/);
  assert.equal(dry.length, 3, 'no weather line on a sunny day');
  const cactus = explainDay(logFor(I(5, 9, 2), 'sunny', plant('cactus')), plant('cactus'));
  assert.match(cactus[0], /^Water was 5, but this plant likes 1 to 2: too wet\./);
  assert.match(explainDay(logFor(I(8, 9, 2), 'sunny', plant('cactus')), plant('cactus'))[2], /^Fertiliser was 2: just right\./);
});

test('every message for every plant at every input is a sentence with no gaps', () => {
  for (const p of plants) {
    for (const w of Object.keys(WEATHER)) {
      for (let a = 0; a <= 10; a += 2) for (let b = 0; b <= 10; b += 2) for (let c = 0; c <= 10; c += 2) {
        const log = nextDay(createPlant(), I(a, b, c), p, w).log;
        assert.ok(log.message.length > 10 && !/undefined|NaN/.test(log.message));
        for (const line of explainDay(log, p)) assert.ok(!/undefined|NaN/.test(line), line);
      }
    }
  }
});

// ---- levels ---------------------------------------------------------------------------------------------------

test('levels: only Easy marks the ideal range; hints go full, bubble, none; weather grows with the level', () => {
  assert.deepEqual(LEVEL_IDS.map((l) => LEVELS[l].showRanges), [true, false, false]);
  assert.deepEqual(LEVEL_IDS.map((l) => LEVELS[l].hints), ['full', 'bubble', 'none']);
  assert.deepEqual(LEVELS.easy.weather, { rain: 0, cloud: 0, heatDays: 0 });
  assert.deepEqual(LEVELS.hard.weather, { rain: 1, cloud: 1, heatDays: 2 });
});
