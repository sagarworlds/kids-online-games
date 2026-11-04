import { RunScene } from './RunScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { composeSyllable } from '../logic/devanagari.js';
import { makeWordRounds } from '../logic/rounds.js';
import { syllableParts, wordParts } from '../logic/audio.js';

/** Words per run (a word list is shorter than the syllable lists, so this is a little less than the other activities). */
const WORDS_PER_RUN = 8;

/** Read words: a short word, made only of syllables already learned, and the child picks its picture. */
export class WordScene extends RunScene {
  activity = 'words';
  title = 'Read words';

  makeRounds({ content, level, rng }) {
    return makeWordRounds({ words: this.data.words[this.lang], content, choices: level.wordChoices, count: WORDS_PER_RUN, rng });
  }

  showRound(round, body) {
    const { word } = round;
    const chips = word.syllables.map(({ consonant, sign }) => {
      const text = composeSyllable(consonant, sign);
      return el('button', {
        class: 'chip chip--syllable', text, attrs: { type: 'button', 'aria-label': `Hear ${text}` },
        on: { click: () => this.voice.say(syllableParts({ id: `${consonant.id}-${sign.id}`, text })) },
      });
    });
    const options = round.options.map((option) => el('button', {
      class: 'picture', attrs: { type: 'button', 'aria-label': option.meaning },
      on: { click: () => this.#choose(round, option, options) },
    }, el('span', { class: 'picture__emoji', text: option.emoji, attrs: { 'aria-hidden': 'true' } })));
    body.append(
      el('p', { class: 'run__prompt', text: 'Read the word. Which picture is it?' }),
      el('div', { class: 'word', text: word.word, attrs: { lang: this.lang } }),
      el('div', { class: 'word__chips', attrs: { role: 'group', 'aria-label': 'Tap a part to hear it' } }, ...chips),
      createButton({ label: 'Hear the word', icon: '🔊', variant: 'accent', onClick: () => this.voice.say(wordParts(word)) }),
      el('div', { class: 'pictures', attrs: { role: 'group', 'aria-label': 'Pictures' } }, ...options));
  }

  #choose(round, option, options) {
    const index = round.options.indexOf(option);
    if (options[index].disabled) return;
    const correct = option === round.word;
    const outcome = this.finishTry(correct);
    if (!outcome) return;
    if (correct) {
      options[index].classList.add('is-right');
      this.say(`Yes! ${round.word.word} means ${round.word.meaning} ${round.word.emoji}`, 'good');
      this.voice.say(wordParts(round.word));
    } else {
      options[index].classList.add('is-wrong');
      options[index].disabled = true;
      this.say(`${option.emoji} is ${option.meaning}. Look at the word again.`, 'bad');
      if (outcome.reveal) {
        options[round.options.indexOf(round.word)].classList.add('is-right');
        this.say(`${round.word.word} means ${round.word.meaning} ${round.word.emoji}`, 'bad');
        this.voice.say(wordParts(round.word));
      }
    }
    if (outcome.reveal) for (const o of options) o.disabled = true;
  }
}
