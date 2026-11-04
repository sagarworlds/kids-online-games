import { logError } from '../../../engine/utils/errors.js';
import { LANGS } from '../logic/devanagari.js';
import { planSpeech, clipUrl } from '../logic/audio.js';

/**
 * Says syllables and words. Recorded voices are used when they exist (see `logic/audio.js`); otherwise the browser speaks the
 * text. Everything is best effort and never stops the game: a recording that fails to play is logged, and the browser voice
 * takes over for that sound.
 *
 * The grown-ups "sound" setting is respected: with sound off, nothing is said, and `audible` is false so the activities show the
 * syllable as text instead of asking the child to listen.
 */
export class Voice {
  #speech;
  #settings;
  #manifest;
  #getLang;
  #Audio;
  #current = null;
  #token = 0;

  /**
   * @param {{
   *   speech: import('../../../engine/services/SpeechService.js').SpeechService,
   *   settings: { sound: boolean }, manifest: import('../logic/audio.js').Manifest,
   *   getLang: () => import('../logic/devanagari.js').Lang, AudioCtor?: typeof Audio|null
   * }} deps
   */
  constructor({ speech, settings, manifest, getLang, AudioCtor = globalThis.Audio ?? null }) {
    this.#speech = speech;
    this.#settings = settings;
    this.#manifest = manifest;
    this.#getLang = getLang;
    this.#Audio = AudioCtor;
  }

  /** Can the child hear syllables on this device right now? True with sound on and a recording or a browser voice. */
  get audible() {
    if (!this.#settings.sound) return false;
    const lang = this.#getLang();
    return (this.#manifest[lang].length > 0 && Boolean(this.#Audio)) || this.#speech.hasVoice(LANGS[lang].speechLang);
  }

  /**
   * Says the parts one after another.
   * @param {readonly { id: string, text: string }[]} parts
   * @returns {Promise<void>} Resolves when it has finished (or was stopped).
   */
  async say(parts) {
    this.stop();
    if (!this.#settings.sound || parts.length === 0) return;
    const lang = this.#getLang();
    const token = this.#token;
    const plan = planSpeech(this.#manifest, lang, parts);
    if (plan.kind === 'speech' || !this.#Audio) {
      this.#speech.speak(plan.kind === 'speech' ? plan.text : parts.map((p) => p.text).join(''), { lang: LANGS[lang].speechLang, force: true });
      return;
    }
    try {
      for (const file of plan.files) {
        if (token !== this.#token) return;
        await this.#playOne(clipUrl(lang, file));
      }
    } catch (error) {
      logError(error, `matra-mixer:audio (${parts.map((p) => p.id).join(' ')})`);
      if (token === this.#token) this.#speech.speak(parts.map((p) => p.text).join(''), { lang: LANGS[lang].speechLang, force: true });
    }
  }

  #playOne(url) {
    return new Promise((resolve, reject) => {
      const audio = new this.#Audio(url);
      this.#current = audio;
      audio.addEventListener('ended', () => resolve());
      audio.addEventListener('error', () => reject(new Error(`Could not play ${url}`)));
      audio.play().catch(reject);
    });
  }

  /** Stops whatever is being said. */
  stop() {
    this.#token += 1;
    this.#speech.cancel();
    if (this.#current) {
      this.#current.pause();
      this.#current = null;
    }
  }
}
