import { NinjaScene } from './NinjaScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { hintFor, problemToText } from '../logic/hints.js';

/** Wrong tries on the replay before the answer is shown. */
const REPLAY_TRIES = 3;

/**
 * Results: stars, accuracy, best streak and a replay of the hardest problem.
 * Saves the round's stars and score once, on entry.
 */
export class ResultScene extends NinjaScene {
  #summary = null;

  /** @param {{ summary: ReturnType<import('../logic/round.js').NinjaRound['results']> }} params */
  enter({ summary }) {
    const { services } = this;
    this.#summary = summary;
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, summary.levelId, {
      stars: summary.stars,
      score: summary.score,
    });

    const name = services.profile.getProfile().name;
    const headline = summary.stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!`;
    const praise = praiseFor(summary.stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });

    const stars = el('div', {
      class: 'result__stars',
      attrs: { role: 'img', 'aria-label': `${summary.stars} out of 3 stars` },
    }, ...[1, 2, 3].map((n) => el('span', {
      class: n <= summary.stars ? 'pop-in' : '',
      style: { 'animation-delay': `${n * 0.18}s` },
      html: n <= summary.stars ? ICONS.star : ICONS.starEmpty,
    })));

    const percent = Math.round(summary.accuracy * 100);
    const stat = (label, value) => el('div', { class: 'result__stat' }, el('dt', { text: label }), el('dd', { text: value }));

    const main = el('main', { class: 'result' },
      el('h1', { text: headline }),
      stars,
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New personal best!` : praise }),
      summary.endReason === 'shields' ? el('p', { text: 'Your shields ran out, but every try makes you quicker.' }) : null,
      el('dl', { class: 'result__stats' },
        stat('Accuracy', `${percent}%`),
        stat('Score', String(summary.score)),
        stat('Best streak', String(summary.bestStreak)),
        stat('Stars sliced', `${summary.correct} of ${summary.total}`)),
      // Actions first: "Play again" must be visible without scrolling; the replay is optional extra practice.
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.#again() }),
        createButton({ label: 'Change level', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref })),
      this.#buildReplay(summary.hardest));

    this.ui.append(hud.el, main);
    if (summary.stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(summary.stars === 3 ? 'cheer' : 'chime');
  }

  /** "Hardest problem" replay: a small practice box with a hint after 2 tries and the answer after 3. */
  #buildReplay(hardest) {
    if (!hardest) return null;
    const text = problemToText(hardest);
    let tries = 0;

    const input = el('input', {
      class: 'input replay__input',
      attrs: { id: 'replay-answer', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 4, 'aria-describedby': 'replay-msg' },
    });
    const message = el('p', { class: 'message', attrs: { id: 'replay-msg', role: 'status' } });

    const check = () => {
      const value = input.value.trim();
      if (!/^\d{1,4}$/.test(value)) {
        message.className = 'message message--bad';
        message.textContent = '✖ Type a number first.';
        return;
      }
      if (Number(value) === hardest.answer) {
        message.className = 'message message--good';
        message.textContent = `✔ Yes! ${text} = ${hardest.answer}`;
        this.services.audio.play('ding');
        return;
      }
      tries += 1;
      this.services.audio.play('boop');
      message.className = 'message message--bad';
      if (tries >= REPLAY_TRIES) message.textContent = `✖ The answer is ${hardest.answer}: ${text} = ${hardest.answer}`;
      else if (tries === 2) message.textContent = `✖ Try again! Hint: ${hintFor(hardest)}`;
      else message.textContent = '✖ Try again!';
      input.select();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); check(); }
    });

    return el('section', { class: 'replay', attrs: { 'aria-labelledby': 'replay-title' } },
      el('h2', { text: hardest.reason === 'missed' ? 'Let us try the one that got away' : 'Let us practise your trickiest one', attrs: { id: 'replay-title' } }),
      el('div', { class: 'replay__row' },
        el('label', { class: 'replay__problem', text: `${text} =`, attrs: { for: 'replay-answer' } }),
        input,
        createButton({ label: 'Check', variant: 'good', onClick: check })),
      message);
  }

  #again() {
    this.routes.play({ levelId: this.#summary.levelId, ops: this.#summary.ops });
  }
}
