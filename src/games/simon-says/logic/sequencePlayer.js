/**
 * Plays a sequence one pad at a time: light it, sound it, wait, darken it, pause.
 *
 * Everything with side effects (`light`, `tone`, `sleep`) is injected, so this stays pure and testable, and so the
 * scene can cancel it with an AbortSignal the moment the child leaves: after an abort nothing else lights or sounds.
 *
 * @param {{
 *   sequence: readonly number[], noteMs: number, gapMs: number,
 *   light: (padId: number, on: boolean) => void,
 *   tone: (padId: number, ms: number) => void,
 *   sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
 *   signal?: AbortSignal
 * }} options
 * @returns {Promise<boolean>} True if the whole sequence played, false if it was cancelled.
 */
export async function playSequence({ sequence, noteMs, gapMs, light, tone, sleep, signal }) {
  let lit = null;
  try {
    for (const padId of sequence) {
      if (signal?.aborted) return false;
      lit = padId;
      light(padId, true);
      tone(padId, noteMs);
      await sleep(noteMs, signal);
      light(padId, false);
      lit = null;
      await sleep(gapMs, signal);
    }
    return true;
  } catch (error) {
    if (error?.code === 'ABORTED') {
      if (lit !== null) light(lit, false); // never leave a pad glowing after a cancel
      return false;
    }
    throw error;
  }
}
