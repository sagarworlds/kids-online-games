import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { RewardService } from '../../src/engine/services/RewardService.js';
import { GAMES, SUBJECTS } from '../../src/hub/gamesRegistry.js';
import { summarizeProgress } from '../../src/hub/progressSummary.js';
import { describeGame, describeSubject, describeTotals } from '../../src/hub/progressText.js';
import { createLogger } from '../engine/helpers.js';

const newRewards = () => new RewardService({ storage: new StorageService({ backend: createMemoryBackend(), logger: createLogger(), eventTarget: null }) });
const summarize = (rewards, extra = {}) => summarizeProgress({ games: GAMES, subjects: SUBJECTS, saveOf: (slug) => rewards.getSave(slug), ...extra });
const gameRow = (summary, slug) => summary.subjects.flatMap((subject) => subject.games).find((game) => game.slug === slug);
const subjectRow = (summary, id) => summary.subjects.find((subject) => subject.id === id);

test('a child who has played nothing: zero everywhere, and every available game is listed under its subject', () => {
  const summary = summarize(newRewards());
  const available = GAMES.filter((game) => game.available);
  assert.deepEqual([summary.stars, summary.gamesPlayed, summary.badges], [0, 0, 0]);
  assert.equal(summary.gamesTotal, available.length);
  assert.equal(summary.subjects.flatMap((subject) => subject.games).length, available.length);
  for (const subject of summary.subjects) {
    assert.ok(subject.games.every((game) => game.subject === subject.id && !game.played && game.stars === 0), subject.id);
    assert.equal(subject.gamesPlayed, 0);
    assert.equal(subject.gamesTotal, subject.games.length);
  }
});

test('stars, levels and badges come from each game\'s save, and roll up into the subject and the total', () => {
  const rewards = newRewards();
  rewards.recordRound('number-ninja', 'easy', { stars: 3 });
  rewards.recordRound('number-ninja', 'medium', { stars: 2 });
  rewards.recordRound('number-ninja', 'medium', { stars: 1 }); // a worse try: the best is kept
  rewards.awardBadge('number-ninja', 'streak-5');
  rewards.awardBadge('number-ninja', 'streak-5'); // once only
  rewards.recordRound('pizza-fractions', 'easy', { stars: 1 });
  rewards.recordRound('simon-says', 'hard', { stars: 3 });

  const summary = summarize(rewards);
  assert.deepEqual(
    { stars: gameRow(summary, 'number-ninja').stars, levels: gameRow(summary, 'number-ninja').levelsDone, badges: gameRow(summary, 'number-ninja').badges },
    { stars: 5, levels: 2, badges: 1 },
  );
  assert.deepEqual([gameRow(summary, 'pizza-fractions').stars, gameRow(summary, 'pizza-fractions').levelsDone], [1, 1]);

  const math = subjectRow(summary, 'math');
  assert.equal(math.stars, 6, 'the two maths games that were played add up');
  assert.equal(math.gamesPlayed, 2);
  assert.equal(math.gamesTotal, GAMES.filter((game) => game.available && game.subject === 'math').length);
  assert.equal(subjectRow(summary, 'memory').stars, 3);

  assert.equal(summary.stars, 9);
  assert.equal(summary.gamesPlayed, 3);
  assert.equal(summary.badges, 1);
});

test('the total agrees with the star total the home page shows, and "played" with its "New" badge rule, for every game', () => {
  const rewards = newRewards();
  GAMES.filter((game) => game.available).forEach((game, index) => {
    if (index % 3 === 0) return; // some games stay unplayed
    rewards.recordRound(game.slug, 'easy', { stars: (index % 3) + 1 });
    if (index % 4 === 0) rewards.awardBadge(game.slug, 'first');
  });
  const summary = summarize(rewards);
  assert.equal(summary.stars, rewards.totalStars(GAMES.map((game) => game.slug)));
  for (const game of summary.subjects.flatMap((subject) => subject.games)) {
    assert.equal(game.played, rewards.hasPlayed(game.slug), game.slug);
  }
});

test('a game with only a badge counts as played, and says so without inventing stars', () => {
  const rewards = newRewards();
  rewards.awardBadge('lights-out', 'curious');
  const row = gameRow(summarize(rewards), 'lights-out');
  assert.deepEqual([row.played, row.stars, row.levelsDone, row.badges], [true, 0, 0, 1]);
  assert.equal(describeGame(row), '1 badge');
});

test('the game played last is marked, and a name that is not a game marks nothing', () => {
  const rewards = newRewards();
  const marked = (summary) => summary.subjects.flatMap((subject) => subject.games).filter((game) => game.playedLast).map((game) => game.slug);
  assert.deepEqual(marked(summarize(rewards, { lastSlug: 'robot-path' })), ['robot-path']);
  assert.deepEqual(marked(summarize(rewards, { lastSlug: 'javascript:alert(1)' })), []);
  assert.deepEqual(marked(summarize(rewards)), []);
});

test('games that are not available yet, and subjects left with no game, are left out', () => {
  const games = [
    { slug: 'a', title: 'A', subject: 'math', icon: '🅰️', learningTag: 'x', available: true, path: 'a' },
    { slug: 'b', title: 'B', subject: 'math', icon: '🅱️', learningTag: 'y', available: false, path: 'b' },
  ];
  const summary = summarizeProgress({
    games, subjects: [{ id: 'math', heading: 'Math' }, { id: 'logic', heading: 'Logic' }],
    saveOf: () => ({ version: 1, bestStars: {}, bestScore: 0, badges: [], extra: {} }),
  });
  assert.deepEqual(summary.subjects.map((subject) => subject.id), ['math'], 'logic has no available game');
  assert.deepEqual(summary.subjects[0].games.map((game) => game.slug), ['a']);
  assert.equal(summary.gamesTotal, 1);
});

test('a game in a subject the home page does not list is a clear error naming the game', () => {
  const games = [{ slug: 'x', title: 'X', subject: 'art', icon: '🎨', learningTag: 'z', available: true, path: 'x' }];
  assert.throws(
    () => summarizeProgress({ games, subjects: [{ id: 'math', heading: 'Math' }], saveOf: () => ({ bestStars: {}, bestScore: 0, badges: [] }) }),
    (error) => error.code === 'UNKNOWN_SUBJECT' && error.context.slug === 'x' && error.context.subject === 'art',
  );
});

test('every game in the registry is in a subject the home page lists, so the real summary never throws', () => {
  assert.doesNotThrow(() => summarize(newRewards()));
});

test('the words: plurals, what is left out, and what a game that was not played says', () => {
  const totals = { stars: 57, gamesPlayed: 12, gamesTotal: 19, badges: 5, subjects: [] };
  assert.equal(describeTotals(totals, 'Brave Panda'), 'Brave Panda has earned 57 stars and 5 badges, playing 12 of 19 games.');
  assert.equal(describeTotals({ ...totals, stars: 1, badges: 1, gamesPlayed: 1 }, 'Kit'), 'Kit has earned 1 star and 1 badge, playing 1 of 19 games.');
  assert.equal(describeTotals({ ...totals, badges: 0 }, 'Kit'), 'Kit has earned 57 stars, playing 12 of 19 games.');
  assert.equal(describeTotals({ ...totals, stars: 0, gamesPlayed: 0, badges: 0 }, 'Kit'), 'Kit has not played anything on this device yet.');

  assert.equal(describeSubject({ id: 'math', heading: 'Math', stars: 24, gamesPlayed: 3, gamesTotal: 4, games: [] }), '24 stars, 3 of 4 games played');
  assert.equal(describeSubject({ id: 'math', heading: 'Math', stars: 1, gamesPlayed: 1, gamesTotal: 4, games: [] }), '1 star, 1 of 4 games played');

  const game = { played: true, stars: 9, levelsDone: 3, badges: 2 };
  assert.equal(describeGame(game), '9 stars, 3 levels, 2 badges');
  assert.equal(describeGame({ ...game, badges: 0 }), '9 stars, 3 levels');
  assert.equal(describeGame({ ...game, stars: 1, levelsDone: 1, badges: 1 }), '1 star, 1 level, 1 badge');
  assert.equal(describeGame({ played: false, stars: 0, levelsDone: 0, badges: 0 }), 'Not played yet');
});
