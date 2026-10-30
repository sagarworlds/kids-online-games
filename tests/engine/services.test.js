import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { SettingsService } from '../../src/engine/services/SettingsService.js';
import { RewardService } from '../../src/engine/services/RewardService.js';
import { AudioService } from '../../src/engine/services/AudioService.js';
import { SpeechService } from '../../src/engine/services/SpeechService.js';
import { createLogger } from './helpers.js';

const newStorage = () => new StorageService({ backend: createMemoryBackend(), logger: createLogger(), eventTarget: null });

// ---- SettingsService -------------------------------------------------------

test('settings default to sound on, read-aloud off, no lock', () => {
  const s = new SettingsService({ storage: newStorage() });
  assert.deepEqual(s.get(), { version: 1, sound: true, readAloud: false, difficultyLock: null });
});

test('settings persist, notify, and validate', () => {
  const storage = newStorage();
  const s = new SettingsService({ storage });
  const seen = [];
  const off = s.onChange((v) => seen.push(v.sound));
  s.set({ sound: false, difficultyLock: 'easy' });
  off();
  s.set({ sound: true });
  assert.deepEqual(seen, [false]);
  assert.equal(new SettingsService({ storage }).difficultyLock, 'easy', 'survives a reload');
  assert.throws(() => s.set({ difficultyLock: 'extreme' }), { code: 'INVALID_SETTING' });
  assert.throws(() => s.set({ sound: 'yes' }), { code: 'INVALID_SETTING' });
});

test('settings.get() returns a copy', () => {
  const s = new SettingsService({ storage: newStorage() });
  s.get().sound = false;
  assert.equal(s.sound, true);
});

// ---- RewardService ---------------------------------------------------------

test('recordRound keeps the best stars per level and the best score', () => {
  const r = new RewardService({ storage: newStorage() });
  assert.equal(r.hasPlayed('number-ninja'), false);

  let out = r.recordRound('number-ninja', 'easy', { stars: 2, score: 100 });
  assert.equal(out.improvedStars, true);
  out = r.recordRound('number-ninja', 'easy', { stars: 1, score: 50 });
  assert.equal(out.improvedStars, false);
  assert.equal(out.improvedScore, false);
  r.recordRound('number-ninja', 'hard', { stars: 3, score: 300 });

  const save = r.getSave('number-ninja');
  assert.deepEqual(save.bestStars, { easy: 2, hard: 3 });
  assert.equal(save.bestScore, 300);
  assert.equal(r.starsFor('number-ninja'), 5);
  assert.equal(r.hasPlayed('number-ninja'), true);
});

test('totalStars sums across games; unplayed games count as zero', () => {
  const r = new RewardService({ storage: newStorage() });
  r.recordRound('a', 'easy', { stars: 3 });
  r.recordRound('b', 'easy', { stars: 2 });
  assert.equal(r.totalStars(['a', 'b', 'c']), 5);
});

test('recordRound rejects invalid star counts', () => {
  const r = new RewardService({ storage: newStorage() });
  for (const stars of [0, 4, 2.5, NaN, undefined]) {
    assert.throws(() => r.recordRound('a', 'easy', { stars }), { code: 'BAD_STARS' });
  }
});

test('badges are awarded once', () => {
  const r = new RewardService({ storage: newStorage() });
  assert.equal(r.awardBadge('a', 'first-win'), true);
  assert.equal(r.awardBadge('a', 'first-win'), false);
  assert.deepEqual(r.getSave('a').badges, ['first-win']);
});

test('update() stores game-specific data in save.extra', () => {
  const r = new RewardService({ storage: newStorage() });
  r.update('a', (save) => { save.extra.unlocked = 4; });
  assert.equal(r.getSave('a').extra.unlocked, 4);
});

// ---- AudioService ----------------------------------------------------------

function fakeAudioContext() {
  const log = { oscillators: [], resumed: 0 };
  const ctx = {
    state: 'suspended',
    currentTime: 10,
    destination: {},
    resume() { log.resumed += 1; ctx.state = 'running'; return Promise.resolve(); },
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 }, connect: (n) => n };
    },
    createOscillator() {
      const osc = { frequency: {}, type: '', connect: (n) => n, start(t) { osc.startedAt = t; }, stop() {} };
      log.oscillators.push(osc);
      return osc;
    },
  };
  return { ctx, log };
}

test('audio plays each note of a named sound, offset in time', () => {
  const { ctx, log } = fakeAudioContext();
  const audio = new AudioService({ settings: { sound: true }, createContext: () => ctx, logger: createLogger() });
  audio.play('ding');
  assert.equal(log.oscillators.length, 2);
  assert.ok(log.oscillators[1].startedAt > log.oscillators[0].startedAt);
  assert.equal(log.resumed, 1, 'suspended context is resumed');
});

test('audio is silent when muted, and never creates a context', () => {
  let created = 0;
  const audio = new AudioService({
    settings: { sound: false }, createContext: () => { created += 1; return fakeAudioContext().ctx; }, logger: createLogger(),
  });
  audio.play('ding');
  audio.playTone(440, 100);
  assert.equal(created, 0);
});

test('audio failure is logged once and never throws', () => {
  const logger = createLogger();
  const audio = new AudioService({
    settings: { sound: true }, createContext: () => { throw new Error('no audio'); }, logger,
  });
  assert.doesNotThrow(() => { audio.play('ding'); audio.play('pop'); audio.unlock(); });
  assert.equal(logger.calls.error.length, 1);
});

test('unknown sound names are reported, not thrown', () => {
  const logger = createLogger();
  const audio = new AudioService({ settings: { sound: true }, createContext: () => fakeAudioContext().ctx, logger });
  assert.doesNotThrow(() => audio.play('nope'));
  assert.equal(logger.calls.error.length, 1);
});

test('registerSound adds new sounds without editing the service', () => {
  const { ctx, log } = fakeAudioContext();
  const audio = new AudioService({ settings: { sound: true }, createContext: () => ctx, logger: createLogger() });
  audio.registerSound('three', [{ f: 1, ms: 10 }, { f: 2, ms: 10 }, { f: 3, ms: 10 }]);
  audio.play('three');
  assert.equal(log.oscillators.length, 3);
});

// ---- SpeechService ---------------------------------------------------------

function fakeSynth(voices = []) {
  const spoken = [];
  return {
    spoken, cancelled: 0,
    synth: {
      getVoices: () => voices,
      speak: (u) => spoken.push(u),
      cancel() { this.cancelled += 1; },
    },
    Utterance: class { constructor(text) { this.text = text; } },
  };
}

test('speech respects the read-aloud setting unless forced', () => {
  const off = fakeSynth();
  const quiet = new SpeechService({ settings: { readAloud: false }, synth: off.synth, Utterance: off.Utterance });
  assert.equal(quiet.speak('hello'), false);
  assert.equal(quiet.speak('hello', { force: true }), true, 'speaker icon works regardless');
  assert.equal(off.spoken[0].text, 'hello');
  assert.equal(off.spoken[0].lang, 'en-IN');

  const on = fakeSynth();
  const loud = new SpeechService({ settings: { readAloud: true }, synth: on.synth, Utterance: on.Utterance });
  assert.equal(loud.speak('hi', { lang: 'hi-IN' }), true);
  assert.equal(on.spoken[0].lang, 'hi-IN');
});

test('unsupported speech does nothing and does not throw', () => {
  const s = new SpeechService({ settings: { readAloud: true }, synth: null, Utterance: null });
  assert.equal(s.supported, false);
  assert.equal(s.speak('x', { force: true }), false);
  assert.equal(s.hasVoice('hi-IN'), false);
  assert.doesNotThrow(() => s.cancel());
});

test('hasVoice matches on the language part of the tag', () => {
  const f = fakeSynth([{ lang: 'en_US' }, { lang: 'hi-IN' }]);
  const s = new SpeechService({ settings: { readAloud: true }, synth: f.synth, Utterance: f.Utterance });
  assert.equal(s.hasVoice('hi-IN'), true);
  assert.equal(s.hasVoice('en-IN'), true);
  assert.equal(s.hasVoice('ta-IN'), false);
});

test('a throwing synth is caught and logged', () => {
  const logger = createLogger();
  const s = new SpeechService({
    settings: { readAloud: true }, logger,
    synth: { getVoices: () => [], cancel() {}, speak() { throw new Error('boom'); } },
    Utterance: class {},
  });
  assert.equal(s.speak('x'), false);
  assert.equal(logger.calls.error.length, 1);
});
