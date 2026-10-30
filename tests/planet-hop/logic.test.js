import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../src/engine/utils/random.js';
import { GameError } from '../../src/engine/utils/errors.js';
import { validatePlanets, byId, weighStops, ordinal } from '../../src/games/planet-hop/logic/planets.js';
import { parseWeight, feltWeight, pullOf, explainWeight, formatKg, MIN_KG, MAX_KG, WEIGHT_MESSAGE } from '../../src/games/planet-hop/logic/weight.js';
import { createLineup, isCorrectSlot, place, allPlaced, hintFor, lineupStars, lineupScore } from '../../src/games/planet-hop/logic/lineup.js';
import { createSizer, MIN_DIAMETER, MAX_DIAMETER } from '../../src/games/planet-hop/logic/scale.js';
import { buildMystery, distinguishable, MIN_SEPARATION } from '../../src/games/planet-hop/logic/mystery.js';
import { validateQuiz, buildQuiz } from '../../src/games/planet-hop/logic/quiz.js';
import { rankFor, questionStars, questionScore, RANKS } from '../../src/games/planet-hop/logic/scoring.js';
import { LEVELS, LEVEL_IDS, MODES, MODE_IDS, levelKey, QUIZ_QUESTIONS, MYSTERY_QUESTIONS } from '../../src/games/planet-hop/logic/levels.js';

const GAME = new URL('../../src/games/planet-hop/', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(`data/${file}`, GAME), 'utf8'));
const clone = (value) => structuredClone(value);
const data = validatePlanets(read('planets.json'));
const { planets, bonus } = data;
const quizItems = validateQuiz(read('quiz.json'), planets);
const bodies = weighStops(data);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

// ---- data ----------------------------------------------------------------------------------

test('the planet file has 8 planets with orbit numbers 1 to 8, nearest the Sun first', () => {
  assert.equal(planets.length, 8);
  assert.deepEqual(planets.map((p) => p.order), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(planets.map((p) => p.name), ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']);
  for (let i = 1; i < planets.length; i++) assert.ok(planets[i].distanceAU > planets[i - 1].distanceAU);
});

test('gravity comes from the file and matches the spec table (Earth = 1)', () => {
  const g = Object.fromEntries([...planets, ...bonus].map((b) => [b.id, b.gravity]));
  assert.deepEqual(g, { mercury: 0.38, venus: 0.91, earth: 1, mars: 0.38, jupiter: 2.53, saturn: 1.07, uranus: 0.9, neptune: 1.14, moon: 0.17 });
});

test('every body has a fact and a look, and the Moon is the bonus stop after Earth', () => {
  for (const body of [...planets, ...bonus]) {
    assert.ok(body.fact.length > 20, body.id);
    assert.ok(body.look.length > 3, body.id);
  }
  assert.deepEqual(weighStops(data).map((b) => b.id), ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
});

test('validatePlanets names the file and field for each kind of mistake', () => {
  const cases = [
    ['no planets', (d) => { d.planets = []; }, /planets\.json: planets/],
    ['an orbit number missing', (d) => { d.planets[3].order = 9; }, /orbit numbers must be 1 to 8/],
    ['an orbit number repeated', (d) => { d.planets[3].order = 3; }, /orbit numbers must be 1 to 8/],
    ['a planet nearer than the one before', (d) => { d.planets[4].distanceAU = 0.5; }, /planets\.jupiter\.distanceAU/],
    ['a bad colour', (d) => { d.planets[0].color = 'grey'; }, /planets\[0\]\.color/],
    ['three decimals of gravity', (d) => { d.planets[0].gravity = 0.377; }, /planets\[0\]\.gravity.*two decimals/],
    ['zero gravity', (d) => { d.planets[0].gravity = 0; }, /planets\[0\]\.gravity/],
    ['a repeated id', (d) => { d.planets[1].id = 'mercury'; }, /"mercury" appears twice/],
    ['no fact', (d) => { d.planets[2].fact = ' '; }, /planets\[2\]\.fact/],
    ['a bonus body that orbits nothing', (d) => { d.bonus[0].orbits = 'pluto'; }, /bonus\[0\]\.orbits/],
    ['a bonus id clashing with a planet', (d) => { d.bonus[0].id = 'earth'; }, /"earth" appears twice/],
  ];
  for (const [what, mutate, expected] of cases) {
    const raw = clone(read('planets.json'));
    mutate(raw);
    assert.throws(() => validatePlanets(raw), (e) => e instanceof GameError && e.code === 'INVALID_DATA' && expected.test(e.message), what);
  }
});

test('ordinal numbers: 1st, 2nd, 3rd, 4th, 11th to 13th, 21st', () => {
  const got = [1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal);
  assert.deepEqual(got, ['1st', '2nd', '3rd', '4th', '8th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  for (const bad of [0, -1, 1.5, NaN, '3']) throwsCode(() => ordinal(bad), 'BAD_NUMBER');
});

// ---- weight ------------------------------------------------------------------------------------

test('parseWeight accepts whole numbers and decimals from 10 to 150, with a dot or a comma', () => {
  assert.equal(parseWeight('32'), 32);
  assert.equal(parseWeight(' 32.5 '), 32.5);
  assert.equal(parseWeight('32,5'), 32.5);
  assert.equal(parseWeight(MIN_KG), 10);
  assert.equal(parseWeight(String(MAX_KG)), 150);
});

test('parseWeight refuses anything else with the friendly message', () => {
  for (const bad of ['', '   ', 'abc', '12abc', '1e2', '-5', '9', '9.9', '150.1', '151', '0', 'NaN', 'Infinity', NaN, Infinity, null, undefined, '1,2,3', '.5', '5.']) {
    assert.throws(() => parseWeight(bad), (e) => e instanceof GameError && e.code === 'BAD_WEIGHT' && e.message === WEIGHT_MESSAGE, `input ${String(bad)}`);
  }
  assert.equal(WEIGHT_MESSAGE, 'Please enter a number between 10 and 150');
});

test('feltWeight is the weight times the gravity, to one decimal', () => {
  assert.equal(feltWeight(40, 0.38), 15.2);
  assert.equal(feltWeight(30, 2.53), 75.9);
  assert.equal(feltWeight(20, 1), 20);
  assert.equal(feltWeight(10, 0.17), 1.7);
  assert.equal(feltWeight(150, 2.53), 379.5);
});

test('feltWeight rounds halves up exactly, without floating-point surprises', () => {
  assert.equal(feltWeight(25, 0.91), 22.8, '22.75 rounds up');
  assert.equal(feltWeight(32.5, 2.53), 82.2, '82.225 rounds down');
  assert.equal(feltWeight(45, 0.17), 7.7, '7.65 rounds up');
  assert.equal(feltWeight(35, 0.17), 6, '5.95 rounds up to 6.0');
});

test('feltWeight is always within half a tenth of the exact product', () => {
  for (const body of [...planets, ...bonus]) {
    for (let kg = MIN_KG; kg <= MAX_KG; kg += 0.5) {
      assert.ok(Math.abs(feltWeight(kg, body.gravity) - kg * body.gravity) <= 0.05 + 1e-9, `${kg} kg on ${body.id}`);
    }
  }
});

test('feltWeight refuses a weight or gravity it cannot use', () => {
  for (const kg of [9.9, 150.1, 0, -20, NaN, Infinity]) throwsCode(() => feltWeight(kg, 1), 'BAD_WEIGHT');
  for (const g of [0, -1, NaN, Infinity, '1', null, undefined]) throwsCode(() => feltWeight(40, g), 'BAD_GRAVITY');
});

test('the explanation says whether the pull is less, more or the same, and that the child is unchanged', () => {
  const venus = byId(planets).get('venus');
  const jupiter = byId(planets).get('jupiter');
  const earth = byId(planets).get('earth');
  assert.equal(pullOf(venus.gravity), 'less');
  assert.equal(pullOf(jupiter.gravity), 'more');
  assert.equal(pullOf(earth.gravity), 'same');
  assert.match(explainWeight(venus), /^Venus pulls on you less than Earth does, so you feel lighter\. Your body is exactly the same!$/);
  assert.match(explainWeight(jupiter), /pulls on you more.*heavier.*exactly the same/);
  assert.match(explainWeight(earth), /just as hard as Earth does.*exactly the same/);
  assert.equal(formatKg(20), '20.0 kg');
  assert.equal(formatKg(15.2), '15.2 kg');
});

// ---- line-up -----------------------------------------------------------------------------------

test('a new line-up floats all 8 planets in a mixed-up order, never the right one', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const state = createLineup(planets, createRng(seed));
    assert.deepEqual([...state.pool].sort(), planets.map((p) => p.id).sort());
    assert.notDeepEqual(state.pool, planets.map((p) => p.id), `seed ${seed}`);
    assert.deepEqual(state.placed, Array(8).fill(null));
    assert.equal(state.wrongDrops, 0);
  }
});

test('isCorrectSlot comes from the planet data: slot 0 is the first planet', () => {
  assert.equal(isCorrectSlot(planets, 'mercury', 0), true);
  assert.equal(isCorrectSlot(planets, 'mars', 3), true);
  assert.equal(isCorrectSlot(planets, 'mars', 2), false);
  assert.equal(isCorrectSlot(planets, 'neptune', 7), true);
  throwsCode(() => isCorrectSlot(planets, 'pluto', 0), 'UNKNOWN_PLANET');
});

test('a right drop puts the planet in orbit; a wrong drop changes nothing but the count and gives a hint', () => {
  let state = createLineup(planets, createRng(3));
  const wrong = place(state, 'mars', 0);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.hint, 'Mars is the 4th planet, the red one.');
  assert.equal(wrong.state.wrongDrops, 1);
  assert.deepEqual(wrong.state.pool, state.pool);
  assert.deepEqual(wrong.state.placed, state.placed);
  assert.equal(state.wrongDrops, 0, 'the old state is not changed');

  const right = place(wrong.state, 'mars', 3);
  assert.equal(right.correct, true);
  assert.equal(right.hint, null);
  assert.equal(right.state.placed[3], 'mars');
  assert.ok(!right.state.pool.includes('mars'));
  assert.equal(right.state.wrongDrops, 1);
});

test('placing planets one at a time finishes the line-up, and allPlaced is true only then', () => {
  let state = createLineup(planets, createRng(11));
  assert.equal(allPlaced(state), false);
  for (const planet of planets) {
    assert.equal(allPlaced(state), false);
    state = place(state, planet.id, planet.order - 1).state;
  }
  assert.equal(allPlaced(state), true);
  assert.deepEqual(state.placed, planets.map((p) => p.id));
  assert.equal(state.wrongDrops, 0);
});

test('place refuses things the screen never offers, with clear codes', () => {
  let state = createLineup(planets, createRng(5));
  state = place(state, 'mercury', 0).state;
  throwsCode(() => place(state, 'mercury', 1), 'ALREADY_PLACED');
  throwsCode(() => place(state, 'venus', 0), 'SLOT_TAKEN');
  throwsCode(() => place(state, 'venus', 8), 'BAD_SLOT');
  throwsCode(() => place(state, 'venus', -1), 'BAD_SLOT');
  throwsCode(() => place(state, 'venus', 1.5), 'BAD_SLOT');
  throwsCode(() => place(state, 'pluto', 1), 'UNKNOWN_PLANET');
});

test('the hint for every planet reads like "Mars is the 4th planet, the red one."', () => {
  for (const planet of planets) assert.equal(hintFor(planet), `${planet.name} is the ${ordinal(planet.order)} planet, ${planet.look}.`);
});

test('line-up stars: 0 or 1 wrong drops = 3, 2 or 3 = 2, more = 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(lineupStars), [3, 3, 2, 2, 1, 1]);
  assert.equal(lineupScore(0), 100);
  assert.equal(lineupScore(3), 70);
  assert.equal(lineupScore(50), 10);
});

// ---- sizes -------------------------------------------------------------------------------------

test('compressed sizes keep the order of the planets, with Mercury at 24 px and Jupiter at 88 px', () => {
  const size = createSizer(planets);
  assert.equal(size(byId(planets).get('mercury')), MIN_DIAMETER);
  assert.equal(size(byId(planets).get('jupiter')), MAX_DIAMETER);
  const byRadius = [...planets].sort((a, b) => a.radiusKm - b.radiusKm);
  for (let i = 1; i < byRadius.length; i++) assert.ok(size(byRadius[i]) > size(byRadius[i - 1]), byRadius[i].id);
  for (const p of planets) assert.ok(size(p) >= 24 && size(p) <= 88);
});

test('real sizes have the true proportions, so Mercury is tiny', () => {
  const size = createSizer(planets, { real: true });
  const get = (id) => byId(planets).get(id);
  assert.equal(size(get('jupiter')), MAX_DIAMETER);
  assert.ok(Math.abs(size(get('jupiter')) / size(get('mercury')) - 69911 / 2440) < 1e-9);
  assert.ok(size(get('mercury')) < MIN_DIAMETER / 4);
  assert.ok(Math.abs(size(get('earth')) / size(get('mars')) - 6371 / 3390) < 1e-9);
});

test('a single body gets the full size instead of dividing by zero', () => {
  assert.equal(createSizer([{ radiusKm: 5 }])({ radiusKm: 5 }), MAX_DIAMETER);
});

// ---- mystery planet (end of the weigh-in) ---------------------------------------------------

test('distinguishable: Mercury and Mars (same gravity), Venus and Uranus, Earth and Saturn cannot be told apart', () => {
  const get = (id) => byId(bodies).get(id);
  assert.equal(MIN_SEPARATION, 1.08);
  assert.equal(distinguishable(get('mercury'), get('mars')), false);
  assert.equal(distinguishable(get('venus'), get('uranus')), false);
  assert.equal(distinguishable(get('earth'), get('saturn')), false);
  assert.equal(distinguishable(get('saturn'), get('neptune')), false);
  assert.equal(distinguishable(get('venus'), get('earth')), true);
  assert.equal(distinguishable(get('moon'), get('mercury')), true);
  assert.equal(distinguishable(get('jupiter'), get('neptune')), true);
});

test('every mystery question has one answer: options differ clearly and their felt weights are all different', () => {
  const lookup = byId(bodies);
  for (const optionCount of [3, 4, 5]) {
    for (let seed = 1; seed <= 150; seed++) {
      const kg = [10, 23.5, 41, 87, 150][seed % 5];
      const questions = buildMystery({ bodies, kg, count: MYSTERY_QUESTIONS, optionCount, rng: createRng(seed) });
      assert.equal(questions.length, MYSTERY_QUESTIONS);
      assert.equal(new Set(questions.map((q) => q.answerId)).size, MYSTERY_QUESTIONS, 'different answers');
      for (const q of questions) {
        assert.equal(q.optionIds.length, optionCount);
        assert.ok(q.optionIds.includes(q.answerId));
        assert.equal(new Set(q.optionIds).size, optionCount);
        assert.equal(q.felt, feltWeight(kg, lookup.get(q.answerId).gravity));
        const options = q.optionIds.map((id) => lookup.get(id));
        for (const a of options) for (const b of options) if (a !== b) assert.ok(distinguishable(a, b), `${a.id} vs ${b.id}`);
        const felts = options.map((o) => feltWeight(kg, o.gravity));
        assert.equal(new Set(felts).size, optionCount, `felt weights ${felts} at ${kg} kg`);
        assert.equal(felts.filter((f) => f === q.felt).length, 1, 'only the answer matches the weight shown');
      }
    }
  }
});

test('mystery questions are repeatable for a seed and refuse impossible requests', () => {
  const make = () => buildMystery({ bodies, kg: 30, count: 5, optionCount: 4, rng: createRng(8) });
  assert.deepEqual(make(), make());
  throwsCode(() => buildMystery({ bodies, kg: 30, count: 10, optionCount: 3, rng: createRng(1) }), 'BAD_MYSTERY');
  throwsCode(() => buildMystery({ bodies, kg: 30, count: 5, optionCount: 9, rng: createRng(1) }), 'NOT_ENOUGH_OPTIONS');
  throwsCode(() => buildMystery({ bodies, kg: 5, count: 5, optionCount: 3, rng: createRng(1) }), 'BAD_WEIGHT');
});

// ---- quiz --------------------------------------------------------------------------------------

test('the quiz file is valid and has at least 10 questions of each level', () => {
  for (const level of LEVEL_IDS) assert.ok(quizItems.filter((q) => q.level === level).length >= 10, level);
});

test('quiz answers that follow from the planet data really do', () => {
  const lookup = byId(planets);
  const biggest = quizItems.find((q) => q.id === 'biggest');
  assert.equal(biggest.answerId, planets.reduce((a, b) => (b.radiusKm > a.radiusKm ? b : a)).id);
  assert.equal(quizItems.find((q) => q.id === 'closest').answerId, planets[0].id);
  assert.equal(quizItems.find((q) => q.id === 'farthest').answerId, planets[7].id);
  assert.equal(quizItems.find((q) => q.id === 'count').answerId, String(planets.length));
  assert.equal(lookup.get(quizItems.find((q) => q.id === 'heaviest').answerId).gravity, Math.max(...planets.map((p) => p.gravity)));
  assert.ok(quizItems.filter((q) => q.basedOn).length >= 12, 'most planet questions are tied to the data');
});

test('the Pluto question is there and its answer is "A dwarf planet"', () => {
  const pluto = quizItems.find((q) => /Pluto/.test(q.q));
  assert.ok(pluto);
  assert.equal(pluto.kind, 'text');
  assert.equal(pluto.answerId, 'A dwarf planet');
  assert.match(pluto.explain, /dwarf planet/);
});

test('validateQuiz catches a quiz that disagrees with the planets or itself', () => {
  const cases = [
    ['an answer that is not an option', (d) => { d.questions[0].answerId = 'neptune'; d.questions[0].optionIds = ['mercury', 'venus', 'earth']; }, /questions\[0\]\.answerId.*one of optionIds/],
    ['an unknown planet', (d) => { d.questions[1].optionIds[1] = 'pluto'; }, /"pluto" is not a planet/],
    ['"the biggest planet" changed to Saturn', (d) => { const q = d.questions.find((x) => x.id === 'biggest'); q.answerId = 'saturn'; }, /one planet with the largest radiusKm \(jupiter\)/],
    ['"the closest planet" changed to Venus', (d) => { const q = d.questions.find((x) => x.id === 'closest'); q.answerId = 'venus'; }, /smallest distanceAU \(mercury\)/],
    ['the third planet changed to Mars', (d) => { const q = d.questions.find((x) => x.id === 'home'); q.answerId = 'mars'; }, /"mars" has order 4, not 3/],
    ['a planet count that is wrong', (d) => { const q = d.questions.find((x) => x.id === 'count'); q.answerId = '9'; }, /is "9" but the planet file has 8/],
    ['a repeated id', (d) => { d.questions[1].id = d.questions[0].id; }, /appears twice/],
    ['a question asked twice', (d) => { d.questions[1].q = d.questions[0].q; }, /is asked twice/],
    ['a repeated option', (d) => { d.questions[0].optionIds[1] = d.questions[0].optionIds[0]; }, /repeated option/],
    ['too few options', (d) => { d.questions[0].optionIds = [d.questions[0].answerId, 'venus']; }, /at least 3/],
    ['a bad level', (d) => { d.questions[0].level = 'expert'; }, /level/],
    ['a bad kind', (d) => { d.questions[0].kind = 'picture'; }, /kind/],
    ['no explanation', (d) => { d.questions[0].explain = ''; }, /explain/],
    ['too few hard questions', (d) => { d.questions = d.questions.filter((q) => q.level !== 'hard'); }, /at least 10 hard questions/],
    ['no questions', (d) => { d.questions = []; }, /questions/],
  ];
  for (const [what, mutate, expected] of cases) {
    const raw = clone(read('quiz.json'));
    mutate(raw);
    assert.throws(() => validateQuiz(raw, planets), (e) => e instanceof GameError && e.code === 'INVALID_DATA' && /^quiz\.json:/.test(e.message) && expected.test(e.message), what);
  }
});

test('a quiz round has 10 different questions of the level, each with its answer among the right number of options', () => {
  for (const levelId of LEVEL_IDS) {
    const optionCount = LEVELS[levelId].quiz.options;
    for (let seed = 1; seed <= 60; seed++) {
      const round = buildQuiz({ items: quizItems, levelId, count: QUIZ_QUESTIONS, optionCount, rng: createRng(seed) });
      assert.equal(round.length, QUIZ_QUESTIONS);
      assert.equal(new Set(round.map((q) => q.id)).size, QUIZ_QUESTIONS);
      const levelOf = new Map(quizItems.map((q) => [q.id, q.level]));
      for (const q of round) {
        assert.equal(levelOf.get(q.id), levelId, 'Easy, Medium and Hard each have 10 of their own');
        assert.equal(q.optionIds.length, optionCount);
        assert.ok(q.optionIds.includes(q.answerId));
        assert.equal(new Set(q.optionIds).size, optionCount);
      }
    }
  }
});

test('the options are shuffled, so the answer is not always in the same place', () => {
  const places = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const round = buildQuiz({ items: quizItems, levelId: 'easy', count: 10, optionCount: 4, rng: createRng(seed) });
    for (const q of round) places.add(q.optionIds.indexOf(q.answerId));
  }
  assert.deepEqual([...places].sort(), [0, 1, 2, 3]);
});

test('a round is repeatable for a seed, and a different seed gives a different round', () => {
  const make = (seed) => buildQuiz({ items: quizItems, levelId: 'medium', count: 10, optionCount: 4, rng: createRng(seed) });
  assert.deepEqual(make(4), make(4));
  assert.notDeepEqual(make(4).map((q) => q.id), make(5).map((q) => q.id));
});

test('a level with too few questions of its own is topped up from easier ones, and never from harder ones', () => {
  const items = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, level: 'easy', kind: 'planet', q: `e${i}`, answerId: 'mars', optionIds: ['mars', 'venus', 'earth'], explain: 'x' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, level: 'medium', kind: 'planet', q: `m${i}`, answerId: 'mars', optionIds: ['mars', 'venus', 'earth'], explain: 'x' })),
    { id: 'h0', level: 'hard', kind: 'planet', q: 'h0', answerId: 'mars', optionIds: ['mars', 'venus', 'earth'], explain: 'x' },
  ];
  const round = buildQuiz({ items, levelId: 'medium', count: 10, optionCount: 3, rng: createRng(2) });
  assert.equal(round.length, 10);
  assert.equal(round.filter((q) => q.id.startsWith('m')).length, 4);
  assert.ok(!round.some((q) => q.id === 'h0'));
  assert.deepEqual(round.slice(0, 4).map((q) => q.id[0]), ['m', 'm', 'm', 'm'], "the level's own questions come first");
  throwsCode(() => buildQuiz({ items, levelId: 'easy', count: 10, optionCount: 3, rng: createRng(2) }), 'NOT_ENOUGH_QUESTIONS');
  throwsCode(() => buildQuiz({ items, levelId: 'expert', count: 10, optionCount: 3, rng: createRng(2) }), 'BAD_LEVEL');
});

// ---- scoring, levels ---------------------------------------------------------------------------------

test('ranks: Space Cadet, Astronaut at 8 stars, Commander at 20', () => {
  assert.deepEqual(RANKS.map((r) => r.label), ['Space Cadet', 'Astronaut', 'Commander']);
  assert.equal(rankFor(0).rank.label, 'Space Cadet');
  assert.equal(rankFor(7).rank.label, 'Space Cadet');
  assert.deepEqual([rankFor(7).next.label, rankFor(7).starsToNext], ['Astronaut', 1]);
  assert.equal(rankFor(8).rank.label, 'Astronaut');
  assert.equal(rankFor(19).rank.label, 'Astronaut');
  assert.equal(rankFor(20).rank.label, 'Commander');
  assert.deepEqual([rankFor(27).next, rankFor(27).starsToNext], [null, 0]);
  assert.ok(27 >= RANKS.at(-1).minStars, 'Commander can be reached: 3 modes x 3 levels x 3 stars = 27');
});

test('quiz stars use the default accuracy rule: 90% = 3, 70% = 2, else 1', () => {
  assert.deepEqual([10, 9, 8, 7, 6, 0].map((c) => questionStars(c, 10)), [3, 3, 2, 2, 1, 1]);
  assert.deepEqual([5, 4, 3, 0].map((c) => questionStars(c, 5)), [3, 2, 1, 1]);
  assert.equal(questionStars(0, 0), 1);
  assert.equal(questionScore(7), 70);
});

test('levels: Easy shows names and numbers, Medium only names, Hard only pictures; stars are saved per mode and level', () => {
  assert.deepEqual(LEVELS.easy.lineup, { showNames: true, showNumbers: true });
  assert.deepEqual(LEVELS.medium.lineup, { showNames: true, showNumbers: false });
  assert.deepEqual(LEVELS.hard.lineup, { showNames: false, showNumbers: false });
  assert.equal(LEVELS.easy.weigh.ownWeight, false);
  assert.equal(LEVELS.medium.weigh.ownWeight, true);
  assert.deepEqual(MODE_IDS, ['lineup', 'weigh', 'quiz']);
  assert.ok(Object.values(MODES).every((m) => m.label && m.icon && m.blurb));
  assert.equal(levelKey('lineup', 'easy'), 'lineup-easy');
  const keys = new Set(MODE_IDS.flatMap((m) => LEVEL_IDS.map((l) => levelKey(m, l))));
  assert.equal(keys.size, 9);
});
