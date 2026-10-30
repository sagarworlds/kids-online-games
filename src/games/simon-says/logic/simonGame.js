import { GameError } from '../../../engine/utils/errors.js';
import { randInt } from '../../../engine/utils/random.js';

/**
 * @typedef {'idle'|'playing'|'input'|'retry'|'over'} Phase
 * @typedef {'ok'|'roundComplete'|'retry'|'gameOver'|'ignored'} PressResult
 */

/** A wrong answer gets one retry per sequence: two wrong answers on the same sequence end the game. */
export const LIVES_PER_SEQUENCE = 2;

/**
 * The rules of Simon Says, with no sound, DOM or timers (the scene plays the sequence and runs the clock).
 *
 * Flow: `start()` -> the scene plays `sequence` -> `beginInput()` -> the child calls `press(pad)` for each step ->
 * `'roundComplete'` -> `addStep()` -> repeat. A wrong press (or a timeout) replays the same sequence once
 * (`'retry'`); a second wrong press on that sequence ends the game (`'gameOver'`).
 */
export class SimonGame {
  #sequence = [];
  #padCount;
  #reverse;
  #startLength;
  #rng;
  #inputIndex = 0;
  #phase = 'idle';
  #lives = LIVES_PER_SEQUENCE;
  #best = 0;
  #rounds = 0;
  #replayUsed = false;

  /**
   * @param {{ pads: number, startLength: number, reverse?: boolean, rng: () => number }} options
   * @throws {GameError} 'BAD_CONFIG' for fewer than 2 pads or a start length below 1.
   */
  constructor({ pads, startLength, reverse = false, rng }) {
    if (!Number.isInteger(pads) || pads < 2 || !Number.isInteger(startLength) || startLength < 1) {
      throw new GameError('BAD_CONFIG', 'Simon needs at least 2 pads and a start length of 1 or more', { pads, startLength });
    }
    this.#padCount = pads;
    this.#startLength = startLength;
    this.#reverse = reverse;
    this.#rng = rng;
  }

  /** @returns {readonly number[]} The pad ids the child has to repeat (in playing order). */
  get sequence() { return this.#sequence; }
  /** @returns {Phase} */
  get phase() { return this.#phase; }
  get lives() { return this.#lives; }
  /** @returns {number} Longest sequence completed so far: the score. */
  get best() { return this.#best; }
  /** @returns {number} Sequences completed so far. Drives the playback speed-up. */
  get roundsCompleted() { return this.#rounds; }
  get reverse() { return this.#reverse; }
  get inputIndex() { return this.#inputIndex; }
  get replayAvailable() { return !this.#replayUsed && this.#phase !== 'over'; }

  /** Starts a new game with a random sequence of the level's start length. */
  start() {
    this.#sequence = Array.from({ length: this.#startLength }, () => this.#randomPad());
    this.#reset();
    this.#best = 0;
    this.#rounds = 0;
    this.#phase = 'playing';
  }

  /**
   * Adds one random step for the next round and gets ready to play it.
   * @returns {readonly number[]}
   */
  addStep() {
    this.#sequence = [...this.#sequence, this.#randomPad()];
    this.#reset();
    this.#phase = 'playing';
    return this.#sequence;
  }

  /** Called by the scene when it has finished playing the sequence: the child may answer now. */
  beginInput() {
    if (this.#phase === 'playing' || this.#phase === 'retry') {
      this.#inputIndex = 0;
      this.#phase = 'input';
    }
  }

  /**
   * Uses the one free replay of this sequence. It costs nothing and does not touch the retry.
   * @returns {boolean} False if it was already used (or the game is over).
   */
  useReplay() {
    if (!this.replayAvailable) return false;
    this.#replayUsed = true;
    return true;
  }

  /**
   * The child presses a pad.
   * - Taps while the sequence is playing (or before it starts) are ignored, never queued.
   * - In Reverse mode the answer is the sequence backwards.
   *
   * @param {number} padId
   * @returns {PressResult}
   */
  press(padId) {
    if (this.#phase !== 'input') return 'ignored';
    const expected = this.#reverse
      ? this.#sequence[this.#sequence.length - 1 - this.#inputIndex]
      : this.#sequence[this.#inputIndex];
    if (padId !== expected) return this.#fail();

    this.#inputIndex += 1;
    if (this.#inputIndex < this.#sequence.length) return 'ok';
    this.#best = Math.max(this.#best, this.#sequence.length);
    this.#rounds += 1;
    this.#phase = 'idle'; // the scene calls addStep() when it is ready for the next round
    return 'roundComplete';
  }

  /** The input timer ran out: counts exactly like a wrong press. @returns {PressResult} */
  timeout() {
    if (this.#phase !== 'input') return 'ignored';
    return this.#fail();
  }

  #fail() {
    this.#lives -= 1;
    if (this.#lives > 0) {
      this.#phase = 'retry';
      this.#inputIndex = 0;
      return 'retry';
    }
    this.#phase = 'over';
    return 'gameOver';
  }

  #reset() {
    this.#inputIndex = 0;
    this.#lives = LIVES_PER_SEQUENCE;
    this.#replayUsed = false;
  }

  #randomPad() {
    return randInt(this.#rng, 0, this.#padCount - 1);
  }
}
