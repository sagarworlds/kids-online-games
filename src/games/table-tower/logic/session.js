import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { factsForFloor, parseFactKey, floorsOfFact } from './facts.js';
import { makeQuestion, pickHide } from './questions.js';
import { weightOf, dueKeys } from './memory.js';

/** A fact that was missed in a Revision comes back after this many other questions. */
export const REQUEUE_GAP = 3;
/** ... and at most this many times. */
export const MAX_REQUEUES = 2;
/** Questions in a Revision round. */
export const REVISION_QUESTIONS = 10;
/** A Challenge mixes in this many questions from floors cleared before. */
export const REVIEW_QUESTIONS = 2;

/**
 * Picks `count` different items at random, where an item with a bigger weight is more likely.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => number} weight
 * @param {number} count
 * @param {() => number} rng
 * @returns {T[]}
 */
export function pickWeighted(items, weight, count, rng) {
  const pool = [...items];
  const out = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + weight(item), 0);
    let roll = rng() * total;
    let index = pool.findIndex((item) => (roll -= weight(item)) < 0);
    if (index === -1) index = pool.length - 1;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/**
 * The questions of a Challenge on one floor: all ten facts of the floor, and two from floors cleared before (weaker facts
 * more likely), in a random order. With nothing cleared before, the two weakest facts of the floor are asked again.
 *
 * @param {{
 *   floor: number, level: import('./levels.js').LevelConfig, memory: import('./memory.js').Memory,
 *   clearedBefore: readonly number[], rng: () => number
 * }} options
 * @returns {import('./questions.js').Question[]}
 */
export function buildChallenge({ floor, level, memory, clearedBefore, rng }) {
  const own = factsForFloor(floor);
  const ownKeys = new Set(own.map((f) => f.key));
  const reviewPool = new Map();
  for (const f of clearedBefore.filter((n) => n !== floor)) for (const fact of factsForFloor(f)) if (!ownKeys.has(fact.key)) reviewPool.set(fact.key, fact);
  let extra = pickWeighted([...reviewPool.values()], (fact) => weightOf(memory[fact.key]), Math.min(REVIEW_QUESTIONS, reviewPool.size), rng);
  if (extra.length < REVIEW_QUESTIONS) {
    const weakest = pickWeighted(own, (fact) => weightOf(memory[fact.key]), REVIEW_QUESTIONS - extra.length, rng);
    extra = [...extra, ...weakest];
  }
  const facts = [...own, ...extra];
  if (facts.length !== level.questions) throw new GameError('BAD_CHALLENGE', `A challenge needs ${level.questions} questions but has ${facts.length}`, { floor });
  return shuffle(rng, facts).map((fact) => makeQuestion({ fact, floor: own.includes(fact) ? floor : undefined, rng, hide: pickHide(level, rng) }));
}

/**
 * The questions of a Revision: facts that are due, weakest first, then other facts the child has met (lowest box first).
 * Nothing the child has never been asked is included, so revision is only about facts they have already met.
 *
 * @param {{
 *   level: import('./levels.js').LevelConfig, memory: import('./memory.js').Memory, today: number, rng: () => number,
 *   count?: number
 * }} options
 * @returns {import('./questions.js').Question[]} Empty if there is nothing to revise yet.
 */
export function buildRevision({ level, memory, today, rng, count = REVISION_QUESTIONS }) {
  const due = dueKeys(memory, today);
  const rest = Object.keys(memory)
    .filter((key) => !due.includes(key))
    .sort((a, b) => memory[a].box - memory[b].box || memory[a].due - memory[b].due);
  const keys = [...due, ...rest].slice(0, count);
  return shuffle(rng, keys).map((key) => {
    const fact = parseFactKey(key);
    const floors = floorsOfFact(fact);
    return makeQuestion({ fact, floor: floors[Math.floor(rng() * floors.length)], rng, hide: pickHide(level, rng) });
  });
}

/**
 * A run of questions. It keeps no clock of its own: the scene feeds it time with `tick`. In a Revision a wrong answer puts
 * the question back a few places later (so it can be tried again); a Challenge does not.
 *
 * @typedef {{ key: string, correct: boolean }} FirstResult
 */
export class QuizSession {
  /** Each entry is a question, and `copy` is true for one put back after a miss (those are practice, not scored). */
  #queue;
  #total;
  #index = 0;
  /** One result for each scored question answered, in order. */
  #answers = [];
  #missed = [];
  #requeues = new Map();
  #answeredCurrent = false;
  #secondsLeft;
  #requeue;
  #timedOut = false;

  /**
   * @param {{ questions: import('./questions.js').Question[], seconds?: number|null, requeue?: boolean }} options
   * @throws {GameError} 'NO_QUESTIONS'
   */
  constructor({ questions, seconds = null, requeue = false }) {
    if (questions.length === 0) throw new GameError('NO_QUESTIONS', 'A quiz needs at least one question');
    this.#queue = questions.map((question) => ({ question, copy: false }));
    this.#total = questions.length;
    this.#secondsLeft = seconds;
    this.#requeue = requeue;
  }

  /** The question to answer now, or null when the run is over. @returns {import('./questions.js').Question|null} */
  get current() {
    return this.over ? null : this.#queue[this.#index].question;
  }

  /** How many scored questions have been reached, counting the one on screen, for "Question 3 of 12". */
  get position() {
    const entry = this.over ? null : this.#queue[this.#index];
    return Math.min(this.#total, this.#answers.length + (entry && !entry.copy && !this.#answeredCurrent ? 1 : 0));
  }

  get total() {
    return this.#total;
  }

  /** Seconds left, or null if there is no time limit. */
  get secondsLeft() {
    return this.#secondsLeft;
  }

  get over() {
    return this.#timedOut || this.#index >= this.#queue.length;
  }

  /**
   * Checks an answer to the current question.
   * @param {number} value
   * @returns {{ correct: boolean, expected: number, question: import('./questions.js').Question, repeat: boolean }|null}
   *   Null if the question was already answered (call `advance` first) or the run is over. `repeat` is true for a question
   *   put back after a miss: it is practice, so it is not scored.
   */
  answer(value) {
    if (this.over || this.#answeredCurrent) return null;
    const { question, copy } = this.#queue[this.#index];
    this.#answeredCurrent = true;
    const correct = value === question.answer;
    if (!copy) {
      this.#answers.push({ key: question.key, correct });
      if (!correct) this.#missed.push(question);
    }
    if (!correct && this.#requeue) this.#putBack(question);
    return { correct, expected: question.answer, question, repeat: copy };
  }

  #putBack(question) {
    const used = this.#requeues.get(question.key) ?? 0;
    if (used >= MAX_REQUEUES) return;
    this.#requeues.set(question.key, used + 1);
    const at = Math.min(this.#queue.length, this.#index + 1 + REQUEUE_GAP);
    this.#queue.splice(at, 0, { question, copy: true });
  }

  /** Moves on to the next question (after the answer has been shown). */
  advance() {
    if (!this.#answeredCurrent) return;
    this.#answeredCurrent = false;
    this.#index += 1;
  }

  /**
   * Counts down the time.
   * @param {number} dt Seconds.
   * @returns {boolean} True the moment the time runs out.
   */
  tick(dt) {
    if (this.#secondsLeft === null || this.over) return false;
    this.#secondsLeft = Math.max(0, this.#secondsLeft - dt);
    if (this.#secondsLeft === 0) {
      this.#timedOut = true;
      return true;
    }
    return false;
  }

  /**
   * How the run went. Every scored question counts, even when a fact is asked twice; questions never answered (time ran
   * out) count as wrong. `firstResults` has one entry for each fact, from its first answer, which is what memory is told.
   * @returns {{
   *   total: number, correct: number, answered: number, timedOut: boolean, secondsLeft: number,
   *   firstResults: FirstResult[], missed: import('./questions.js').Question[], unanswered: number
   * }}
   */
  summary() {
    const firstResults = [];
    for (const answer of this.#answers) if (!firstResults.some((r) => r.key === answer.key)) firstResults.push({ ...answer });
    const missed = [];
    for (const question of this.#missed) if (!missed.some((q) => q.key === question.key)) missed.push(question);
    return {
      total: this.#total,
      correct: this.#answers.filter((a) => a.correct).length,
      answered: this.#answers.length,
      timedOut: this.#timedOut,
      secondsLeft: this.#secondsLeft ?? 0,
      firstResults,
      missed,
      unanswered: this.#total - this.#answers.length,
    };
  }
}
