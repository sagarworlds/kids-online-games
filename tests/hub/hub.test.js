import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { RewardService } from '../../src/engine/services/RewardService.js';
import { PROFILE_KEY, SETTINGS_KEY, gameKey } from '../../src/engine/services/schemas.js';
import { createRng } from '../../src/engine/utils/random.js';
import { loadJson } from '../../src/engine/utils/data.js';
import { ProfileService } from '../../src/hub/ProfileService.js';
import { randomName, validateNameLists } from '../../src/hub/nameGenerator.js';
import { validateName, NAME_MESSAGES, containsBlockedWord } from '../../src/hub/nameValidation.js';
import { resetAllProgress } from '../../src/hub/resetProgress.js';
import { GAMES, SUBJECTS } from '../../src/hub/gamesRegistry.js';
import { createLogger } from '../engine/helpers.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(`../../src/hub/data/${rel}`, import.meta.url), 'utf8'));
const names = validateNameLists(readJson('names.json'));
const blocklist = readJson('blocklist.json').words;

const newStorage = (backend = createMemoryBackend()) =>
  new StorageService({ backend, logger: createLogger(), eventTarget: null });
const newProfile = (storage = newStorage(), seed = 1) =>
  new ProfileService({ storage, rng: createRng(seed), names, blocklist });

// ---- data files ------------------------------------------------------------

test('names.json has at least 30 adjectives and 30 animals, each animal with an avatar', () => {
  assert.ok(names.adjectives.length >= 30);
  assert.ok(names.animals.length >= 30);
  assert.ok(names.animals.every((a) => a.name && a.emoji));
});

test('every possible generated name passes validation (incl. the blocklist and 20-char limit)', () => {
  for (const adjective of names.adjectives) {
    for (const animal of names.animals) {
      assert.doesNotThrow(() => validateName(`${adjective} ${animal.name}`, blocklist), `${adjective} ${animal.name}`);
    }
  }
});

test('validateNameLists names the bad file and field', () => {
  assert.throws(() => validateNameLists({ adjectives: ['A'], animals: [] }),
    (e) => e.code === 'INVALID_DATA' && e.context.file === 'names.json' && e.context.field === 'adjectives');
  const tooLong = { adjectives: Array(30).fill('Extraordinary'), animals: Array(30).fill({ name: 'Hippopotamus', emoji: '🦛' }) };
  assert.throws(() => validateNameLists(tooLong), (e) => e.context.field.startsWith('animals['));
});

test('randomName returns "Adjective Animal" with the matching animal avatar', () => {
  const rng = createRng(3);
  for (let i = 0; i < 200; i++) {
    const { name, avatar } = randomName(rng, names);
    const [adjective, animalName] = name.split(' ');
    assert.ok(names.adjectives.includes(adjective));
    assert.equal(names.animals.find((a) => a.name === animalName).emoji, avatar);
  }
});

// ---- validation ------------------------------------------------------------

test('validateName trims, squashes spaces and accepts 2-20 letters, numbers, spaces', () => {
  assert.equal(validateName('  Brave   Panda  ', blocklist), 'Brave Panda');
  assert.equal(validateName('Al', blocklist), 'Al');
  assert.equal(validateName('A'.repeat(20), blocklist).length, 20);
  assert.equal(validateName('Player 7', blocklist), 'Player 7');
});

test('validateName rejects bad lengths with the friendly message', () => {
  for (const bad of ['', ' ', 'A', '   B   ', 'A'.repeat(21)]) {
    assert.throws(() => validateName(bad, blocklist), (e) =>
      e.code === 'INVALID_NAME' && e.context.reason === 'length' && e.message === 'Names need 2 to 20 letters', bad);
  }
});

test('validateName rejects symbols, emoji and markup', () => {
  for (const bad of ['Hi!', 'a@b', '<b>Bob</b>', 'Cool😀', 'under_score', 'x/y']) {
    assert.throws(() => validateName(bad, blocklist), (e) => e.context.reason === 'chars', bad);
  }
});

test('validateName accepts Devanagari names, including vowel signs (matras)', () => {
  assert.equal(validateName('सागर', blocklist), 'सागर');
  assert.equal(validateName('प्रिया शर्मा', blocklist), 'प्रिया शर्मा');
  // A lone combining mark is not a name.
  assert.throws(() => validateName('ा ा', blocklist), (e) => e.context.reason === 'chars');
});

test('blocklist matches whole words and look-alike digits, but not innocent substrings', () => {
  assert.equal(containsBlockedWord('Big Idiot', blocklist), true);
  assert.equal(containsBlockedWord('1d10t', blocklist), true);
  assert.equal(containsBlockedWord('Class Pass', blocklist), false, '"ass" inside words is fine');
  assert.throws(() => validateName('So Stupid', blocklist), (e) => e.context.reason === 'rude' && e.message === NAME_MESSAGES.rude);
  assert.equal(containsBlockedWord('anything', []), false);
});

// ---- ProfileService --------------------------------------------------------

test('first visit creates a random name and saves it; a reload shows the same name', () => {
  const backend = createMemoryBackend();
  const first = newProfile(newStorage(backend), 11).getProfile();
  assert.match(first.name, /^\S+ \S+$/);
  assert.ok(first.avatar);
  assert.ok(first.createdAt > 0);
  assert.ok(backend.getItem(PROFILE_KEY), 'saved immediately');

  // New service + different RNG seed, same storage: must not re-roll.
  const second = newProfile(newStorage(backend), 999).getProfile();
  assert.equal(second.name, first.name);
  assert.equal(second.avatar, first.avatar);
});

test('rename saves a valid name and keeps the avatar', () => {
  const profile = newProfile();
  const before = profile.getProfile();
  const after = profile.rename('  Star Kid ');
  assert.equal(after.name, 'Star Kid');
  assert.equal(after.avatar, before.avatar);
  assert.equal(profile.getProfile().name, 'Star Kid');
});

test('an invalid rename throws INVALID_NAME and keeps the old name', () => {
  const profile = newProfile();
  const before = profile.getProfile();
  for (const bad of ['x', 'no!!', 'you idiot']) {
    assert.throws(() => profile.rename(bad), { code: 'INVALID_NAME' });
  }
  assert.equal(profile.getProfile().name, before.name);
});

test('shuffleName suggests a different name without saving it', () => {
  const profile = newProfile(newStorage(), 5);
  const saved = profile.getProfile();
  const suggestion = profile.shuffleName();
  assert.notEqual(suggestion.name, saved.name);
  assert.equal(profile.getProfile().name, saved.name, 'not saved until the child taps Save');
  // Accepting the suggestion also adopts its avatar.
  const accepted = profile.rename(suggestion.name, suggestion.avatar);
  assert.equal(accepted.avatar, suggestion.avatar);
});

test('game pages (no name lists) fall back to a guest name without saving anything', () => {
  const backend = createMemoryBackend();
  const guest = new ProfileService({ storage: newStorage(backend), rng: createRng(1) }).getProfile();
  assert.equal(guest.name, 'Friend');
  assert.equal(backend.getItem(PROFILE_KEY), null);
  assert.throws(() => new ProfileService({ storage: newStorage(), rng: createRng(1) }).shuffleName(), { code: 'NO_NAME_DATA' });
});

test('profile works when localStorage is unavailable (in-memory fallback, no crash)', () => {
  const storage = newStorage(null);
  const profile = newProfile(storage, 2);
  const first = profile.getProfile();
  assert.equal(profile.getProfile().name, first.name, 'stable for the session');
  assert.equal(storage.isPersistent, false);
});

// ---- stars -----------------------------------------------------------------

test('card stars and the total match each game\'s saved data', () => {
  const storage = newStorage();
  const rewards = new RewardService({ storage });
  rewards.recordRound('number-ninja', 'easy', { stars: 3 });
  rewards.recordRound('number-ninja', 'medium', { stars: 2 });
  rewards.recordRound('robot-path', 'level-1', { stars: 1 });
  const slugs = GAMES.map((g) => g.slug);
  assert.equal(rewards.starsFor('number-ninja'), 5);
  assert.equal(rewards.starsFor('robot-path'), 1);
  assert.equal(rewards.starsFor('lights-out'), 0);
  assert.equal(rewards.totalStars(slugs), 6);
  assert.equal(rewards.hasPlayed('lights-out'), false, 'shows the "New" badge');
  assert.equal(rewards.hasPlayed('number-ninja'), true);
});

// ---- reset -----------------------------------------------------------------

function seededBackend() {
  const backend = createMemoryBackend();
  backend.setItem(PROFILE_KEY, JSON.stringify({ version: 1, name: 'Brave Panda', avatar: '🐼', createdAt: 1 }));
  backend.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, sound: false, readAloud: true, difficultyLock: 'easy' }));
  backend.setItem(gameKey('number-ninja'), JSON.stringify({ version: 1, bestStars: { easy: 3 }, bestScore: 9, badges: [], extra: {} }));
  backend.setItem('some-other-app:keep', 'important');
  backend.setItem('theme', 'dark');
  return backend;
}

test('reset clears only kidsgames:* keys and keeps the name by default', () => {
  const backend = seededBackend();
  const storage = newStorage(backend);
  const removed = resetAllProgress({ storage });
  assert.deepEqual(removed.sort(), [gameKey('number-ninja'), SETTINGS_KEY].sort());
  assert.ok(backend.getItem(PROFILE_KEY), 'name kept');
  assert.equal(backend.getItem(gameKey('number-ninja')), null);
  assert.equal(backend.getItem('some-other-app:keep'), 'important');
  assert.equal(backend.getItem('theme'), 'dark');
  assert.equal(new RewardService({ storage }).starsFor('number-ninja'), 0);
});

test('"Also reset name" removes the profile too, still leaving other keys alone', () => {
  const backend = seededBackend();
  resetAllProgress({ storage: newStorage(backend), alsoResetName: true });
  assert.equal(backend.getItem(PROFILE_KEY), null);
  assert.equal(backend.getItem('some-other-app:keep'), 'important');
  // The next visit generates a fresh random name.
  assert.ok(newProfile(newStorage(backend), 8).getProfile().name);
});

// ---- registry --------------------------------------------------------------

test('registry lists all 16 games exactly once with every required field', () => {
  assert.equal(GAMES.length, 16);
  assert.equal(new Set(GAMES.map((g) => g.slug)).size, 16);
  const subjects = new Set(SUBJECTS.map((s) => s.id));
  for (const g of GAMES) {
    for (const field of ['slug', 'title', 'subject', 'icon', 'path', 'learningTag']) {
      assert.ok(g[field], `${g.slug}.${field}`);
    }
    assert.ok(subjects.has(g.subject), `${g.slug} has a known subject`);
    assert.equal(g.path, `src/games/${g.slug}/index.html`);
  }
});

test('subject grouping matches the spec (4 math, 3 language, 3 logic, 4 science, 2 memory)', () => {
  const count = (id) => GAMES.filter((g) => g.subject === id).length;
  assert.deepEqual(['math', 'language', 'logic', 'science', 'memory'].map(count), [4, 3, 3, 4, 2]);
});

test('every game marked available has its page on disk (every card link opens a game)', () => {
  for (const g of GAMES.filter((x) => x.available)) {
    assert.ok(existsSync(new URL(`../../${g.path}`, import.meta.url)), `${g.path} exists`);
  }
});

// ---- data loader -----------------------------------------------------------

test('loadJson reports the file name for fetch failures, HTTP errors and bad JSON', async () => {
  const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });
  assert.deepEqual(await loadJson('x', 'a.json', (d) => d, ok({ a: 1 })), { a: 1 });
  await assert.rejects(loadJson('x', 'a.json', (d) => d, async () => { throw new Error('offline'); }),
    (e) => e.code === 'DATA_LOAD_FAILED' && e.context.file === 'a.json');
  await assert.rejects(loadJson('x', 'a.json', (d) => d, async () => ({ ok: false, status: 404 })),
    (e) => e.code === 'DATA_LOAD_FAILED' && e.context.status === 404);
  await assert.rejects(loadJson('x', 'a.json', (d) => d, async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })),
    (e) => e.code === 'INVALID_DATA' && e.context.file === 'a.json');
  await assert.rejects(loadJson('x', 'a.json', () => { throw new Error('shape'); }, ok({})), /shape/);
});
