import { HindiScene } from './HindiScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { DEFAULT_LANGUAGE, ENGLISH, getLanguage, levelKey, wordIn } from '../logic/languages.js';
import { getLevel } from '../logic/levels.js';
import { starsFor, scoreFor } from '../logic/scoring.js';

/** Results: stars by moves, time, and every pair for review (with a speaker on each word). */
export class ResultScene extends HindiScene {
  /** @param {{ levelId: 'easy'|'medium'|'hard', topic: string, peek: boolean, language?: string, moves: number, seconds: number, pairs: import('../logic/pairs.js').WordPair[] }} params */
  enter({ levelId, topic, peek, language: languageId = DEFAULT_LANGUAGE, moves, seconds, pairs }) {
    const { services } = this;
    const language = getLanguage(languageId);
    const level = getLevel(levelId);
    const stars = starsFor(moves, level.pairs);
    // Hindi keeps the plain level id for its stars (as every earlier save has it); Marathi has its own.
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, levelKey(language.id, levelId), { stars, score: scoreFor(moves, level.pairs) });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const speak = (text, lang) => services.speech.speak(text, { lang, force: true });
    const hear = (text, voice) => services.speech.supported && (voice === ENGLISH.voice || services.speech.hasVoice(voice))
      ? createButton({ icon: '🔊', ariaLabel: `Hear ${text}`, variant: 'ghost', onClick: () => speak(text, voice) }) : null;
    const rows = pairs.map((p) => {
      const word = /** @type {string} */ (wordIn(p, language.id));
      return el('li', { class: 'review__item' },
        el('span', { class: 'review__image', text: p.image ?? '', attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'review__word indic', text: word, attrs: { lang: language.id } }), hear(word, language.voice),
        el('span', { class: 'review__word', text: p.en }), hear(p.en, ENGLISH.voice));
    });

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const stat = (label, value) => el('div', { class: 'result__stat' }, el('dt', { text: label }), el('dd', { text: value }));
    this.ui.append(hud.el, el('div', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('dl', { class: 'result__stats' }, stat('Moves', String(moves)), stat('Time', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`), stat('Pairs', String(level.pairs))),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({ levelId, topic, peek, language: language.id }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref })),
      el('section', { class: 'review', attrs: { 'aria-labelledby': 'review-title' } },
        el('h2', { text: 'Words in this game', attrs: { id: 'review-title' } }),
        el('ul', {}, ...rows))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
