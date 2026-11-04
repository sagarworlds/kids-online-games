import { RunScene } from './RunScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { composeSyllable, signOnItsOwn } from '../logic/devanagari.js';
import { makeBuildRounds, checkBuild } from '../logic/rounds.js';
import { syllableParts } from '../logic/audio.js';

/**
 * Build: a syllable is spoken and the child picks the consonant and the vowel sign that make it. If the device cannot play
 * sound the syllable is shown as text instead, so the activity still works as reading practice.
 */
export class BuildScene extends RunScene {
  activity = 'build';
  title = 'Build the sound';
  #consonant = null;
  #sign = null;
  #previewEl = null;
  #check = null;
  #tiles = [];
  #locked = false;

  makeRounds({ content, level, rng }) {
    return makeBuildRounds({ content, choices: level.buildChoices, count: level.rounds, rng });
  }

  showRound(round, body) {
    this.#consonant = null;
    this.#sign = null;
    this.#locked = false;
    this.#tiles = [];
    const audible = this.voice.audible;
    const hear = createButton({ label: 'Hear it', icon: '🔊', variant: 'accent', onClick: () => this.voice.say(syllableParts(round.target)) });
    this.#previewEl = el('div', { class: 'build__preview', attrs: { 'aria-live': 'polite' } });
    this.#check = createButton({ label: 'Check', icon: '✔', variant: 'primary', big: true, disabled: true, onClick: () => this.#submit(round) });

    const consonantRow = this.#row('Letter', round.consonants, (c) => c.char, (c) => `letter ${c.char}`, (c) => { this.#consonant = c; this.#update(); }, 'consonant');
    const signRow = this.#row('Vowel sign', round.signs, (s) => signOnItsOwn(s), (s) => `vowel sign ${signOnItsOwn(s)}`, (s) => { this.#sign = s; this.#update(); }, 'sign');

    body.append(
      el('p', { class: 'run__prompt', text: audible ? 'Listen. Which letter and vowel sign make this sound?' : 'No sound on this device, so the syllable is shown. Build it.' }),
      audible ? hear : el('div', { class: 'build__target', text: round.target.text }),
      el('div', { class: 'build__make' }, this.#previewEl, this.#check),
      consonantRow, signRow);
    if (audible) this.voice.say(syllableParts(round.target));
    this.#update();
  }

  /** A row of choices: one can be picked at a time, and the pick is remembered. */
  #row(label, items, text, aria, onPick, kind) {
    const tiles = items.map((item) => {
      const tile = createButton({ label: text(item), ariaLabel: aria(item), className: `tile tile--${kind}`, onClick: () => {
        if (this.#locked) return;
        this.services.audio.play('click');
        for (const other of tiles) other.setAttribute('aria-pressed', String(other === tile));
        onPick(item);
      } });
      tile.setAttribute('aria-pressed', 'false');
      tile.dataset.kind = kind;
      this.#tiles.push({ tile, item, kind });
      return tile;
    });
    return el('div', { class: 'build__row', attrs: { role: 'group', 'aria-label': label } }, el('span', { class: 'build__label', text: label }), el('div', { class: 'tiles' }, ...tiles));
  }

  #update() {
    this.#previewEl.textContent = this.#consonant && this.#sign ? composeSyllable(this.#consonant, this.#sign) : '◌';
    setDisabled(this.#check, !(this.#consonant && this.#sign) || this.#locked);
  }

  #submit(round) {
    if (this.#locked || !this.#consonant || !this.#sign) return;
    const result = checkBuild(round, this.#consonant, this.#sign);
    const outcome = this.finishTry(result.correct);
    if (!outcome) return;
    if (result.correct) {
      this.say(`Yes! ${round.target.consonant.char} + ${signOnItsOwn(round.target.sign)} = ${round.target.text}`, 'good');
      this.voice.say(syllableParts(round.target));
    } else if (!outcome.reveal) {
      const hint = !result.consonantOk && !result.signOk ? 'Neither is right yet.' : result.consonantOk ? 'The letter is right. Try another vowel sign.' : 'The vowel sign is right. Try another letter.';
      this.say(`${hint} Listen again.`, 'bad');
      this.#mark(result);
      return;
    } else {
      this.say(`It was ${round.target.consonant.char} + ${signOnItsOwn(round.target.sign)} = ${round.target.text}`, 'bad');
      this.voice.say(syllableParts(round.target));
    }
    if (outcome.reveal) {
      this.#locked = true;
      for (const { tile, item, kind } of this.#tiles) {
        const right = kind === 'consonant' ? item === round.target.consonant : item === round.target.sign;
        tile.classList.toggle('is-right', right);
        tile.classList.toggle('is-wrong', !right && tile.getAttribute('aria-pressed') === 'true');
        setDisabled(tile, true);
      }
      this.#previewEl.textContent = round.target.text;
      this.#update();
    }
  }

  /** After a wrong try: the part that was wrong is marked with a cross, and the child picks again. */
  #mark(result) {
    for (const { tile, kind } of this.#tiles) {
      if (tile.getAttribute('aria-pressed') !== 'true') continue;
      const wrong = kind === 'consonant' ? !result.consonantOk : !result.signOk;
      tile.classList.toggle('is-wrong', wrong);
    }
    this.#consonant = result.consonantOk ? this.#consonant : null;
    this.#sign = result.signOk ? this.#sign : null;
    for (const { tile, kind } of this.#tiles) {
      if (tile.getAttribute('aria-pressed') === 'true' && ((kind === 'consonant' && !result.consonantOk) || (kind === 'sign' && !result.signOk))) tile.setAttribute('aria-pressed', 'false');
    }
    this.#update();
  }
}
