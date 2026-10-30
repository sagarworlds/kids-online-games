import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameError } from '../../src/engine/utils/errors.js';
import { LEVELS, LEVEL_IDS, HINT_AFTER_CHECKS } from '../../src/games/food-chain-builder/logic/levels.js';
import { validateOrganisms, byId, canEat, ROLES } from '../../src/games/food-chain-builder/logic/organisms.js';
import { validateHabitats, findHabitat } from '../../src/games/food-chain-builder/logic/habitats.js';
import { addLink, removeLink, check, linkKey, sameLink } from '../../src/games/food-chain-builder/logic/linkChecker.js';
import { deriveEffects, scorePrediction, explainEffect } from '../../src/games/food-chain-builder/logic/whatIf.js';
import { trophicLevels, computeLayout } from '../../src/games/food-chain-builder/logic/layout.js';
import { wrongMessage, missingHint, checkSummary } from '../../src/games/food-chain-builder/logic/messages.js';
import { builderStars, combinedStars, habitatScore } from '../../src/games/food-chain-builder/logic/scoring.js';
import { readLearned, withLearned, introSeen, withIntroSeen } from '../../src/games/food-chain-builder/logic/learned.js';

const GAME = new URL('../../src/games/food-chain-builder/', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(`data/${file}`, GAME), 'utf8'));
const clone = (v) => structuredClone(v);
const organisms = validateOrganisms(read('organisms.json'));
const lookup = byId(organisms);
const { places, habitats } = validateHabitats(read('habitats.json'), organisms);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);
const L = (from, to) => ({ from, to });

// ---- data --------------------------------------------------------------------------------------

test('the data has 5 places, each with an Easy, Medium and Hard habitat', () => {
  assert.deepEqual(places.map((p) => p.name), ['Forest', 'Ocean', 'Pond', 'Grassland', 'Desert']);
  assert.equal(habitats.length, 15);
  for (const place of places) for (const level of LEVEL_IDS) assert.ok(findHabitat(habitats, place.id, level), `${place.id} ${level}`);
});

test('every habitat\'s required and allowed links only use organisms of that habitat (spec acceptance)', () => {
  for (const h of habitats) {
    for (const link of [...h.required, ...h.allowed]) {
      assert.ok(h.organisms.includes(link.from), `${h.id}: ${link.from}`);
      assert.ok(h.organisms.includes(link.to), `${h.id}: ${link.to}`);
    }
  }
});

test('organism counts and shapes follow the levels: 3-4 chain, 5-6 two chains, 7-8 web', () => {
  for (const h of habitats) {
    const [min, max] = LEVELS[h.level].organisms;
    assert.ok(h.organisms.length >= min && h.organisms.length <= max, `${h.id} has ${h.organisms.length}`);
    if (h.level === 'easy') assert.equal(h.required.length, h.organisms.length - 1, `${h.id} is one chain`);
    if (h.level === 'hard') assert.ok(h.required.length >= h.organisms.length, `${h.id} is a web`);
  }
});

test('every link makes sense for the roles: producers eat nothing, herbivores only plants, carnivores only animals', () => {
  for (const h of habitats) {
    for (const link of [...h.required, ...h.allowed]) {
      const food = lookup.get(link.from);
      const eater = lookup.get(link.to);
      assert.notEqual(eater.role, 'producer', `${h.id}: ${eater.id} eats`);
      if (eater.role === 'herbivore') assert.equal(food.role, 'producer', `${h.id}: herbivore ${eater.id} eats ${food.id}`);
      if (eater.role === 'carnivore') assert.notEqual(food.role, 'producer', `${h.id}: carnivore ${eater.id} eats ${food.id}`);
    }
  }
});

test('Easy habitats start with a producer and each chain ends in an eater: grass -> rabbit -> fox', () => {
  const grass = findHabitat(habitats, 'grassland', 'easy');
  assert.deepEqual(grass.organisms, ['grass', 'rabbit', 'fox']);
  assert.deepEqual(grass.required, [L('grass', 'rabbit'), L('rabbit', 'fox')]);
  for (const h of habitats.filter((x) => x.level === 'easy')) {
    const first = h.required.find((l) => !h.required.some((o) => o.to === l.from)).from;
    assert.equal(lookup.get(first).role, 'producer', `${h.id} starts with a producer`);
  }
});

test('every organism has a role, a fact and, unless it is a producer, a diet; each habitat has producers', () => {
  for (const o of organisms) {
    assert.ok(ROLES.includes(o.role));
    assert.ok(o.fact.length > 20, o.id);
    if (o.role !== 'producer') assert.ok(o.diet.length > 10, o.id);
  }
  for (const h of habitats) assert.ok(h.organisms.some((id) => lookup.get(id).role === 'producer'), h.id);
});

test('canEat: the role rules', () => {
  assert.equal(canEat('producer', 'producer'), false);
  assert.equal(canEat('herbivore', 'producer'), true);
  assert.equal(canEat('herbivore', 'herbivore'), false);
  assert.equal(canEat('carnivore', 'producer'), false);
  assert.equal(canEat('carnivore', 'herbivore'), true);
  assert.equal(canEat('omnivore', 'producer'), true);
  assert.equal(canEat('omnivore', 'carnivore'), true);
  assert.equal(canEat('decomposer', 'carnivore'), true);
});

test('validateHabitats names the file and field for each kind of mistake', () => {
  const cases = [
    ['a link to an organism not in the habitat', (d) => { d.habitats[0].required[0].to = 'shark'; }, /habitats\[0\]\.required\[0\]\.to.*"shark" is not an organism of grassland-easy/],
    ['an organism not in organisms.json', (d) => { d.habitats[0].organisms[2] = 'dragon'; }, /"dragon" is not in organisms\.json/],
    ['a carnivore eating grass', (d) => { d.habitats[0].allowed = [{ from: 'grass', to: 'owl' }]; d.habitats[0].organisms = ['grass', 'rabbit', 'fox']; }, /is not an organism of grassland-easy/],
    ['a link the wrong way round for roles (a rabbit eating a fox)', (d) => { d.habitats[0].required[1] = L('fox', 'rabbit'); }, /Rabbit \(herbivore\) cannot eat Fox/],
    ['an organism eating itself', (d) => { d.habitats[0].allowed = [L('fox', 'fox')]; }, /cannot eat itself/],
    ['a repeated link', (d) => { d.habitats[0].required[1] = L('grass', 'rabbit'); }, /appears twice/],
    ['an allowed link that is already required', (d) => { d.habitats[0].allowed = [L('grass', 'rabbit')]; }, /already required/],
    ['an organism in no required link', (d) => { d.habitats[1].required = d.habitats[1].required.filter((l) => l.to !== 'snake'); }, /"snake" is in no required link/],
    ['too many organisms for Easy', (d) => { d.habitats[0].organisms = ['grass', 'rabbit', 'fox', 'cricket', 'frog']; }, /3 to 4 organisms/],
    ['an Easy habitat that branches', (d) => { d.habitats[0].required = [L('grass', 'rabbit'), L('grass', 'fox')]; }, /single chain/],
    ['a Hard web with too few links', (d) => { const h = d.habitats.find((x) => x.id === 'pond-hard'); h.required = h.required.filter((l) => !(l.from === 'frog' && l.to === 'otter')); }, /at least as many links as organisms \(8\)/],
    ['a wrong id', (d) => { d.habitats[0].id = 'forest-easy'; }, /must be "grassland-easy"/],
    ['an unknown place', (d) => { d.habitats[0].place = 'moon'; }, /"moon" is not in places/],
    ['a place missing a level', (d) => { d.habitats = d.habitats.filter((h) => h.id !== 'forest-medium'); }, /Forest has no medium habitat/],
    ['a Hard habitat with no What if', (d) => { delete d.habitats.find((h) => h.id === 'forest-hard').whatIf; }, /needs a "What if\?"/],
    ['a What if on an Easy habitat', (d) => { d.habitats[0].whatIf = { removed: 'rabbit', effects: {} }; }, /only hard habitats have a "What if\?"/],
    ['a What if answer that breaks the rule', (d) => { d.habitats.find((h) => h.id === 'forest-hard').whatIf.effects.fox = 'up'; }, /whatIf\.effects\.fox.*is "up" but the one-step rule gives "down"/],
    ['no places', (d) => { d.places = []; }, /places/],
  ];
  for (const [what, mutate, expected] of cases) {
    const raw = clone(read('habitats.json'));
    mutate(raw);
    assert.throws(() => validateHabitats(raw, organisms), (e) => e instanceof GameError && e.code === 'INVALID_DATA' && /^habitats\.json:/.test(e.message) && expected.test(e.message), what);
  }
});

test('validateHabitats refuses a loop in the food flow', () => {
  const raw = clone(read('habitats.json'));
  const h = raw.habitats.find((x) => x.id === 'pond-hard');
  h.allowed.push(L('snake', 'otter'), L('otter', 'frog'));
  assert.throws(() => validateHabitats(raw, organisms), (e) => e.code === 'INVALID_DATA' && /loop|cannot eat/.test(e.message));
});

test('validateOrganisms names the field of a bad organism', () => {
  const cases = [
    ['a bad role', (d) => { d.organisms[0].role = 'plant'; }, /organisms\[0\]\.role/],
    ['no plural', (d) => { d.organisms[0].plural = ''; }, /organisms\[0\]\.plural/],
    ['a consumer without a diet', (d) => { const i = d.organisms.findIndex((o) => o.role === 'herbivore'); d.organisms[i].diet = ''; }, /\.diet.*herbivore eats/],
    ['a repeated id', (d) => { d.organisms[1].id = d.organisms[0].id; }, /appears twice/],
    ['a bad id', (d) => { d.organisms[0].id = 'Big Cat'; }, /\.id/],
    ['none', (d) => { d.organisms = []; }, /organisms/],
  ];
  for (const [what, mutate, expected] of cases) {
    const raw = clone(read('organisms.json'));
    mutate(raw);
    assert.throws(() => validateOrganisms(raw), (e) => e instanceof GameError && e.code === 'INVALID_DATA' && expected.test(e.message), what);
  }
});

// ---- link checker -----------------------------------------------------------------------------

const grassMedium = findHabitat(habitats, 'grassland', 'medium');

test('check: right arrows are correct, and a complete set is complete', () => {
  const result = check(grassMedium.required, grassMedium);
  assert.equal(result.correct.length, 5);
  assert.deepEqual(result.wrong, []);
  assert.deepEqual(result.missing, []);
  assert.equal(result.complete, true);
});

test('check: an allowed extra arrow is fine', () => {
  const result = check([...grassMedium.required, L('rabbit', 'snake')], grassMedium);
  assert.equal(result.correct.length, 6);
  assert.equal(result.wrong.length, 0);
  assert.equal(result.complete, true);
});

test('check: an arrow drawn the wrong way round is "reversed"', () => {
  const result = check([L('rabbit', 'grass'), L('rabbit', 'fox')], grassMedium);
  assert.deepEqual(result.wrong, [{ link: L('rabbit', 'grass'), reason: 'reversed' }]);
  assert.deepEqual(result.correct, [L('rabbit', 'fox')]);
});

test('check: an arrow that is wrong both ways is "invalid"', () => {
  const result = check([L('grass', 'frog'), L('fox', 'snake')], grassMedium);
  assert.deepEqual(result.wrong, [{ link: L('grass', 'frog'), reason: 'invalid' }, { link: L('fox', 'snake'), reason: 'invalid' }]);
});

test('check: required arrows that are not drawn are missing, in the data\'s order', () => {
  const result = check([L('grass', 'rabbit'), L('frog', 'snake')], grassMedium);
  assert.deepEqual(result.missing, [L('rabbit', 'fox'), L('grass', 'cricket'), L('cricket', 'frog')]);
  assert.equal(result.complete, false);
});

test('check: an arrow drawn twice counts once', () => {
  const result = check([L('grass', 'rabbit'), L('grass', 'rabbit'), L('rabbit', 'grass'), L('rabbit', 'grass')], grassMedium);
  assert.equal(result.correct.length, 1);
  assert.equal(result.wrong.length, 1);
});

test('check: a wrong arrow stops the habitat being complete even when nothing is missing', () => {
  const result = check([...grassMedium.required, L('fox', 'frog')], grassMedium);
  assert.deepEqual(result.missing, []);
  assert.equal(result.wrong.length, 1);
  assert.equal(result.complete, false);
});

test('check: no arrows at all is everything missing and nothing wrong', () => {
  const result = check([], grassMedium);
  assert.equal(result.missing.length, 5);
  assert.deepEqual(result.correct, []);
  assert.deepEqual(result.wrong, []);
});

test('check: an organism from another habitat is a clear error', () => {
  throwsCode(() => check([L('grass', 'shark')], grassMedium), 'UNKNOWN_ORGANISM');
});

test('the required arrows of every habitat pass their own check, and so do the allowed extras', () => {
  for (const h of habitats) {
    assert.equal(check(h.required, h).complete, true, h.id);
    assert.equal(check([...h.required, ...h.allowed], h).complete, true, `${h.id} with extras`);
  }
});

test('reversing any required arrow is "reversed", never "invalid", in every habitat', () => {
  for (const h of habitats) {
    for (const r of h.required) {
      const result = check([L(r.to, r.from)], h);
      assert.deepEqual(result.wrong.map((w) => w.reason), ['reversed'], `${h.id} ${linkKey(r)}`);
    }
  }
});

test('addLink adds an arrow, and quietly ignores a self-link or a duplicate', () => {
  let { links, added } = addLink([], L('grass', 'rabbit'), grassMedium);
  assert.equal(added, true);
  assert.deepEqual(links, [L('grass', 'rabbit')]);
  ({ links, added } = addLink(links, L('grass', 'rabbit'), grassMedium));
  assert.equal(added, false, 'duplicate');
  assert.equal(links.length, 1);
  ({ links, added } = addLink(links, L('rabbit', 'rabbit'), grassMedium));
  assert.equal(added, false, 'self-link');
  ({ links, added } = addLink(links, L('rabbit', 'grass'), grassMedium));
  assert.equal(added, true, 'the opposite direction is a different arrow');
  assert.equal(links.length, 2);
  const before = [L('grass', 'rabbit')];
  addLink(before, L('rabbit', 'fox'), grassMedium);
  assert.equal(before.length, 1, 'the old list is not changed');
  throwsCode(() => addLink([], L('grass', 'shark'), grassMedium), 'UNKNOWN_ORGANISM');
});

test('removeLink takes one arrow away and leaves the rest', () => {
  const links = [L('grass', 'rabbit'), L('rabbit', 'fox'), L('rabbit', 'grass')];
  assert.deepEqual(removeLink(links, L('rabbit', 'fox')), [L('grass', 'rabbit'), L('rabbit', 'grass')]);
  assert.deepEqual(removeLink(links, L('fox', 'rabbit')), links, 'not there: nothing changes');
  assert.ok(sameLink(L('a', 'b'), L('a', 'b')) && !sameLink(L('a', 'b'), L('b', 'a')));
});

// ---- messages ----------------------------------------------------------------------------------

test('a reversed arrow says to check the direction, like the spec example', () => {
  const msg = wrongMessage({ link: L('fox', 'rabbit'), reason: 'reversed' }, lookup);
  assert.match(msg, /^The rabbit doesn't eat the fox — check the arrow direction!/);
});

test('an invalid arrow says what that animal does eat, like "Frogs don\'t eat grass"', () => {
  assert.equal(wrongMessage({ link: L('grass', 'frog'), reason: 'invalid' }, lookup), "Frogs don't eat grass. Frogs eat insects, snails and worms.");
  assert.equal(wrongMessage({ link: L('rabbit', 'grass'), reason: 'invalid' }, lookup), 'The grass makes its own food from sunlight, so no arrow points to it.');
});

test('every wrong arrow of every habitat gets a message that names both living things', () => {
  for (const h of habitats) {
    for (const a of h.organisms) for (const b of h.organisms) {
      const result = check([L(a, b)], h);
      for (const w of result.wrong) {
        const msg = wrongMessage(w, lookup);
        assert.ok(msg.length > 20 && !/undefined/.test(msg), `${h.id} ${a}>${b}: ${msg}`);
      }
    }
  }
});

test('the hint names who is missing a link without giving the answer, and the summary counts', () => {
  assert.equal(missingHint(L('rabbit', 'fox'), lookup), 'What eats the rabbit? Draw one more arrow.');
  assert.equal(HINT_AFTER_CHECKS, 2);
  assert.equal(checkSummary({ correct: [1, 2], wrong: [1], missing: [1, 2, 3], complete: false }), '2 right arrows, 1 to fix, 3 still to draw.');
  assert.equal(checkSummary({ correct: [1], wrong: [], missing: [], complete: false }), '1 right arrow.');
  assert.match(checkSummary({ correct: [], wrong: [], missing: [], complete: true }), /comes alive/);
});

// ---- what if ----------------------------------------------------------------------------------------

test('the one-step rule: eaters go down, foods go up, the rest stay the same', () => {
  const h = findHabitat(habitats, 'grassland', 'hard');
  const effects = deriveEffects(h, 'rabbit');
  assert.deepEqual(effects, { grass: 'up', wildflower: 'up', cricket: 'same', mouse: 'same', snake: 'down', fox: 'down', eagle: 'down' });
  assert.ok(!('rabbit' in effects));
  throwsCode(() => deriveEffects(h, 'shark'), 'UNKNOWN_ORGANISM');
});

test('every Hard habitat has a What if that matches the rule and asks something worth asking', () => {
  const hard = habitats.filter((h) => h.level === 'hard');
  assert.equal(hard.length, 5);
  for (const h of hard) {
    assert.deepEqual(h.whatIf.effects, deriveEffects(h, h.whatIf.removed), h.id);
    const values = Object.values(h.whatIf.effects);
    assert.ok(values.includes('up') && values.includes('down') && values.includes('same'), `${h.id} uses up, down and same`);
  }
  assert.ok(habitats.filter((h) => h.level !== 'hard').every((h) => h.whatIf === undefined));
});

test('scorePrediction counts right answers and lists the wrong ones; a missing answer is wrong', () => {
  const effects = { grass: 'up', snake: 'down', mouse: 'same' };
  assert.deepEqual(scorePrediction({ grass: 'up', snake: 'down', mouse: 'same' }, effects), { correct: 3, total: 3, wrongIds: [] });
  assert.deepEqual(scorePrediction({ grass: 'down', snake: 'down', mouse: 'up' }, effects), { correct: 1, total: 3, wrongIds: ['grass', 'mouse'] });
  assert.deepEqual(scorePrediction({ grass: 'up' }, effects), { correct: 1, total: 3, wrongIds: ['snake', 'mouse'] });
  assert.deepEqual(scorePrediction({}, effects), { correct: 0, total: 3, wrongIds: ['grass', 'snake', 'mouse'] });
  throwsCode(() => scorePrediction({ shark: 'up' }, effects), 'UNKNOWN_ORGANISM');
});

test('each right answer has a sentence that says why, in the same simple rule', () => {
  const fox = lookup.get('fox'), rabbit = lookup.get('rabbit'), grass = lookup.get('grass'), cricket = lookup.get('cricket');
  assert.equal(explainEffect('down', fox, rabbit), 'Foxes would go down: they lose one of their foods, rabbits.');
  assert.equal(explainEffect('up', grass, rabbit), 'Grass would go up: rabbits are gone, so there is nothing left to eat them.');
  assert.match(explainEffect('same', cricket, rabbit), /^Crickets would stay about the same/);
});

// ---- layout ------------------------------------------------------------------------------------------

test('trophic levels: grass 0, rabbit 1, fox 2', () => {
  const levels = trophicLevels(findHabitat(habitats, 'grassland', 'easy'));
  assert.deepEqual([...levels], [['grass', 0], ['rabbit', 1], ['fox', 2]]);
});

test('layout: every card is on the board, no two overlap, and every arrow points the way food flows', () => {
  for (const h of habitats) {
    const levels = trophicLevels(h);
    for (const orientation of ['horizontal', 'vertical']) {
      const pos = computeLayout(h, orientation);
      assert.equal(pos.size, h.organisms.length, h.id);
      const points = [...pos.values()];
      for (const p of points) assert.ok(p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100, `${h.id} ${orientation} inside`);
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= 15, `${h.id} ${orientation}: cards ${i} and ${j} too close`);
      }
      for (const link of h.required) {
        const a = pos.get(link.from), b = pos.get(link.to);
        if (orientation === 'horizontal') assert.ok(a.x < b.x, `${h.id} ${linkKey(link)} goes left to right`);
        else assert.ok(a.y > b.y, `${h.id} ${linkKey(link)} goes upwards`);
        assert.ok(levels.get(link.from) < levels.get(link.to));
      }
    }
  }
});

test('layout: a habitat has at most 5 levels and at most 3 cards in a level, so it fits a phone', () => {
  for (const h of habitats) {
    const levels = [...trophicLevels(h).values()];
    assert.ok(Math.max(...levels) <= 4, `${h.id} levels`);
    for (let l = 0; l <= 4; l++) assert.ok(levels.filter((x) => x === l).length <= 3, `${h.id} level ${l}`);
  }
});

// ---- scoring, learned ---------------------------------------------------------------------------------

test('building stars: no wrong arrow at the first Check = 3, one or two = 2, more = 1', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(builderStars), [3, 2, 2, 1, 1]);
});

test('Hard stars average the building stars and the What if stars, a half going up', () => {
  assert.equal(combinedStars(3, 6, 6), 3);
  assert.equal(combinedStars(3, 5, 6), 3, '(3 + 2) / 2 = 2.5 -> 3');
  assert.equal(combinedStars(2, 6, 6), 3, '(2 + 3) / 2 = 2.5 -> 3');
  assert.equal(combinedStars(2, 4, 6), 2, '(2 + 1) / 2 = 1.5 -> 2');
  assert.equal(combinedStars(1, 6, 6), 2);
  assert.equal(combinedStars(1, 1, 6), 1);
  assert.equal(combinedStars(3, 0, 0), 2, 'nothing asked counts as 1 star for the second half');
  assert.equal(habitatScore(3), 300);
  assert.equal(habitatScore(2, 5), 250);
});

test('learned organisms: read safely, add without repeats, ignore unknown ids and keep other save data', () => {
  const known = organisms.map((o) => o.id);
  assert.deepEqual([...readLearned(undefined, known)], []);
  assert.deepEqual([...readLearned({ learned: 'nope' }, known)], []);
  assert.deepEqual([...readLearned({ learned: ['fox', 'dragon', 7, 'fox'] }, known)], ['fox']);
  const extra = withLearned({ introSeen: true, other: 1 }, ['rabbit', 'fox', 'dragon'], known);
  assert.deepEqual(extra, { introSeen: true, other: 1, learned: ['fox', 'rabbit'] });
  assert.deepEqual(withLearned(extra, ['fox', 'grass'], known).learned, ['fox', 'grass', 'rabbit']);
  assert.deepEqual(withLearned(null, ['fox'], known), { learned: ['fox'] });
  assert.equal(introSeen({}), false);
  assert.equal(introSeen(withIntroSeen({ learned: ['fox'] })), true);
  assert.deepEqual(withIntroSeen(undefined), { introSeen: true });
});

test('levels: Easy shows roles, only Hard has What if', () => {
  assert.deepEqual(LEVEL_IDS.map((l) => [LEVELS[l].showRoles, LEVELS[l].whatIf]), [[true, false], [false, false], [false, true]]);
});
