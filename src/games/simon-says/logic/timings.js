/** The note never gets shorter than this, however long the game goes. */
export const MIN_NOTE_MS = 250;
const MIN_GAP_MS = 100;
const BASE_GAP_MS = 150;
/** Playback gets 5% faster after every this many completed sequences. */
const SPEEDUP_EVERY = 3;
const SPEEDUP = 0.95;

/**
 * How long each note sounds and the pause after it. Playback speeds up 5% every 3 completed sequences, down to a
 * 250 ms note, so a long game stays playable instead of becoming a blur.
 *
 * @param {number} baseNoteMs The level's starting note length (500 Easy, 400 Medium, 350 Hard).
 * @param {number} roundsCompleted
 * @returns {{ noteMs: number, gapMs: number }}
 */
export function playbackTimings(baseNoteMs, roundsCompleted) {
  const factor = SPEEDUP ** Math.floor(roundsCompleted / SPEEDUP_EVERY);
  return {
    noteMs: Math.max(MIN_NOTE_MS, Math.round(baseNoteMs * factor)),
    gapMs: Math.max(MIN_GAP_MS, Math.round(BASE_GAP_MS * factor)),
  };
}
