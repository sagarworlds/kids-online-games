import { GameError } from '../../../engine/utils/errors.js';
import { buildFacts, makeQuestion, correctValue, fullText } from './facts.js';
import { makeOptions } from './distractors.js';
import { createPicker } from './questionPicker.js';
import { penalise, relax } from './weights.js';
import { getLevel, RACE_LENGTH } from './levels.js';

/**
 * @typedef {{ asked: number, correct: number }} TableStats
 * @typedef {{
 *   levelId: string, tables: number[], times: number[], finishMs: number, wrong: number, firstTry: number, asked: number,
 *   perTable: Record<number, TableStats>, weights: import('./weights.js').FactWeights
 * }} RaceSummary
 * @typedef {{
 *   kind: 'invalid'|'correct'|'wrong', progress: number, finished: boolean, equation: string
 * }} AnswerResult
 */

/**
 * The rules of one race, with no screen attached. The scene feeds it answers and the time and draws what it reports.
 *
 * A race ends after RACE_LENGTH *correct* answers. A wrong answer does not end anything: the car wobbles, the
 * question comes back a few questions later, and the fact is made more likely in future races. Only the first time a
 * fact is asked in a race counts towards accuracy and weights, so retries cannot hide a miss or double-punish it.
 */
export class Race {
  #level;
  #tables;
  #rng;
  #length;
  #picker;
  #weights;
  #correct = 0;
  #wrong = 0;
  #firstTry = 0;
  #asked = 0;
  #times = [];
  #perTable = {};
  #current = null;
  #lastMs = 0;
  /** Facts missed and waiting to be asked again: their next showing is a retry, not a fresh question. */
  #retrying = new Set();
  /** Facts missed at any point in this race: they keep their extra weight even if the child later gets them right. */
  #missed = new Set();
  /** Facts already relaxed in this race (a fact asked right twice is only relaxed once). */
  #relaxed = new Set();

  /**
   * @param {{
   *   levelId: 'easy'|'medium'|'hard', tables?: readonly number[], rng: () => number,
   *   weights?: import('./weights.js').FactWeights, length?: number
   * }} options `tables` defaults to the level's own tables ("Mixed").
   */
  constructor({ levelId, tables, rng, weights = {}, length = RACE_LENGTH }) {
    this.#level = getLevel(levelId);
    this.#tables = [...(tables?.length ? tables : this.#level.tables)];
    this.#rng = rng;
    this.#length = length;
    this.#weights = { ...weights };
    this.#picker = createPicker({ facts: buildFacts(this.#tables), weights: this.#weights, rng });
    this.#advance();
  }

  get level() { return this.#level; }
  get length() { return this.#length; }
  /** Correct answers so far. */
  get correct() { return this.#correct; }
  /** @returns {number} How far along the track, 0 to 1. */
  get progress() { return this.#correct / this.#length; }
  get finished() { return this.#correct >= this.#length; }
  /** @returns {import('./facts.js').Question} */
  get question() { return this.#current.question; }
  /** @returns {number[]|null} The four choices, or null when the answer is typed. */
  get options() { return this.#current.options; }

  #advance() {
    const fact = this.#picker.next();
    this.#present(fact, makeQuestion(fact, this.#rng, this.#level.missingFactorChance), !this.#retrying.has(fact.key));
  }

  #present(fact, question, first) {
    const options = this.#level.mode === 'choice' ? makeOptions(question, this.#rng) : null;
    this.#current = { fact, question, options, first };
  }

  /**
   * The child answers the current question.
   * @param {number|string} value A number (a tapped option) or the typed text.
   * @param {number} elapsedMs Time since the race started, used for the ghost; never allowed to go backwards.
   * @returns {AnswerResult}
   * @throws {GameError} 'RACE_FINISHED' if called after the race has ended, 'BAD_TIME' for a non-finite time.
   */
  answer(value, elapsedMs) {
    if (this.finished) throw new GameError('RACE_FINISHED', 'The race is already over');
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new GameError('BAD_TIME', `Elapsed time must be 0 or more (got ${elapsedMs})`, { elapsedMs });
    const { question, fact, first } = this.#current;
    const equation = fullText(question);
    const text = String(value).trim();
    if (!/^\d{1,4}$/.test(text)) return { kind: 'invalid', progress: this.progress, finished: false, equation };
    const right = Number(text) === correctValue(question);

    if (first) {
      this.#asked += 1;
      const stats = (this.#perTable[question.table] ??= { asked: 0, correct: 0 });
      stats.asked += 1;
      if (right) { stats.correct += 1; this.#firstTry += 1; }
      // Weights change at most once per fact per race: a miss triples it, a clean answer halves it, and a fact that
      // was missed earlier in this race is not relaxed by a later lucky answer.
      if (!right && !this.#missed.has(question.key)) {
        this.#weights = penalise(this.#weights, question.key);
        this.#missed.add(question.key);
      } else if (right && !this.#missed.has(question.key) && !this.#relaxed.has(question.key)) {
        this.#weights = relax(this.#weights, question.key);
        this.#relaxed.add(question.key);
      }
    }

    if (right) {
      this.#retrying.delete(question.key);
      this.#lastMs = Math.max(this.#lastMs, elapsedMs);
      this.#times.push(this.#lastMs);
      this.#correct += 1;
      if (!this.finished) this.#advance();
      return { kind: 'correct', progress: this.progress, finished: this.finished, equation };
    }

    this.#wrong += 1;
    this.#retrying.add(question.key);
    this.#picker.retry(fact);
    this.#advance();
    return { kind: 'wrong', progress: this.progress, finished: false, equation };
  }

  /**
   * @returns {RaceSummary}
   * @throws {GameError} 'RACE_UNFINISHED' before the finish line is crossed.
   */
  summary() {
    if (!this.finished) throw new GameError('RACE_UNFINISHED', 'The race has not finished yet');
    return {
      levelId: this.#level.id, tables: this.#tables, times: [...this.#times], finishMs: this.#times[this.#times.length - 1],
      wrong: this.#wrong, firstTry: this.#firstTry, asked: this.#asked,
      perTable: structuredClone(this.#perTable), weights: { ...this.#weights },
    };
  }
}
