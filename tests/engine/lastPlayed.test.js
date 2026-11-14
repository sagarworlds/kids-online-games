import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { LastPlayedService } from '../../src/engine/services/LastPlayedService.js';
import { KEY_PREFIX, LAST_PLAYED_KEY } from '../../src/engine/services/schemas.js';
import { createLogger } from './helpers.js';

const newStorage = (backend = createMemoryBackend(), logger = createLogger()) => new StorageService({ backend, logger, eventTarget: null });
const newService = (storage = newStorage(), now = () => 1_700_000_000_000) => new LastPlayedService({ storage, now });

test('nothing is remembered on a first visit', () => {
  assert.equal(newService().current(), null);
});

test('record() remembers the game and when, and current() gives it back', () => {
  const service = newService(newStorage(), () => 1234);
  service.record('lights-out');
  assert.deepEqual(service.current(), { slug: 'lights-out', at: 1234 });
});

test('it lasts from one page to the next: a new service on the same storage sees it', () => {
  const backend = createMemoryBackend();
  newService(newStorage(backend)).record('planet-hop');
  assert.equal(newService(newStorage(backend)).current().slug, 'planet-hop');
});

test('the latest game replaces the one before it', () => {
  let clock = 100;
  const service = newService(newStorage(), () => clock);
  service.record('number-ninja');
  clock = 200;
  service.record('simon-says');
  assert.deepEqual(service.current(), { slug: 'simon-says', at: 200 });
});

test('noting the game that is already remembered writes nothing, so it can be called on every screen change', () => {
  const backend = createMemoryBackend();
  let clock = 100;
  const service = newService(newStorage(backend), () => clock);
  assert.equal(service.record('lights-out'), true, 'the first time it changes the record');
  const stored = backend.getItem(LAST_PLAYED_KEY);
  clock = 200;
  assert.equal(service.record('lights-out'), false, 'the same game again changes nothing');
  assert.equal(backend.getItem(LAST_PLAYED_KEY), stored, 'and writes nothing');
  assert.deepEqual(service.current(), { slug: 'lights-out', at: 100 }, 'the time is when it became the game played last');
  assert.equal(service.record('simon-says'), true, 'another game changes it');
  assert.equal(service.record('lights-out'), true, 'and going back to the first one changes it again');
  assert.deepEqual(service.current(), { slug: 'lights-out', at: 200 });
});

test('a slug that is not a string with something in it is refused, and nothing is written', () => {
  const storage = newStorage();
  const service = newService(storage);
  for (const bad of ['', undefined, null, 42, {}, ['lights-out']]) {
    assert.throws(() => service.record(bad), (e) => e.code === 'BAD_SLUG', String(bad));
  }
  assert.deepEqual(storage.keys(KEY_PREFIX), []);
});

test('the record is one small object with a version, under the kidsgames: prefix', () => {
  const backend = createMemoryBackend();
  newService(newStorage(backend), () => 5).record('shop-keeper');
  assert.ok(LAST_PLAYED_KEY.startsWith(KEY_PREFIX), 'so "Reset all progress" clears it with everything else');
  assert.deepEqual(JSON.parse(backend.getItem(LAST_PLAYED_KEY)), { version: 1, slug: 'shop-keeper', at: 5 });
});

test('a damaged record counts as nothing and is cleared, with its key named in the log', () => {
  const backend = createMemoryBackend();
  backend.setItem(LAST_PLAYED_KEY, '{not json');
  const logger = createLogger();
  assert.equal(newService(newStorage(backend, logger)).current(), null);
  assert.equal(backend.getItem(LAST_PLAYED_KEY), null, 'the damaged value is gone');
  assert.match(String(logger.calls.error[0][0]), /last-played/);
});

test('a record of the wrong shape counts as nothing too', () => {
  const wrong = [{ version: 1, slug: 7, at: 1 }, { version: 1, slug: 'x', at: 'later' }, { version: 1, slug: 'x', at: null }, ['x'], 'x'];
  for (const bad of wrong) {
    const backend = createMemoryBackend();
    backend.setItem(LAST_PLAYED_KEY, JSON.stringify(bad));
    assert.equal(newService(newStorage(backend)).current(), null, JSON.stringify(bad));
  }
});

test('without storage that lasts it is kept for this page only, and nothing breaks', () => {
  const memoryOnly = () => new StorageService({ backend: null, logger: createLogger(), eventTarget: null });
  const service = newService(memoryOnly());
  service.record('trace-trail');
  assert.equal(service.current().slug, 'trace-trail');
  assert.equal(newService(memoryOnly()).current(), null, 'the next page starts with nothing');
});
