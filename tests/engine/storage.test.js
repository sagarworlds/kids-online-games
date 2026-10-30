import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  StorageService, STORAGE_NOTICE, createMemoryBackend, detectLocalStorage,
} from '../../src/engine/services/StorageService.js';
import { saveSchema, settingsSchema, gameKey, KEY_PREFIX } from '../../src/engine/services/schemas.js';
import { createFlakyBackend, createLogger } from './helpers.js';

const make = (backend = createMemoryBackend(), logger = createLogger()) =>
  ({ storage: new StorageService({ backend, logger, eventTarget: null }), backend, logger });

test('returns defaults when a key is missing', () => {
  const { storage } = make();
  assert.deepEqual(storage.read('kidsgames:x', saveSchema), saveSchema.defaults());
});

test('round-trips a value', () => {
  const { storage } = make();
  const save = { ...saveSchema.defaults(), bestScore: 42 };
  assert.equal(storage.write('kidsgames:x', save), true);
  assert.equal(storage.read('kidsgames:x', saveSchema).bestScore, 42);
});

test('corrupt JSON resets only that key, logs the key name, and the game carries on', () => {
  const { storage, backend, logger } = make();
  backend.setItem('kidsgames:good', JSON.stringify({ ...saveSchema.defaults(), bestScore: 7 }));
  backend.setItem('kidsgames:bad', '{not json');

  assert.deepEqual(storage.read('kidsgames:bad', saveSchema), saveSchema.defaults());
  assert.equal(backend.getItem('kidsgames:bad'), null, 'bad key is removed');
  assert.match(String(logger.calls.error[0][0]), /kidsgames:bad/);
  assert.equal(storage.read('kidsgames:good', saveSchema).bestScore, 7, 'neighbour untouched');
});

test('valid JSON of the wrong shape is reset like corrupt data', () => {
  const { storage, backend, logger } = make();
  backend.setItem('kidsgames:s', JSON.stringify({ version: 1, bestStars: { easy: 9 }, bestScore: 0, badges: [], extra: {} }));
  assert.deepEqual(storage.read('kidsgames:s', saveSchema), saveSchema.defaults());
  assert.equal(logger.calls.error.length, 1);
  backend.setItem('kidsgames:arr', '[1,2]');
  assert.deepEqual(storage.read('kidsgames:arr', saveSchema), saveSchema.defaults());
});

test('older versions are migrated step by step and saved back', () => {
  const schema = {
    version: 3,
    defaults: () => ({ version: 3, a: 0, b: 0, c: 0 }),
    migrations: {
      1: (old) => ({ ...old, b: 20 }),
      2: (old) => ({ ...old, c: old.b + 1 }),
    },
  };
  const { storage, backend } = make();
  backend.setItem('k', JSON.stringify({ version: 1, a: 5 }));
  const result = storage.read('k', schema);
  assert.deepEqual(result, { version: 3, a: 5, b: 20, c: 21 });
  assert.equal(JSON.parse(backend.getItem('k')).version, 3, 'migrated copy persisted');
});

test('a missing migration step keeps the data and still stamps the new version', () => {
  const schema = { version: 2, defaults: () => ({ version: 2, a: 0 }) };
  const { storage, backend, logger } = make();
  backend.setItem('k', JSON.stringify({ version: 1, a: 9 }));
  assert.deepEqual(storage.read('k', schema), { version: 2, a: 9 });
  assert.equal(logger.calls.warn.length, 1);
});

test('missing localStorage falls back to memory with a notice', () => {
  const { storage } = make(null);
  assert.equal(storage.isPersistent, false);
  assert.equal(storage.notice, STORAGE_NOTICE);
  assert.equal(storage.write('kidsgames:x', { v: 1 }), false);
  assert.deepEqual(storage.read('kidsgames:x', { version: 1, defaults: () => ({}) }).v, 1);
});

test('a full disk (QuotaExceededError) degrades once, keeps data, and notifies once', () => {
  const backend = createFlakyBackend({ 'kidsgames:old': JSON.stringify({ version: 1, n: 1 }) });
  const { storage, logger } = make(backend);
  const notices = [];
  storage.onNotice((m) => notices.push(m));

  assert.equal(storage.write('kidsgames:a', { version: 1 }), true);
  backend.failWrites = true;
  assert.equal(storage.write('kidsgames:b', { version: 1, n: 2 }), false);
  assert.equal(storage.write('kidsgames:c', { version: 1, n: 3 }), false);

  assert.equal(storage.isPersistent, false);
  assert.deepEqual(notices, [STORAGE_NOTICE], 'notice fires exactly once');
  assert.equal(logger.calls.error.length, 1, 'logged once');
  const schema = { version: 1, defaults: () => ({ version: 1, n: 0 }) };
  assert.equal(storage.read('kidsgames:b', schema).n, 2, 'new write readable from memory');
  assert.equal(storage.read('kidsgames:old', schema).n, 1, 'earlier persisted data still readable');
});

test('detectLocalStorage returns null when access throws or writes fail', () => {
  const throwing = { get localStorage() { throw new Error('SecurityError'); } };
  assert.equal(detectLocalStorage(throwing), null);
  assert.equal(detectLocalStorage({}), null);
  assert.equal(detectLocalStorage({ localStorage: createFlakyBackend() }) !== null, true);
  const full = createFlakyBackend();
  full.failWrites = true;
  assert.equal(detectLocalStorage({ localStorage: full }), null);
});

test('clearPrefix removes only kidsgames:* keys (reset must not touch other site data)', () => {
  const { storage, backend } = make();
  backend.setItem('kidsgames:profile', '{}');
  backend.setItem(gameKey('number-ninja'), '{}');
  backend.setItem('other-app:data', 'keep');
  backend.setItem('theme', 'dark');

  const removed = storage.clearPrefix(KEY_PREFIX);
  assert.deepEqual(removed.sort(), ['kidsgames:number-ninja', 'kidsgames:profile']);
  assert.equal(backend.getItem('other-app:data'), 'keep');
  assert.equal(backend.getItem('theme'), 'dark');
  assert.throws(() => storage.clearPrefix(''), { code: 'BAD_PREFIX' });
});

test('write rejects values that cannot be serialised', () => {
  const { storage } = make();
  const loop = {};
  loop.self = loop;
  assert.throws(() => storage.write('k', loop), { code: 'STORAGE_SERIALIZE' });
});

test('onExternalChange forwards storage events from other tabs', () => {
  const target = new EventTarget();
  const storage = new StorageService({ backend: createMemoryBackend(), logger: createLogger(), eventTarget: target });
  const seen = [];
  const off = storage.onExternalChange((key) => seen.push(key));
  target.dispatchEvent(Object.assign(new Event('storage'), { key: 'kidsgames:profile' }));
  off();
  target.dispatchEvent(Object.assign(new Event('storage'), { key: 'kidsgames:after' }));
  assert.deepEqual(seen, ['kidsgames:profile']);
});

test('settings schema rejects an invalid difficultyLock', () => {
  const { storage, backend } = make();
  backend.setItem('s', JSON.stringify({ version: 1, sound: true, readAloud: false, difficultyLock: 'insane' }));
  assert.deepEqual(storage.read('s', settingsSchema), settingsSchema.defaults());
});
