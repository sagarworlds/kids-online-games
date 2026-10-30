/**
 * Optional read-aloud using the browser's built-in speech synthesis.
 * Everything here is best-effort: unsupported browsers or missing voices
 * simply do nothing, and nothing is ever sent to a server.
 */
export class SpeechService {
  #settings;
  #synth;
  #Utterance;
  #logger;

  /**
   * @param {{
   *   settings: { readAloud: boolean },
   *   synth?: SpeechSynthesis|null,
   *   Utterance?: typeof SpeechSynthesisUtterance|null,
   *   logger?: Pick<Console, 'error'>
   * }} deps
   */
  constructor({
    settings,
    synth = globalThis.speechSynthesis ?? null,
    Utterance = globalThis.SpeechSynthesisUtterance ?? null,
    logger = console,
  }) {
    this.#settings = settings;
    this.#synth = synth;
    this.#Utterance = Utterance;
    this.#logger = logger;
  }

  /** @returns {boolean} Whether this browser can speak at all. */
  get supported() {
    return Boolean(this.#synth && this.#Utterance);
  }

  /**
   * Whether a voice for the language exists. Browsers load voices
   * asynchronously, so an early call may say false; use `onVoicesChanged`.
   * @param {string} lang BCP-47 tag such as 'hi-IN' or 'en-IN'.
   * @returns {boolean}
   */
  hasVoice(lang) {
    if (!this.supported) return false;
    const primary = lang.toLowerCase().split('-')[0];
    return this.#synth.getVoices().some((v) => v.lang.toLowerCase().split(/[-_]/)[0] === primary);
  }

  /**
   * @param {() => void} handler Called when the voice list becomes available or changes.
   * @returns {() => void} Unsubscribe function.
   */
  onVoicesChanged(handler) {
    if (!this.#synth?.addEventListener) return () => {};
    this.#synth.addEventListener('voiceschanged', handler);
    return () => this.#synth.removeEventListener('voiceschanged', handler);
  }

  /**
   * Reads text aloud.
   * @param {string} text
   * @param {{ lang?: string, force?: boolean }} [options] `force` bypasses the
   *   read-aloud setting; use it for an explicit tap on a speaker icon. Questions
   *   read automatically should not force, so the parent setting stays in charge.
   * @returns {boolean} True if speech was started.
   */
  speak(text, { lang = 'en-IN', force = false } = {}) {
    if (!this.supported || !text) return false;
    if (!force && !this.#settings.readAloud) return false;
    try {
      this.#synth.cancel();
      const utterance = new this.#Utterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9; // slightly slower than normal for early readers
      this.#synth.speak(utterance);
      return true;
    } catch (error) {
      this.#logger.error('[speech] speech synthesis failed; continuing silently', error);
      return false;
    }
  }

  /** Stops anything currently being spoken. */
  cancel() {
    try {
      this.#synth?.cancel();
    } catch {
      // Nothing useful to do if cancel fails.
    }
  }
}
