import { GameError } from '../../../engine/utils/errors.js';
import { starsForAccuracy } from '../../../engine/utils/stars.js';

/** After this many wrong tries in one round the answer is shown, so nobody is stuck on one round for ever. */
export const MAX_TRIES = 2;

/**
 * A run of rounds in any of the activities. Only the first try at a round counts towards the stars; a wrong try can be
 * repeated, and after MAX_TRIES the answer is shown and the run moves on.
 *
 * @template R
 */
export class RoundSession {
  #rounds;
  #index = 0;
  #tries = 0;
  #answered = false;
  #firstTry = [];
  #missed = [];

  /** @param {readonly R[]} rounds @throws {GameError} 'NO_ROUNDS' */
  constructor(rounds) {
    if (rounds.length === 0) throw new GameError('NO_ROUNDS', 'A run needs at least one round');
    this.#rounds = [...rounds];
  }

  /** The round being played, or null when the run is over. @returns {R|null} */
  get current() {
    return this.over ? null : this.#rounds[this.#index];
  }

  /** 1-based number of the round being played (the last number when over). */
  get position() {
    return Math.min(this.#index + 1, this.#rounds.length);
  }

  get total() {
    return this.#rounds.length;
  }

  get over() {
    return this.#index >= this.#rounds.length;
  }

  /**
   * Records a try at the current round.
   * @param {boolean} correct
   * @returns {{ correct: boolean, tries: number, reveal: boolean }|null}
   *   `reveal` is true when the answer should now be shown: it was right, or the child has had MAX_TRIES wrong tries.
   *   Null if the round is already finished (call `advance`) or the run is over.
   */
  answer(correct) {
    if (this.over || this.#answered) return null;
    this.#tries += 1;
    const reveal = correct || this.#tries >= MAX_TRIES;
    if (this.#tries === 1) {
      this.#firstTry.push(correct);
      if (!correct) this.#missed.push(this.#rounds[this.#index]);
    }
    if (reveal) this.#answered = true;
    return { correct, tries: this.#tries, reveal };
  }

  /** Moves on to the next round once this one is finished. */
  advance() {
    if (!this.#answered) return;
    this.#answered = false;
    this.#tries = 0;
    this.#index += 1;
  }

  /**
   * @returns {{ total: number, correct: number, answered: number, stars: 1|2|3, missed: R[] }}
   *   `correct` counts rounds got right on the first try; rounds not reached count as wrong.
   */
  summary() {
    const correct = this.#firstTry.filter(Boolean).length;
    return { total: this.#rounds.length, correct, answered: this.#firstTry.length, stars: starsForAccuracy(correct / this.#rounds.length), missed: [...this.#missed] };
  }
}
