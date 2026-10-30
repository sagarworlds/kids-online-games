/**
 * @typedef {{ f: number, ms: number, type?: OscillatorType, volume?: number }} Note
 * One tone in a named sound. Notes play back to back.
 */

/** Built-in sounds. All are synthesised, so there are no audio files to download or license. */
const BUILT_IN_SOUNDS = {
  click: [{ f: 640, ms: 45 }],
  pop: [{ f: 520, ms: 40 }, { f: 780, ms: 60 }],
  ding: [{ f: 880, ms: 90 }, { f: 1320, ms: 170 }],
  thud: [{ f: 120, ms: 90, type: 'triangle', volume: 0.35 }, { f: 80, ms: 160, type: 'triangle', volume: 0.35 }],
  boop: [{ f: 260, ms: 110, type: 'triangle' }, { f: 196, ms: 170, type: 'triangle' }],
  chime: [{ f: 523.25, ms: 110 }, { f: 659.25, ms: 110 }, { f: 783.99, ms: 240 }],
  streak: [{ f: 659.25, ms: 80 }, { f: 783.99, ms: 80 }, { f: 987.77, ms: 80 }, { f: 1318.5, ms: 200 }],
  cheer: [
    { f: 523.25, ms: 110 }, { f: 659.25, ms: 110 }, { f: 783.99, ms: 110 },
    { f: 1046.5, ms: 110 }, { f: 783.99, ms: 90 }, { f: 1046.5, ms: 320 },
  ],
};

/**
 * Plays short synthesised sounds with the Web Audio API.
 *
 * Design rules from the spec:
 * - Never crash the game: any failure is logged once and audio goes silent.
 * - Respect the global mute (the `sound` setting) on every call.
 * - Browsers refuse audio before a user gesture, so the context is created
 *   lazily and `armUnlock` resumes it on the first tap or key press.
 */
export class AudioService {
  #settings;
  #createContext;
  #logger;
  #context = null;
  #broken = false;
  #sounds = new Map(Object.entries(BUILT_IN_SOUNDS));

  /**
   * @param {{
   *   settings: { sound: boolean },
   *   createContext?: () => AudioContext,
   *   logger?: Pick<Console, 'error'>
   * }} deps `createContext` is injectable so tests can run without a browser.
   */
  constructor({
    settings,
    createContext = () => new (globalThis.AudioContext ?? globalThis.webkitAudioContext)(),
    logger = console,
  }) {
    this.#settings = settings;
    this.#createContext = createContext;
    this.#logger = logger;
  }

  /** @returns {boolean} True when sound is switched off in the parent settings. */
  get muted() {
    return !this.#settings.sound;
  }

  /**
   * Adds or replaces a named sound (new games extend audio without editing this class).
   * @param {string} name
   * @param {Note[]} notes
   */
  registerSound(name, notes) {
    this.#sounds.set(name, notes);
  }

  /**
   * Starts the audio context. Must be called from inside a user gesture on iOS/Safari.
   */
  unlock() {
    const ctx = this.#getContext();
    if (ctx?.state === 'suspended') {
      try {
        const resumed = ctx.resume();
        resumed?.catch?.((error) => this.#fail(error));
      } catch (error) {
        this.#fail(error);
      }
    }
  }

  /**
   * Unlocks audio on the first pointer or key press anywhere on the page.
   * @param {EventTarget} [target]
   */
  armUnlock(target = globalThis.document) {
    if (!target) return;
    const events = ['pointerdown', 'keydown', 'touchend'];
    const once = () => {
      this.unlock();
      for (const name of events) target.removeEventListener(name, once, true);
    };
    for (const name of events) target.addEventListener(name, once, true);
  }

  /**
   * Plays a named sound. Unknown names are ignored with a single warning in the log.
   * @param {string} name
   */
  play(name) {
    const notes = this.#sounds.get(name);
    if (!notes) {
      this.#logger.error(`[audio] unknown sound "${name}"`);
      return;
    }
    let delay = 0;
    for (const note of notes) {
      this.playTone(note.f, note.ms, { type: note.type, volume: note.volume, delayMs: delay });
      delay += note.ms;
    }
  }

  /**
   * Plays one tone with a short attack and release so it never clicks.
   * @param {number} freqHz
   * @param {number} ms
   * @param {{ type?: OscillatorType, volume?: number, delayMs?: number }} [options]
   */
  playTone(freqHz, ms, { type = 'sine', volume = 0.2, delayMs = 0 } = {}) {
    if (this.muted) return;
    const ctx = this.#getContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume()?.catch?.(() => {});
      const start = ctx.currentTime + delayMs / 1000;
      const duration = ms / 1000;
      // An instant jump from silence to full volume produces an audible click,
      // so ramp up quickly and fade out before the oscillator stops.
      const attack = Math.min(0.01, duration / 4);
      const release = Math.min(0.04, duration / 3);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freqHz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + attack);
      gain.gain.setValueAtTime(volume, start + duration - release);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch (error) {
      this.#fail(error);
    }
  }

  #getContext() {
    if (this.#broken) return null;
    if (!this.#context) {
      try {
        this.#context = this.#createContext();
      } catch (error) {
        this.#fail(error);
        return null;
      }
    }
    return this.#context;
  }

  #fail(error) {
    if (this.#broken) return;
    this.#broken = true;
    this.#logger.error('[audio] Web Audio failed; continuing silently', error);
  }
}
