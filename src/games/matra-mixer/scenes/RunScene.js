import { MatraBase } from './MatraBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { LEVELS } from '../logic/levels.js';
import { RoundSession } from '../logic/session.js';

const TONE_ICON = { good: '✔', bad: '✖', info: 'ℹ' };

/**
 * The shared shape of the three activities (Build, Bubble pop, Read words): a run of rounds, the top bar, a message line and
 * a Next button. A subclass says what a round is (`makeRounds`) and how it looks and plays (`showRound`); this class keeps
 * the count, the tries, the stars and the move on to the results.
 *
 * @abstract
 */
export class RunScene extends MatraBase {
  /** @type {'build'|'bubbles'|'words'} Set by the subclass. */
  activity = 'build';
  /** The words shown in the top bar, so each activity can name itself. */
  title = '';
  /** @type {import('../logic/levels.js').LevelConfig} */
  level;
  /** @type {import('../logic/levels.js').Content} */
  content;
  /** @type {import('../logic/devanagari.js').Lang} */
  lang = 'hi';
  /** @type {RoundSession<any>} */
  session;
  #body = null;
  #noteEl = null;
  #nextButton = null;
  #hud = null;

  /**
   * Makes the rounds of a run.
   * @abstract
   * @param {{ content: import('../logic/levels.js').Content, level: import('../logic/levels.js').LevelConfig, rng: () => number }} options
   * @returns {any[]}
   */
  makeRounds(options) {
    throw new GameError('NOT_IMPLEMENTED', `${this.constructor.name} must make its rounds`, { options });
  }

  /**
   * Draws one round and starts it. Call `this.finishTry(correct)` for each try.
   * @abstract
   * @param {any} round
   * @param {HTMLElement} body Empty; put the round in it.
   */
  showRound(round, body) {
    throw new GameError('NOT_IMPLEMENTED', `${this.constructor.name} must show its rounds`, { round, body });
  }

  /** @param {{ levelId: 'easy'|'medium'|'hard' }} params */
  enter({ levelId }) {
    const { services } = this;
    this.level = LEVELS[levelId];
    if (!this.level) throw new GameError('UNKNOWN_LEVEL', `There is no level "${levelId}"`, { levelId });
    this.lang = this.prefs().lang;
    this.content = this.contentFor(levelId);
    this.session = new RoundSession(this.makeRounds({ content: this.content, level: this.level, rng: services.rng }));

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: this.title, stats: [{ id: 'round', label: 'Round' }],
      onSettings: () => services.openSettings(),
    });
    this.#body = el('div', { class: 'run__body' });
    this.#noteEl = el('p', { class: 'run__note', attrs: { role: 'status' } });
    this.#nextButton = createButton({ label: 'Next', icon: '▶', variant: 'primary', big: true, onClick: () => this.#next() });
    this.#nextButton.hidden = true;
    this.ui.classList.add('run-scene');
    this.ui.append(this.#hud.el, el('main', { class: 'run' }, this.#body, this.#noteEl, el('div', { class: 'run__actions' }, this.#nextButton)));
    this.#show();
  }

  #show() {
    this.#nextButton.hidden = true;
    this.#noteEl.className = 'run__note';
    this.#noteEl.replaceChildren();
    this.#body.replaceChildren();
    this.#hud.setStat('round', `${this.session.position}/${this.session.total}`);
    this.showRound(this.session.current, this.#body);
  }

  /**
   * Records a try at the round on screen.
   * @param {boolean} correct
   * @returns {{ correct: boolean, tries: number, reveal: boolean }|null} What the session decided; `reveal` means the round is over.
   */
  finishTry(correct) {
    const outcome = this.session.answer(correct);
    if (!outcome) return null;
    this.services.audio.play(correct ? 'ding' : 'boop');
    if (outcome.reveal) {
      this.#nextButton.querySelector('span:last-child').textContent = this.session.position === this.session.total ? 'See my stars' : 'Next';
      this.#nextButton.hidden = false;
      this.#nextButton.focus({ preventScroll: true });
    }
    return outcome;
  }

  /** Shows a message under the round. @param {string} text @param {'good'|'bad'|'info'} tone */
  say(text, tone = 'info') {
    this.#noteEl.className = `run__note run__note--${tone}`;
    this.#noteEl.replaceChildren(
      el('span', { class: 'run__note-icon', text: TONE_ICON[tone], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text }));
  }

  #next() {
    this.voice.stop();
    this.session.advance();
    if (this.session.over) {
      this.routes.results({ activity: this.activity, levelId: this.level.id, lang: this.lang, summary: this.session.summary() });
    } else {
      this.#show();
    }
  }
}
