import { HindiScene } from './HindiScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { getLevel } from '../logic/levels.js';
import { starsFor, scoreFor } from '../logic/scoring.js';

/** Results: stars by moves, time, and every pair for review (with a speaker on each word). */
export class ResultScene extends HindiScene {
  /** @param {{ levelId: 'easy'|'medium'|'hard', topic: string, peek: boolean, moves: number, seconds: number, pairs: import('../logic/pairs.js').WordPair[] }} params */
  enter({ levelId, topic, peek, moves, seconds, pairs }) {
    const { services } = this;
    const level = getLevel(levelId);
    const stars = starsFor(moves, level.pairs);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, levelId, { stars, score: scoreFor(moves, level.pairs) });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const speak = (text, lang) => services.speech.speak(text, { lang, force: true });
    const hear = (text, lang) => services.speech.supported && (lang === 'en-IN' || services.speech.hasVoice('hi-IN'))
      ? createButton({ icon: '🔊', ariaLabel: `Hear ${text}`, variant: 'ghost', onClick: () => speak(text, lang) }) : null;
    const rows = pairs.map((p) => el('li', { class: 'review__item' },
      el('span', { class: 'review__image', text: p.image ?? '', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'review__word hi', text: p.hi, attrs: { lang: 'hi' } }), hear(p.hi, 'hi-IN'),
      el('span', { class: 'review__word', text: p.en }), hear(p.en, 'en-IN')));

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const stat = (label, value) => el('div', { class: 'result__stat' }, el('dt', { text: label }), el('dd', { text: value }));
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great job, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('dl', { class: 'result__stats' }, stat('Moves', String(moves)), stat('Time', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`), stat('Pairs', String(level.pairs))),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({ levelId, topic, peek }) }),
        createButton({ label: 'Menu', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref })),
      el('section', { class: 'review', attrs: { 'aria-labelledby': 'review-title' } },
        el('h2', { text: 'Words in this game', attrs: { id: 'review-title' } }),
        el('ul', {}, ...rows))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
