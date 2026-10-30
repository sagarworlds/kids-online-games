/**
 * requestAnimationFrame loop with a clamped time step.
 *
 * `dt` is in **seconds** everywhere in the engine. It is clamped to 50 ms so a
 * background tab, a debugger pause or a slow frame cannot teleport a falling
 * star to the ground or make a car jump across the track.
 *
 * Each frame runs inside try/catch: on any error the loop stops and `onError`
 * is called, so a bug becomes a friendly error screen rather than a frozen page.
 */
export class GameLoop {
  #raf;
  #caf;
  #maxDt;
  #handle = null;
  #last = null;
  #handlers = null;

  /**
   * @param {{
   *   raf?: (cb: (t: number) => void) => number,
   *   caf?: (id: number) => void,
   *   maxDt?: number
   * }} [options] `raf`/`caf` are injectable for tests.
   */
  constructor({
    raf = globalThis.requestAnimationFrame?.bind(globalThis),
    caf = globalThis.cancelAnimationFrame?.bind(globalThis),
    maxDt = 0.05,
  } = {}) {
    this.#raf = raf;
    this.#caf = caf;
    this.#maxDt = maxDt;
  }

  /** @returns {boolean} */
  get running() {
    return this.#handle !== null;
  }

  /**
   * Starts looping. Calling it while already running does nothing.
   * @param {{
   *   update: (dt: number) => void,
   *   render: () => void,
   *   onError: (error: unknown) => void
   * }} handlers
   */
  start(handlers) {
    if (this.running) return;
    this.#handlers = handlers;
    this.#last = null;
    this.#handle = this.#raf((t) => this.#frame(t));
  }

  /** Stops the loop; safe to call repeatedly. */
  stop() {
    if (this.#handle !== null) this.#caf(this.#handle);
    this.#handle = null;
  }

  #frame(timestampMs) {
    if (this.#handle === null) return;
    const elapsed = this.#last === null ? 0 : (timestampMs - this.#last) / 1000;
    this.#last = timestampMs;
    const dt = Math.min(this.#maxDt, Math.max(0, elapsed));
    try {
      this.#handlers.update(dt);
      this.#handlers.render();
    } catch (error) {
      this.stop();
      this.#handlers.onError(error);
      return;
    }
    // Re-check: a handler may have called stop().
    if (this.#handle !== null) this.#handle = this.#raf((t) => this.#frame(t));
  }
}
