import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { RewardService } from '../../src/engine/services/RewardService.js';
import {
  DEVICE_KEY, LAST_PLAYED_KEY, PROFILE_KEY, SETTINGS_KEY, gameKey,
} from '../../src/engine/services/schemas.js';
import { GAMES, SUBJECTS } from '../../src/hub/gamesRegistry.js';
import {
  BACKUP_APP, BACKUP_FORMAT, MAX_BACKUP_BYTES,
  backupFilename, backupSchemas, createBackup, describeBackupProblem, parseBackup, restoreBackup, serializeBackup,
} from '../../src/hub/backup.js';
import { summarizeProgress } from '../../src/hub/progressSummary.js';
import { createLogger } from '../engine/helpers.js';

const newStorage = (backend = createMemoryBackend()) => new StorageService({ backend, logger: createLogger(), eventTarget: null });
const PROFILE = { version: 1, name: 'Brave Panda', avatar: '🐼', createdAt: 1_700_000_000_000 };
const NOW = () => new Date('2026-11-26T10:30:00.000Z');

/** A device that has been played on: a name, settings, the game played last and progress in three games. */
function playedOn(storage = newStorage()) {
  const rewards = new RewardService({ storage });
  storage.write(PROFILE_KEY, PROFILE);
  storage.write(SETTINGS_KEY, { version: 1, sound: false, readAloud: true, difficultyLock: 'medium' });
  storage.write(LAST_PLAYED_KEY, { version: 1, slug: 'simon-says', at: 1_700_000_100_000 });
  storage.write(DEVICE_KEY, { version: 1, slow3d: true, frameWatch: 'on' });
  rewards.recordRound('number-ninja', 'easy', { stars: 3, score: 120 });
  rewards.recordRound('number-ninja', 'medium', { stars: 2 });
  rewards.awardBadge('number-ninja', 'streak-5');
  rewards.recordRound('simon-says', 'hard', { stars: 1 });
  rewards.recordRound('planet-hop', 'lineup-easy', { stars: 2 });
  return { storage, rewards };
}

const summary = (rewards) => summarizeProgress({ games: GAMES, subjects: SUBJECTS, saveOf: (slug) => rewards.getSave(slug) });
const codeOf = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

test('a copy holds the profile, the settings, the game played last and the games that were played, and not the device record', () => {
  const { storage } = playedOn();
  storage.write('kidsgames:mystery', { version: 1 });   // not something this version knows
  storage.write('other-app:data', { version: 1 });      // not ours at all
  const backup = createBackup({ storage, games: GAMES, now: NOW });
  assert.deepEqual(Object.keys(backup.entries), [
    gameKey('number-ninja'), gameKey('planet-hop'), LAST_PLAYED_KEY, PROFILE_KEY, SETTINGS_KEY, gameKey('simon-says'),
  ].sort(), 'only what is stored and known, in a steady order');
  assert.equal(backup.app, BACKUP_APP);
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.savedAt, '2026-11-26T10:30:00.000Z');
  assert.deepEqual(backup.entries[gameKey('number-ninja')].bestStars, { easy: 3, medium: 2 });
  assert.equal(DEVICE_KEY in backup.entries, false, 'how fast this tablet is says nothing about the child');
});

test('nothing played, nothing but what exists: an empty device gives a copy with no entries', () => {
  assert.deepEqual(createBackup({ storage: newStorage(), games: GAMES, now: NOW }).entries, {});
});

test('the file is readable text with a name that carries the date', () => {
  const { storage } = playedOn();
  const backup = createBackup({ storage, games: GAMES, now: NOW });
  assert.deepEqual(JSON.parse(serializeBackup(backup)), backup);
  assert.match(serializeBackup(backup), /\n  "app"/, 'indented, so a person can open it');
  assert.equal(backupFilename(backup.savedAt), 'kids-games-progress-2026-11-26.json');
});

test('a copy read back is the copy that was made', () => {
  const { storage } = playedOn();
  const backup = createBackup({ storage, games: GAMES, now: NOW });
  const { backup: read, skipped } = parseBackup(serializeBackup(backup), GAMES);
  assert.deepEqual(read, backup);
  assert.deepEqual(skipped, []);
});

test('restoring a copy on an empty device gives the same progress, name, settings and game played last', () => {
  const from = playedOn();
  const { backup } = parseBackup(serializeBackup(createBackup({ storage: from.storage, games: GAMES, now: NOW })), GAMES);

  const to = { storage: newStorage() };
  to.rewards = new RewardService({ storage: to.storage });
  const result = restoreBackup({ storage: to.storage, backup });

  assert.equal(result.durable, true);
  assert.deepEqual(summary(to.rewards), summary(from.rewards), 'the same totals, subjects and games');
  assert.deepEqual(to.storage.read(PROFILE_KEY, { version: 1, defaults: () => ({}) }).name, 'Brave Panda');
  assert.equal(to.storage.read(SETTINGS_KEY, { version: 1, defaults: () => ({}) }).difficultyLock, 'medium');
  assert.equal(to.storage.read(LAST_PLAYED_KEY, { version: 1, defaults: () => ({}) }).slug, 'simon-says');
  assert.equal(to.storage.keys('kidsgames:').includes(DEVICE_KEY), false, 'the other tablet\'s speed record did not come along');
});

test('restoring replaces what was there: a game the copy has no save for is cleared, the device record and a name the copy lacks stay', () => {
  const { backup } = parseBackup(serializeBackup(createBackup({ storage: playedOn().storage, games: GAMES, now: NOW })), GAMES);
  const here = newStorage();
  const rewards = new RewardService({ storage: here });
  here.write(PROFILE_KEY, { ...PROFILE, name: 'Gentle Duck' });
  here.write(DEVICE_KEY, { version: 1, slow3d: false, frameWatch: 'on' });
  rewards.recordRound('shop-keeper', 'hard', { stars: 3 });   // played here, not in the copy

  const withoutName = { ...backup, entries: Object.fromEntries(Object.entries(backup.entries).filter(([key]) => key !== PROFILE_KEY)) };
  const result = restoreBackup({ storage: here, backup: withoutName });

  assert.deepEqual(result.removed, [gameKey('shop-keeper')]);
  assert.equal(rewards.starsFor('shop-keeper'), 0, 'not in the copy, so not here afterwards');
  assert.equal(rewards.starsFor('number-ninja'), 5);
  assert.deepEqual(here.read(PROFILE_KEY, { version: 1, defaults: () => ({}) }).name, 'Gentle Duck', 'the child keeps their name when the copy has none');
  assert.ok(here.keys('kidsgames:').includes(DEVICE_KEY), 'the device record is never touched');
});

test('when the browser will not keep what is written, restoring says so', () => {
  const { backup } = parseBackup(serializeBackup(createBackup({ storage: playedOn().storage, games: GAMES, now: NOW })), GAMES);
  const backend = createMemoryBackend();
  const full = { ...backend, length: 0, key: () => null, getItem: () => null, setItem() { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const storage = newStorage(full);
  assert.equal(restoreBackup({ storage, backup }).durable, false);
});

test('a game this version does not list is skipped and named, and the rest still counts', () => {
  const { storage } = playedOn();
  const copy = JSON.parse(serializeBackup(createBackup({ storage, games: GAMES, now: NOW })));
  copy.entries['kidsgames:space-hockey'] = { version: 1, bestStars: { easy: 3 }, bestScore: 0, badges: [], extra: {} };
  const { backup, skipped } = parseBackup(JSON.stringify(copy), GAMES);
  assert.deepEqual(skipped, ['kidsgames:space-hockey']);
  assert.equal('kidsgames:space-hockey' in backup.entries, false, 'it is never written');
  assert.ok(gameKey('number-ninja') in backup.entries);
});

test('a file that is not a copy made by this site is refused, whatever it is', () => {
  const games = GAMES;
  assert.equal(codeOf(() => parseBackup('not json at all', games)), 'BACKUP_NOT_JSON');
  assert.equal(codeOf(() => parseBackup('', games)), 'BACKUP_NOT_JSON');
  for (const text of ['[]', '42', 'null', '"text"', '{}', '{"app":"another-app","format":1,"entries":{}}', `{"app":"${BACKUP_APP}","format":0,"entries":{}}`,
    `{"app":"${BACKUP_APP}","format":1}`, `{"app":"${BACKUP_APP}","format":1,"entries":[]}`, `{"app":"${BACKUP_APP}","format":"1","entries":{}}`]) {
    assert.equal(codeOf(() => parseBackup(text, games)), 'BACKUP_NOT_OURS', text);
  }
  assert.equal(codeOf(() => parseBackup(`{"app":"${BACKUP_APP}","format":${BACKUP_FORMAT + 1},"entries":{}}`, games)), 'BACKUP_NEWER');
});

test('a file that is too big is refused without being read, counting bytes and not characters', () => {
  assert.equal(codeOf(() => parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1), GAMES)), 'BACKUP_TOO_BIG');
  // Each of these characters is three bytes: under the limit as characters, over it as bytes.
  assert.equal(codeOf(() => parseBackup('अ'.repeat(Math.floor(MAX_BACKUP_BYTES / 3) + 1), GAMES)), 'BACKUP_TOO_BIG');
  assert.equal(codeOf(() => parseBackup(undefined, GAMES)), 'BACKUP_TOO_BIG', 'not even text');
});

test('one bad entry refuses the whole copy: nothing is half-applied', () => {
  const { storage } = playedOn();
  const good = JSON.parse(serializeBackup(createBackup({ storage, games: GAMES, now: NOW })));
  const bad = (change) => { const copy = structuredClone(good); change(copy.entries); return JSON.stringify(copy); };

  assert.equal(codeOf(() => parseBackup(bad((e) => { e[gameKey('number-ninja')].bestStars.easy = 7; }), GAMES)), 'BACKUP_BAD_ENTRY', 'seven stars');
  assert.equal(codeOf(() => parseBackup(bad((e) => { e[gameKey('number-ninja')].badges = [1, 2]; }), GAMES)), 'BACKUP_BAD_ENTRY', 'badges that are not names');
  assert.equal(codeOf(() => parseBackup(bad((e) => { e[SETTINGS_KEY].difficultyLock = 'impossible'; }), GAMES)), 'BACKUP_BAD_ENTRY', 'a lock that is no level');
  assert.equal(codeOf(() => parseBackup(bad((e) => { e[PROFILE_KEY] = 'Brave Panda'; }), GAMES)), 'BACKUP_BAD_ENTRY', 'not an object');
  assert.equal(codeOf(() => parseBackup(bad((e) => { delete e[gameKey('simon-says')].version; }), GAMES)), 'BACKUP_BAD_ENTRY', 'no version');
  assert.equal(codeOf(() => parseBackup(bad((e) => { e[gameKey('simon-says')].version = 2; }), GAMES)), 'BACKUP_NEWER', 'saved by a newer version');
  assert.equal(codeOf(() => parseBackup(JSON.stringify(good), GAMES)), null, 'while the untouched copy is fine');
});

test('only the keys a copy is meant to hold are accepted: the device record and anything odd are refused', () => {
  const { storage } = playedOn();
  const good = JSON.parse(serializeBackup(createBackup({ storage, games: GAMES, now: NOW })));
  for (const key of [DEVICE_KEY, 'other-app:data', 'kidsgames:', 'kidsgames:Bad Key', 'kidsgames:../x', 'kidsgames:a--b', 'constructor', 'toString']) {
    const copy = structuredClone(good);
    copy.entries[key] = { version: 1 };
    assert.equal(codeOf(() => parseBackup(JSON.stringify(copy), GAMES)), 'BACKUP_UNKNOWN_KEY', key);
  }
});

test('a key called __proto__ is refused as an odd key and changes nothing about objects in general', () => {
  const text = `{"app":"${BACKUP_APP}","format":1,"entries":{"__proto__":{"polluted":true}}}`;
  assert.equal(codeOf(() => parseBackup(text, GAMES)), 'BACKUP_UNKNOWN_KEY');
  assert.equal({}.polluted, undefined);
  const inside = `{"app":"${BACKUP_APP}","format":1,"entries":{"${PROFILE_KEY}":{"version":1,"name":"x","avatar":"y","createdAt":1,"__proto__":{"polluted":true}}}}`;
  parseBackup(inside, GAMES);
  assert.equal({}.polluted, undefined, 'and one inside an entry does not reach the prototype either');
});

test('a missing or odd date does not spoil a copy, it is simply unknown', () => {
  const base = { app: BACKUP_APP, format: 1, entries: {} };
  assert.equal(parseBackup(JSON.stringify(base), GAMES).backup.savedAt, null);
  assert.equal(parseBackup(JSON.stringify({ ...base, savedAt: 'last Tuesday' }), GAMES).backup.savedAt, null);
  assert.equal(parseBackup(JSON.stringify({ ...base, savedAt: '2026-11-26T10:30:00.000Z' }), GAMES).backup.savedAt, '2026-11-26T10:30:00.000Z');
});

test('every key a copy may hold has a schema, one per game in the registry', () => {
  const schemas = backupSchemas(GAMES);
  assert.equal(schemas.size, GAMES.length + 3);
  assert.equal(schemas.has(DEVICE_KEY), false);
});

test('each problem has a plain-words message that says nothing was changed', () => {
  const problem = (text) => { try { parseBackup(text, GAMES); } catch (error) { return error; } return null; };
  const cases = {
    BACKUP_TOO_BIG: problem('x'.repeat(MAX_BACKUP_BYTES + 1)),
    BACKUP_NOT_JSON: problem('nope'),
    BACKUP_NOT_OURS: problem('[]'),
    BACKUP_NEWER: problem(`{"app":"${BACKUP_APP}","format":${BACKUP_FORMAT + 1},"entries":{}}`),
    BACKUP_UNKNOWN_KEY: problem(`{"app":"${BACKUP_APP}","format":1,"entries":{"other-app:x":{}}}`),
    BACKUP_BAD_ENTRY: problem(`{"app":"${BACKUP_APP}","format":1,"entries":{"${PROFILE_KEY}":[]}}`),
  };
  for (const [code, error] of Object.entries(cases)) {
    assert.equal(error?.code, code, `the example for ${code} really throws it`);
    assert.match(describeBackupProblem(error), /Nothing was changed\.$/, code);
  }
  assert.match(describeBackupProblem(cases.BACKUP_TOO_BIG), /too big/);
  assert.match(describeBackupProblem(cases.BACKUP_NEWER), /newer version/);
  assert.match(describeBackupProblem(new Error('anything else')), /could not be read\. Nothing was changed\.$/, 'a failure that is not one of ours still gets a plain message');
});
