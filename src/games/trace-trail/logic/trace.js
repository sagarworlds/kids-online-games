import { GameError } from '../../../engine/utils/errors.js';
import { dist, SPACING, pathLength } from './shapes.js';
import { createMachine } from '../../../engine/utils/stateMachine.js';
import { STROKE_MACHINE } from './stroke.machine.js';

/**
 * The tracing rules. Nothing here knows about the screen: it is given points in drawing units and says what they mean.
 *
 * A stroke is a path that has to be followed from its start to its end. The child's pencil can only move forward along it:
 * progress is the furthest point reached while the pencil was within `tolerance` of the path, and only a short way ahead of
 * where it already was is looked at, so cutting across a loop or jumping to the end earns nothing.
 *
 * @typedef {import('./shapes.js').Point} Point
 */

/** How far back from the progress point the pencil may wobble without losing anything, in path points. */
const LOOK_BACK = 2;
/** The stroke counts as finished when the pencil is within this many points of the end. */
const END_SLACK = 2;
/**
 * Progress can only run ahead of the pencil's own travel by this factor (plus a little room at the start). Without it a pencil that
 * sweeps straight across a wave or a zigzag, staying within the tolerance of its crests, would be carried all the way along it.
 */
const TRAVEL_FACTOR = 1.3;
/** A start counts when the pencil goes down within this many tolerances of the start of the stroke. */
export const START_FACTOR = 1.8;

/**
 * Follows one stroke.
 */
export class StrokeTracker {
  #path;
  #tolerance;
  #startRadius;
  #lookAhead;
  /** The stroke's life cycle lives in `stroke.machine.js`. */
  #machine = createMachine(STROKE_MACHINE);
  #progress = 0;
  #last = null;
  #travelled = 0;
  #onPath = 0;
  #attempts = 0;
  #failures = 0;
  #accuracy = 0;

  /**
   * @param {readonly Point[]} path An evened-out path (see `resample`).
   * @param {{ tolerance: number, startRadius?: number }} options `tolerance` is how far from the path the pencil may be.
   * @throws {GameError} 'BAD_PATH' for a path with fewer than two points, 'BAD_TOLERANCE' for a tolerance that is not positive.
   */
  constructor(path, { tolerance, startRadius = tolerance * START_FACTOR }) {
    if (path.length < 2) throw new GameError('BAD_PATH', 'A stroke needs at least two points', { points: path.length });
    // Progress is counted in path points, so a path with big gaps (a line given by its two ends) would finish at once.
    for (let i = 1; i < path.length; i++) {
      if (dist(path[i - 1], path[i]) > SPACING * 3) throw new GameError('BAD_PATH', 'A stroke must be evened out with resample() first', { gap: dist(path[i - 1], path[i]) });
    }
    if (!(tolerance > 0)) throw new GameError('BAD_TOLERANCE', `The tolerance must be above zero (got ${tolerance})`, { tolerance });
    this.#path = path;
    this.#tolerance = tolerance;
    this.#startRadius = startRadius;
    // Far enough ahead to cope with a quick pencil, not so far that a loop can be short-cut.
    this.#lookAhead = Math.ceil((tolerance * 3) / SPACING);
  }

  /** @returns {'idle'|'tracing'|'done'} */
  get status() {
    return this.#machine.state;
  }

  /** How far along the path the pencil has got, 0 to 1. */
  get fraction() {
    return this.#progress / (this.#path.length - 1);
  }

  /** Where the progress marker (the snail) is. @returns {Point} */
  get position() {
    return this.#path[this.#progress];
  }

  get path() {
    return this.#path;
  }

  /** How many times the stroke was started and given up (the pencil lifted too soon). */
  get failures() {
    return this.#failures;
  }

  /** The share of the last attempt's distance that was on the path, 0 to 1 (0 until a stroke is finished). */
  get accuracy() {
    return this.#accuracy;
  }

  /**
   * The pencil goes down.
   * @param {Point} point
   * @returns {{ accepted: boolean, reason?: 'wrong-end'|'too-far' }}
   *   Not accepted: `wrong-end` if it went down at the end of the stroke (the wrong direction), otherwise `too-far`.
   */
  start(point) {
    if (this.#machine.is('done')) return { accepted: false, reason: 'too-far' };
    const first = this.#path[0];
    const last = this.#path[this.#path.length - 1];
    if (dist(point, first) <= this.#startRadius) {
      this.#machine.must('START');
      this.#progress = 0;
      this.#last = point;
      this.#travelled = 0;
      this.#onPath = 0;
      this.#attempts += 1;
      return { accepted: true };
    }
    // A stroke that comes back to where it began (an "o") has no wrong end.
    const wrongEnd = dist(first, last) > this.#startRadius * 1.5 && dist(point, last) <= this.#startRadius;
    return { accepted: false, reason: wrongEnd ? 'wrong-end' : 'too-far' };
  }

  /**
   * The pencil moves. The move is split into small steps so a fast stroke is checked all the way along, not only where the
   * screen happened to report a point.
   *
   * @param {Point} point
   * @returns {{ onPath: boolean, progressed: boolean, done: boolean }}
   */
  move(point) {
    if (!this.#machine.is('tracing')) return { onPath: false, progressed: false, done: this.#machine.is('done') };
    const from = this.#last;
    this.#last = point;
    const length = dist(from, point);
    const steps = Math.max(1, Math.ceil(length / (SPACING / 2)));
    const step = length / steps;
    let onPath = false;
    let progressed = false;
    for (let i = 1; i <= steps; i++) {
      const p = [from[0] + ((point[0] - from[0]) * i) / steps, from[1] + ((point[1] - from[1]) * i) / steps];
      const hit = this.#nearestAhead(p);
      this.#travelled += step;
      if (hit.distance <= this.#tolerance) {
        onPath = true;
        this.#onPath += step;
        const reachable = Math.floor((this.#travelled * TRAVEL_FACTOR + this.#tolerance * 2) / SPACING);
        const index = Math.min(hit.index, reachable);
        if (index > this.#progress) {
          this.#progress = index;
          progressed = true;
        }
      } else {
        onPath = false;
      }
      if (this.#progress >= this.#path.length - 1 - END_SLACK) {
        this.#progress = this.#path.length - 1;
        this.#machine.must('FINISH');
        this.#accuracy = this.#travelled === 0 ? 1 : Math.min(1, this.#onPath / this.#travelled);
        return { onPath: true, progressed: true, done: true };
      }
    }
    return { onPath, progressed, done: false };
  }

  /**
   * The pencil comes up. A stroke that was not finished is given up and starts again from the beginning.
   * @returns {{ completed: boolean, gaveUp: boolean }}
   */
  end() {
    if (this.#machine.is('tracing')) {
      this.#failures += 1;
      this.#machine.must('GIVE_UP');
      this.#progress = 0;
      this.#last = null;
      return { completed: false, gaveUp: true };
    }
    return { completed: this.#machine.is('done'), gaveUp: false };
  }

  /** The nearest point of the path within the window around the progress point. */
  #nearestAhead(p) {
    const from = Math.max(0, this.#progress - LOOK_BACK);
    const to = Math.min(this.#path.length - 1, this.#progress + this.#lookAhead);
    let best = { index: from, distance: Infinity };
    for (let i = from; i <= to; i++) {
      const d = dist(p, this.#path[i]);
      if (d < best.distance) best = { index: i, distance: d };
    }
    return best;
  }
}

/** The score of one stroke: how much of it was on the path, less a tenth for each time it was given up. */
export const strokeScore = (accuracy, failures) => Math.max(0, Math.min(1, accuracy - 0.1 * failures));

/** Taken off the score for each stroke started in the wrong order or at the wrong end, up to the cap. */
export const MISTAKE_PENALTY = 0.05;
export const MAX_MISTAKE_PENALTY = 0.3;

/**
 * Follows a letter, number or word: its strokes one after another, in the right order.
 */
export class GlyphTracer {
  #trackers;
  #current = 0;
  #orderMistakes = 0;
  #directionMistakes = 0;
  #down = false;
  #startRadius;

  /**
   * @param {readonly (readonly Point[])[]} strokes In the order they are to be written.
   * @param {{ tolerance: number }} options
   * @throws {GameError} 'BAD_GLYPH' if there are no strokes.
   */
  constructor(strokes, { tolerance }) {
    if (strokes.length === 0) throw new GameError('BAD_GLYPH', 'A glyph needs at least one stroke');
    this.#trackers = strokes.map((s) => new StrokeTracker(s, { tolerance }));
    this.#startRadius = tolerance * START_FACTOR;
  }

  /** Index of the stroke to write now (the last one when finished). */
  get current() {
    return Math.min(this.#current, this.#trackers.length - 1);
  }

  get done() {
    return this.#current >= this.#trackers.length;
  }

  get strokeCount() {
    return this.#trackers.length;
  }

  /** @param {number} index @returns {StrokeTracker} */
  tracker(index) {
    return this.#trackers[index];
  }

  /**
   * The pencil goes down.
   * @param {Point} point
   * @returns {{ type: 'started' }|{ type: 'wrong-order', stroke: number }|{ type: 'wrong-direction' }|{ type: 'far' }|{ type: 'ignored' }}
   */
  pointerDown(point) {
    if (this.done || this.#down) return { type: 'ignored' };
    const tracker = this.#trackers[this.#current];
    const result = tracker.start(point);
    if (result.accepted) {
      this.#down = true;
      return { type: 'started' };
    }
    // The pencil went down somewhere that is not the start of this stroke: say what is wrong, and count it.
    for (let i = this.#current + 1; i < this.#trackers.length; i++) {
      if (dist(point, this.#trackers[i].path[0]) <= this.#startRadius) {
        this.#orderMistakes += 1;
        return { type: 'wrong-order', stroke: i };
      }
    }
    if (result.reason === 'wrong-end') {
      this.#directionMistakes += 1;
      return { type: 'wrong-direction' };
    }
    return { type: 'far' };
  }

  /**
   * The pencil moves.
   * @param {Point} point
   * @returns {{ type: 'progress', onPath: boolean, fraction: number, position: Point }|{ type: 'stroke-done', stroke: number }|{ type: 'glyph-done' }|null}
   *   Null when the pencil is not down.
   */
  pointerMove(point) {
    if (!this.#down || this.done) return null;
    const index = this.#current;
    const tracker = this.#trackers[index];
    const result = tracker.move(point);
    if (result.done) {
      this.#down = false;
      this.#current += 1;
      return this.done ? { type: 'glyph-done' } : { type: 'stroke-done', stroke: index };
    }
    return { type: 'progress', onPath: result.onPath, fraction: tracker.fraction, position: tracker.position };
  }

  /**
   * The pencil comes up.
   * @returns {{ type: 'gave-up', stroke: number }|{ type: 'ignored' }}
   */
  pointerUp() {
    if (!this.#down) return { type: 'ignored' };
    this.#down = false;
    const index = this.#current;
    this.#trackers[index].end();
    return { type: 'gave-up', stroke: index };
  }

  /**
   * How it went.
   * @returns {{ strokes: { accuracy: number, failures: number, score: number }[], orderMistakes: number, directionMistakes: number, score: number }}
   *   `score` is the mean stroke score less a small amount for each mistake, 0 to 1.
   */
  results() {
    const strokes = this.#trackers.map((t) => ({ accuracy: t.accuracy, failures: t.failures, score: strokeScore(t.accuracy, t.failures) }));
    const mean = strokes.reduce((sum, s) => sum + s.score, 0) / strokes.length;
    const penalty = Math.min(MAX_MISTAKE_PENALTY, MISTAKE_PENALTY * (this.#orderMistakes + this.#directionMistakes));
    return { strokes, orderMistakes: this.#orderMistakes, directionMistakes: this.#directionMistakes, score: Math.max(0, mean - penalty) };
  }
}

/**
 * The timing of the pencil that shows how to write: each stroke in turn at a steady speed, with a short rest between.
 * @param {readonly (readonly Point[])[]} strokes
 * @param {{ speed?: number, pause?: number }} [options] Speed in drawing units a second; the rest in seconds.
 * @returns {{ segments: { start: number, end: number, length: number }[], total: number }}
 */
export function demoTimeline(strokes, { speed = 90, pause = 0.35 } = {}) {
  let at = 0;
  const segments = strokes.map((stroke) => {
    const length = pathLength(stroke);
    const segment = { start: at, end: at + length / speed, length };
    at = segment.end + pause;
    return segment;
  });
  return { segments, total: at };
}

/**
 * Where the demonstration pencil is after `time` seconds.
 * @param {ReturnType<typeof demoTimeline>} timeline
 * @param {number} time
 * @returns {{ stroke: number, distance: number, finished: boolean, pen: boolean }}
 *   The stroke being written, how far along it (drawing units), whether the whole demonstration is over, and whether the pencil is on the paper.
 */
export function demoState(timeline, time) {
  const { segments, total } = timeline;
  const lastIndex = segments.length - 1;
  const over = { stroke: lastIndex, distance: segments[lastIndex].length, finished: true, pen: false };
  if (time >= total) return over;
  for (let i = 0; i <= lastIndex; i++) {
    const segment = segments[i];
    const nextStart = i < lastIndex ? segments[i + 1].start : total;
    if (time < nextStart) {
      const along = Math.min(segment.length, Math.max(0, ((time - segment.start) / (segment.end - segment.start)) * segment.length));
      return { stroke: i, distance: along, finished: false, pen: time < segment.end };
    }
  }
  return over;
}
