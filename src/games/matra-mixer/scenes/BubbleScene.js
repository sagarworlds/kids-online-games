import { RunScene } from './RunScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { makeBubbleRounds } from '../logic/rounds.js';
import { syllableParts } from '../logic/audio.js';

/** Bubble pop: a syllable is called out and the child pops the bubble that shows it. */
export class BubbleScene extends RunScene {
  activity = 'bubbles';
  title = 'Bubble pop';

  makeRounds({ content, level, rng }) {
    return makeBubbleRounds({ content, bubbles: level.bubbles, count: level.rounds, rng });
  }

  showRound(round, body) {
    const audible = this.voice.audible;
    const hear = createButton({ label: 'Hear it again', icon: '🔊', variant: 'accent', onClick: () => this.voice.say(syllableParts(round.target)) });
    const bubbles = round.bubbles.map((syllable, i) => {
      const bubble = el('button', {
        class: 'bubble', attrs: { type: 'button', 'aria-label': `Bubble ${syllable.text}` }, style: { '--delay': `${-(i * 0.45).toFixed(2)}s`, '--size': `${88 + (i % 3) * 8}px` },
        on: { click: () => this.#pop(round, syllable, bubble, bubbles) },
      }, el('span', { class: 'bubble__text', text: syllable.text }));
      return bubble;
    });
    body.append(el('p', { class: 'run__prompt', text: audible ? 'Listen, then pop the bubble that says it.' : `No sound on this device. Pop the bubble that says ${round.target.text}.` }));
    if (audible) body.append(hear);
    body.append(el('div', { class: 'bubbles', attrs: { role: 'group', 'aria-label': 'Bubbles' } }, ...bubbles));
    if (audible) this.voice.say(syllableParts(round.target));
  }

  #pop(round, syllable, bubble, bubbles) {
    if (bubble.disabled) return;
    const correct = syllable === round.target;
    const outcome = this.finishTry(correct);
    if (!outcome) return;
    if (correct) {
      bubble.classList.add('is-popped', 'is-right');
      this.say(`Pop! ${round.target.consonant.char} + ${round.target.sign.char || 'अ'} = ${round.target.text}`, 'good');
      this.voice.say(syllableParts(round.target));
    } else {
      bubble.classList.add('is-wrong');
      bubble.disabled = true;
      this.say(`That one says ${syllable.text}. Listen again.`, 'bad');
      if (outcome.reveal) {
        bubbles[round.bubbles.indexOf(round.target)].classList.add('is-right');
        this.voice.say(syllableParts(round.target));
      } else {
        this.voice.say(syllableParts(round.target));
      }
    }
    if (outcome.reveal) for (const b of bubbles) b.disabled = true;
  }
}
