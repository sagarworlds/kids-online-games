/** Music Maker records at most this many notes. */
export const MAX_NOTES = 16;

/** The notes tapped in Music Maker, up to {@link MAX_NOTES}. */
export class Recorder {
  #notes = [];

  /** @returns {readonly number[]} Pad ids in the order they were tapped. */
  get notes() { return this.#notes; }
  get full() { return this.#notes.length >= MAX_NOTES; }

  /**
   * @param {number} padId
   * @returns {boolean} False when the recording is already full (the note is not kept).
   */
  add(padId) {
    if (this.full) return false;
    this.#notes = [...this.#notes, padId];
    return true;
  }

  clear() {
    this.#notes = [];
  }
}
