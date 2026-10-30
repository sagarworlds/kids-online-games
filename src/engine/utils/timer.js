import { GameError } from './errors.js';

/**
 * Resolves after `ms` milliseconds, or rejects if the signal aborts first.
 * Scenes pass the AbortSignal of an AbortController they abort in `exit()`, so
 * no sound or animation step fires after the player has left.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 * @throws {GameError} Rejects with code 'ABORTED' when cancelled.
 */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GameError('ABORTED', 'sleep aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(new GameError('ABORTED', 'sleep aborted'));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A countdown driven by the game loop's `dt` instead of wall-clock timers, so
 * it freezes automatically while the game is paused.
 */
export class Countdown {
  /** @param {number} seconds Starting duration. */
  constructor(seconds) {
    this.duration = seconds;
    this.remaining = seconds;
  }

  /** @returns {boolean} True once the time has run out. */
  get done() {
    return this.remaining <= 0;
  }

  /**
   * Advances the countdown.
   * @param {number} dt Seconds since the last tick.
   * @returns {boolean} True on the tick where it reaches zero.
   */
  tick(dt) {
    if (this.done) return false;
    this.remaining = Math.max(0, this.remaining - dt);
    return this.done;
  }

  /** Restarts from the full duration (or a new one). @param {number} [seconds] */
  reset(seconds = this.duration) {
    this.duration = seconds;
    this.remaining = seconds;
  }
}
