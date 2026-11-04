import { MatraBase } from './MatraBase.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, roundKey } from '../logic/levels.js';
import { LANGS } from '../logic/devanagari.js';
import { syllableParts, wordParts } from '../logic/audio.js';

const TITLES = { build: 'Build the sound', bubbles: 'Bubble pop', words: 'Read words' };

/** Results: stars, and the syllables or words to practise, each with a button to hear it. */
export class ResultScene extends MatraBase {
  /** @param {import('./MatraBase.js').RunResult} result */
  enter({ activity, levelId, lang, summary }) {
    const { services } = this;
    const { stars, correct, total, missed } = summary;
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, roundKey(activity, lang, levelId), { stars, score: correct * 10 });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const items = missed.map((round) => (activity === 'words'
      ? { text: round.word.word, note: `${round.word.emoji} ${round.word.meaning}`, parts: wordParts(round.word) }
      : { text: round.target.text, note: `${round.target.consonant.char} + ${round.target.sign.char || 'अ'}`, parts: syllableParts(round.target) }));

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars === 1 ? `Keep going, ${name}!` : `Well done, ${name}!` }),
      el('p', { class: 'result__mode', text: `${TITLES[activity]} · ${LANGS[lang].label} · ${LEVELS[levelId].label}` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__summary', text: `${correct} of ${total} right the first time` }),
      el('div', { class: 'run__actions' },
        createButton({ label: 'Play again', icon: '🔁', variant: 'primary', big: true, onClick: () => this.routes.run({ activity, levelId }) }),
        createButton({ label: 'Learn', icon: '📖', onClick: () => this.routes.learn() }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() })),
      items.length === 0 ? null : el('section', { class: 'missed', attrs: { 'aria-label': 'To practise' } },
        el('h2', { text: 'To practise' }),
        el('ul', { class: 'missed__list' }, ...items.map((item) => el('li', { class: 'missed__item' },
          el('span', { class: 'missed__text', text: item.text }),
          el('span', { class: 'missed__note', text: item.note }),
          createButton({ icon: '🔊', ariaLabel: `Hear ${item.text}`, onClick: () => this.voice.say(item.parts) })))))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
