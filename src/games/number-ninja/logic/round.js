import { pick } from '../../../engine/utils/random.js';
import { getLevel } from './levels.js';
import { generateProblem, problemKey } from './problemGenerator.js';
import { accuracyOf, scoreAnswer, starsFor } from './scoring.js';
import { findLowest, findTarget } from './answerMatcher.js';
import { hintFor } from './hints.js';

/**
 * A falling star. `y` runs from 0 (top) to 1 (ground) so the rules do not
 * depend on screen size; the scene maps it to pixels.
 * @typedef {{
 *   id: number, a: number, b: number, op: import('./levels.js').Op, answer: number,
 *   x: number, y: number, speed: number, lane: number, spawnedAt: number
 * }} Problem
 * `x` is the lane centre (0 to 1), `speed` is ground-fractions per second,
 * `spawnedAt` is round time in seconds.
 */

export const TOTAL_PROBLEMS = 20;
export const START_SHIELDS = 5;
/** Fall speed rises 5% after every 5 correct answers. */
export const SPEEDUP_EVERY = 5;
export const SPEEDUP_FACTOR = 1.05;
/** A hint appears after this many wrong answers in a row. */
export const HINT_AFTER_WRONG = 2;
/** Show the "Ninja streak!" banner every this many correct answers in a row. */
export const STREAK_MILESTONE = 5;

const RECENT_WINDOW = 5;
const MIN_SPAWN_GAP = 1.5;
const EMPTY_SCREEN_GAP = 0.6;
/** Lanes whose newest star is still above this height count as busy, so new stars do not stack on top of it. */
const BUSY_HEIGHT = 0.4;

/**
 * @typedef {{ type: 'spawn', problem: Problem }
 *   | { type: 'landed', problem: Problem, shields: number }
 *   | { type: 'end', reason: 'complete'|'shields' }} RoundEvent
 *
 * @typedef {{ type: 'hit', problem: Problem, points: number, streak: number, milestone: boolean, ended: boolean }
 *   | { type: 'wrong', value: number, wrongInARow: number, hint: string|null }
 *   | { type: 'ignored' }} SubmitResult
 */

/**
 * The rules of one Number Ninja round, with no DOM, canvas or timers: the
 * scene feeds it `update(dt)` and `submit(value)` and draws what it reports.
 *
 * Ends after {@link TOTAL_PROBLEMS} stars are resolved, or when shields run out.
 */
export class NinjaRound {
  #level;
  #ops;
  #rng;
  #total;
  #laneCount;

  #active = [];
  #shields;
  #score = 0;
  #streak = 0;
  #bestStreak = 0;
  #correct = 0;
  #wrong = 0;
  #wrongInARow = 0;
  #missed = [];
  #solved = [];
  #spawned = 0;
  #resolved = 0;
  #nextId = 1;
  #elapsed = 0;
  #sinceSpawn = Infinity; // so the very first star can appear straight away
  #fallTime;
  #recentKeys = [];
  #finished = false;
  #endReason = null;

  /**
   * @param {{
   *   levelId: 'easy'|'medium'|'hard', ops: readonly import('./levels.js').Op[], rng: () => number,
   *   totalProblems?: number, shields?: number, lanes?: number
   * }} options
   * @throws {GameError} 'UNKNOWN_LEVEL', or 'NO_OPERATIONS' when none of `ops` exist at this level.
   */
  constructor({ levelId, ops, rng, totalProblems = TOTAL_PROBLEMS, shields = START_SHIELDS, lanes = 5 }) {
    this.#level = getLevel(levelId);
    this.#ops = [...ops];
    this.#rng = rng;
    this.#total = totalProblems;
    this.#shields = shields;
    this.#laneCount = lanes;
    this.#fallTime = this.#level.fallTime.start;
    // Fail fast on an unusable op selection rather than on the first spawn mid-game.
    generateProblem(levelId, this.#ops, () => 0.5);
  }

  /** @returns {Problem[]} Stars currently falling. Read-only: do not modify. */
  get problems() { return this.#active; }
  get level() { return this.#level; }
  get shields() { return this.#shields; }
  get score() { return this.#score; }
  get streak() { return this.#streak; }
  get bestStreak() { return this.#bestStreak; }
  get correct() { return this.#correct; }
  get wrong() { return this.#wrong; }
  get missedCount() { return this.#missed.length; }
  get spawned() { return this.#spawned; }
  get resolved() { return this.#resolved; }
  get total() { return this.#total; }
  /** @returns {number} Seconds a star currently takes to fall (shrinks as the round speeds up). */
  get fallTime() { return this.#fallTime; }
  get finished() { return this.#finished; }
  /** @returns {'complete'|'shields'|null} */
  get endReason() { return this.#endReason; }
  get accuracy() {
    return accuracyOf({ correct: this.#correct, wrong: this.#wrong, missed: this.#missed.length });
  }

  /**
   * Advances time: stars fall, land, and new ones spawn.
   * @param {number} dt Seconds since the previous call.
   * @returns {RoundEvent[]} What happened, in order.
   */
  update(dt) {
    if (this.#finished) return [];
    /** @type {RoundEvent[]} */
    const events = [];
    this.#elapsed += dt;
    this.#sinceSpawn += dt;

    for (const star of this.#active) star.y += star.speed * dt;
    for (const star of this.#active.filter((s) => s.y >= 1)) {
      star.y = 1;
      this.#active = this.#active.filter((s) => s !== star);
      this.#shields = Math.max(0, this.#shields - 1);
      this.#streak = 0; // a miss ends the streak, as a wrong answer does
      this.#missed.push(star);
      this.#resolved += 1;
      events.push({ type: 'landed', problem: star, shields: this.#shields });
    }

    if (this.#shields === 0) {
      this.#finish('shields', events);
      return events;
    }

    if (this.#spawned < this.#total && this.#active.length < this.#level.maxOnScreen) {
      const gap = this.#active.length === 0 ? EMPTY_SCREEN_GAP : this.#spawnGap();
      if (this.#sinceSpawn >= gap) events.push({ type: 'spawn', problem: this.#spawn() });
    }

    if (this.#spawned === this.#total && this.#active.length === 0) this.#finish('complete', events);
    return events;
  }

  /**
   * The child submits a typed answer.
   * - Right: the lowest matching star is cleared at once and points are awarded.
   * - Wrong: no shield is lost, but the streak resets. After two wrong tries in
   *   a row the result carries a hint for the lowest star.
   *
   * @param {number} value
   * @returns {SubmitResult}
   */
  submit(value) {
    if (this.#finished) return { type: 'ignored' };

    const target = findTarget(this.#active, value);
    if (!target) {
      this.#wrong += 1;
      this.#streak = 0;
      this.#wrongInARow += 1;
      const lowest = findLowest(this.#active);
      const hint = this.#wrongInARow >= HINT_AFTER_WRONG && lowest ? hintFor(lowest) : null;
      return { type: 'wrong', value, wrongInARow: this.#wrongInARow, hint };
    }

    const points = scoreAnswer(this.#streak);
    this.#score += points;
    this.#streak += 1;
    this.#bestStreak = Math.max(this.#bestStreak, this.#streak);
    this.#correct += 1;
    this.#wrongInARow = 0;
    this.#resolved += 1;
    this.#solved.push({ problem: target, solveMs: Math.round((this.#elapsed - target.spawnedAt) * 1000) });
    this.#active = this.#active.filter((s) => s !== target);

    // Speed up: 5% faster after every 5 correct answers, but never past the level's fastest fall time.
    if (this.#correct % SPEEDUP_EVERY === 0) {
      this.#fallTime = Math.max(this.#level.fallTime.min, this.#fallTime / SPEEDUP_FACTOR);
    }

    const events = [];
    if (this.#spawned === this.#total && this.#active.length === 0) this.#finish('complete', events);
    return {
      type: 'hit', problem: target, points, streak: this.#streak,
      milestone: this.#streak > 0 && this.#streak % STREAK_MILESTONE === 0,
      ended: this.#finished,
    };
  }

  /**
   * Summary for the results screen.
   * @returns {{
   *   levelId: string, ops: string[], correct: number, wrong: number, missed: number, resolved: number,
   *   total: number, accuracy: number, stars: 1|2|3, score: number, bestStreak: number,
   *   endReason: 'complete'|'shields'|null,
   *   hardest: { a: number, b: number, op: string, answer: number, reason: 'missed'|'slow' }|null
   * }}
   */
  results() {
    return {
      levelId: this.#level.id,
      ops: [...this.#ops],
      correct: this.#correct,
      wrong: this.#wrong,
      missed: this.#missed.length,
      resolved: this.#resolved,
      total: this.#total,
      accuracy: this.accuracy,
      stars: starsFor(this.accuracy),
      score: this.#score,
      bestStreak: this.#bestStreak,
      endReason: this.#endReason,
      hardest: this.#hardest(),
    };
  }

  /** The star the child struggled with most: one that landed, else the slowest one answered. */
  #hardest() {
    const pickFields = ({ a, b, op, answer }, reason) => ({ a, b, op, answer, reason });
    if (this.#missed.length > 0) return pickFields(this.#missed[0], 'missed');
    if (this.#solved.length === 0) return null;
    const slowest = this.#solved.reduce((worst, s) => (s.solveMs > worst.solveMs ? s : worst));
    return pickFields(slowest.problem, 'slow');
  }

  /** Less crowding on harder levels: wait about a quarter to a third of a fall between stars. */
  #spawnGap() {
    return Math.max(MIN_SPAWN_GAP, this.#fallTime / (this.#level.maxOnScreen + 1));
  }

  #spawn() {
    const base = generateProblem(this.#level.id, this.#ops, this.#rng, this.#recentKeys);
    const lane = this.#pickLane();
    /** @type {Problem} */
    const star = {
      id: this.#nextId++, a: base.a, b: base.b, op: base.op, answer: base.answer,
      x: (lane + 0.5) / this.#laneCount, y: 0, speed: 1 / this.#fallTime, lane, spawnedAt: this.#elapsed,
    };
    this.#recentKeys.push(problemKey(base));
    if (this.#recentKeys.length > RECENT_WINDOW) this.#recentKeys.shift();
    this.#active.push(star);
    this.#spawned += 1;
    this.#sinceSpawn = 0;
    return star;
  }

  #pickLane() {
    const busy = new Set(this.#active.filter((s) => s.y < BUSY_HEIGHT).map((s) => s.lane));
    const all = Array.from({ length: this.#laneCount }, (_, i) => i);
    const free = all.filter((i) => !busy.has(i));
    return pick(this.#rng, free.length > 0 ? free : all);
  }

  #finish(reason, events) {
    this.#finished = true;
    this.#endReason = reason;
    this.#active = [];
    events.push({ type: 'end', reason });
  }
}
