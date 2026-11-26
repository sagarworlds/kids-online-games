import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { LastPlayedService } from '../../src/engine/services/LastPlayedService.js';
import { DEVICE_KEY, KEY_PREFIX, LAST_PLAYED_KEY, PROFILE_KEY, SETTINGS_KEY, gameKey } from '../../src/engine/services/schemas.js';
import { GAMES } from '../../src/hub/gamesRegistry.js';
import { pickContinueGame } from '../../src/hub/continueGame.js';
import { resetAllProgress } from '../../src/hub/resetProgress.js';
import { createLogger } from '../engine/helpers.js';

const newStorage = () => new StorageService({ backend: createMemoryBackend(), logger: createLogger(), eventTarget: null });

// ---- which game is offered -------------------------------------------------

test('the game played last is the registry entry itself, so only registry data reaches the page', () => {
  const picked = pickContinueGame({ slug: 'lights-out', at: 1 }, GAMES);
  assert.equal(picked, GAMES.find((game) => game.slug === 'lights-out'));
  assert.equal(picked.path, 'src/games/lights-out/index.html');
});

test('nothing remembered, or a slug the registry does not know, offers no game', () => {
  assert.equal(pickContinueGame(null, GAMES), null);
  assert.equal(pickContinueGame({ slug: '', at: 0 }, GAMES), null);
  for (const slug of ['no-such-game', 'Lights-Out', ' lights-out', '../../etc/passwd', 'javascript:alert(1)', '__proto__', 'constructor']) {
    assert.equal(pickContinueGame({ slug, at: 1 }, GAMES), null, slug);
  }
});

test('a game that is not available yet is not offered', () => {
  const games = [{ slug: 'later', title: 'Later', available: false }, { slug: 'now', title: 'Now', available: true }];
  assert.equal(pickContinueGame({ slug: 'later', at: 1 }, games), null);
  assert.equal(pickContinueGame({ slug: 'now', at: 1 }, games).title, 'Now');
});

test('anything that is not a record with a string slug offers no game', () => {
  for (const bad of [undefined, 0, 'lights-out', { slug: 5 }, { slug: null }, {}]) {
    assert.equal(pickContinueGame(bad, GAMES), null, JSON.stringify(bad));
  }
});

// ---- the record and the rest of what is stored -------------------------------

test('no game folder shares its name with a key the site keeps for itself', () => {
  // kidsgames:<slug> is a game's save, so a game called "last-played" would be read as the record of the game played last.
  const reserved = [PROFILE_KEY, SETTINGS_KEY, DEVICE_KEY, LAST_PLAYED_KEY];
  for (const game of GAMES) assert.ok(!reserved.includes(gameKey(game.slug)), game.slug);
});

test('"Reset all progress" forgets the last game and keeps the name; "Also reset name" takes the name too', () => {
  const storage = newStorage();
  storage.write(PROFILE_KEY, { version: 1, name: 'Brave Panda', avatar: '🐼', createdAt: 1 });
  const lastPlayed = new LastPlayedService({ storage });
  lastPlayed.record('pizza-fractions');
  assert.equal(lastPlayed.current().slug, 'pizza-fractions');

  resetAllProgress({ storage });
  assert.equal(lastPlayed.current(), null, 'nothing to continue after a reset');
  assert.ok(storage.keys(KEY_PREFIX).includes(PROFILE_KEY), 'the name stays');

  lastPlayed.record('pizza-fractions');
  resetAllProgress({ storage, alsoResetName: true });
  assert.deepEqual(storage.keys(KEY_PREFIX), [], 'everything is gone');
});
