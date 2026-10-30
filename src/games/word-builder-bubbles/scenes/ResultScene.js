import { BubblesScene } from './BubblesScene.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { roundStars, trickyWords, roundScore, TRICKY_FROM } from '../logic/scoring.js';
import { wordsFor, pickWords } from '../logic/words.js';
import { HINTS_PER_ROUND, WORDS_PER_ROUND } from '../logic/levels.js';

/** Results: stars, the words spelled, and the "tricky words" (two or more mistakes) to practise. */
export class ResultScene extends BubblesScene {
  /** @param {import('./BubblesScene.js').Round} round */
  enter(round) {
    const { services, data } = this;
    const stars = roundStars(round.results);
    const tricky = trickyWords(round.results);
    const { improvedStars, improvedScore } = services.rewards.recordRound(services.game.slug, round.levelId, { stars, score: roundScore(round.results) });
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const learned = round.results.filter((r) => r.mistakes < TRICKY_FROM).length;
    const rows = round.results.map((r) => {
      const isTricky = r.mistakes >= TRICKY_FROM;
      return el('li', { class: `word-row${isTricky ? ' is-tricky' : ''}` },
        el('span', { class: 'word-row__emoji', text: r.emoji, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'word-row__word', text: r.word }),
        el('span', { class: 'word-row__note' },
          el('span', { html: isTricky ? ICONS.cross : ICONS.check, attrs: { 'aria-hidden': 'true' } }),
          ` ${r.mistakes === 0 ? 'no mistakes' : r.mistakes === 1 ? '1 mistake' : `${r.mistakes} mistakes`}`));
    });

    const practise = tricky.length === 0 ? null : createButton({
      label: 'Practise tricky words', icon: '🎯',
      onClick: () => {
        const entries = round.words.filter((w) => tricky.includes(w.word));
        this.routes.play({ levelId: round.levelId, packId: round.packId, words: entries, index: 0, results: [], hintsLeft: HINTS_PER_ROUND });
      },
    });

    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars >= 2 ? `Great spelling, ${name}!` : `Nice try, ${name}!` }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__learned', text: `You spelled ${round.results.length} words. ${learned} with fewer than ${TRICKY_FROM} mistakes.` }),
      el('ul', { class: 'words' }, ...rows),
      tricky.length
        ? el('section', { class: 'tricky', attrs: { 'aria-label': 'Tricky words' } },
          el('h2', { text: 'Tricky words to practise' }),
          el('p', { text: tricky.join(', ') }))
        : el('p', { class: 'tricky tricky--none', text: 'No tricky words this time. Brilliant!' }),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Play again', icon: '↻', variant: 'primary', big: true, onClick: () => this.routes.play({
          levelId: round.levelId, packId: round.packId, words: pickWords(wordsFor(data, round.packId, round.levelId), services.rng, WORDS_PER_ROUND),
          index: 0, results: [], hintsLeft: HINTS_PER_ROUND }) }),
        practise,
        createButton({ label: 'Change pack', onClick: () => this.routes.menu() }),
        createButton({ label: 'Home', icon: '🏠', href: services.game.homeHref }))));
    if (stars === 3) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
  }
}
