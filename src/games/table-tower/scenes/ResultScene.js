import { TowerBase } from './TowerBase.js';
import { el } from '../../../engine/utils/dom.js';
import { praiseFor } from '../../../engine/utils/stars.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, floorKey, ladderKey, revisionKey, levelOfFloor, CLEAR_STARS } from '../logic/levels.js';
import { quizStars, ladderStars, challengeScore } from '../logic/scoring.js';
import { applyResults } from '../logic/memory.js';
import { workingFor, skipCount } from '../logic/splits.js';
import { describeAnswer } from '../logic/questions.js';

const starsHtml = (n) => ICONS.star.repeat(n) + ICONS.starEmpty.repeat(3 - n);

/** Results for a Challenge, a Revision or a ladder: stars, what was missed (with the working), and where to go next. */
export class ResultScene extends TowerBase {
  /** @param {import('./TowerBase.js').RoundResult} result */
  enter(result) {
    const { services } = this;
    const { kind, floor, levelId } = result;
    const slug = services.game.slug;
    const before = this.cleared();
    let stars;
    let score;
    let key;
    if (kind === 'ladder') {
      stars = ladderStars(result.mistakes);
      score = Math.max(0, 100 - 10 * result.mistakes);
      key = ladderKey(floor);
    } else {
      stars = quizStars(result.summary);
      score = challengeScore(result.summary);
      key = kind === 'challenge' ? floorKey(floor) : revisionKey(levelId);
      // What the child got right or wrong the first time is remembered per fact, so Revision can bring weak ones back.
      const today = this.today();
      services.rewards.update(slug, (save) => {
        save.extra = { ...save.extra, memory: applyResults(this.memory(), result.summary.firstResults, today) };
      });
    }
    const { improvedStars, improvedScore } = services.rewards.recordRound(slug, key, { stars, score });
    const justCleared = kind === 'challenge' && stars >= CLEAR_STARS && !before.has(floor);
    const name = services.profile.getProfile().name;
    const praise = praiseFor(stars, services.rng);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.ui.append(hud.el, el('main', { class: 'result' },
      el('h1', { text: stars === 1 ? `Keep climbing, ${name}!` : `Great climbing, ${name}!` }),
      el('p', { class: 'result__mode', text: this.#modeText(result) }),
      el('div', { class: 'result__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: starsHtml(stars) }),
      el('p', { class: 'result__praise', text: improvedStars || improvedScore ? `${praise} New best!` : praise }),
      el('p', { class: 'result__summary', text: this.#summaryText(result) }),
      this.#clearNote(result, stars, justCleared),
      el('div', { class: 'result__actions' }, ...this.#actions(result, stars)),
      kind === 'ladder' ? this.#ladderList(floor) : this.#missedList(result.summary)));
    if (stars === 3 || justCleared) launchConfetti({ rng: services.rng });
    services.audio.play(stars === 3 || justCleared ? 'cheer' : 'chime');
  }

  #modeText({ kind, floor, levelId }) {
    if (kind === 'revision') return `Revision · ${LEVELS[levelId].label}`;
    return `Floor ${floor} · ${kind === 'ladder' ? 'Ladder' : 'Challenge'}`;
  }

  #summaryText({ kind, mistakes, summary }) {
    if (kind === 'ladder') return mistakes === 0 ? 'You climbed all ten rungs with no mistakes.' : `You climbed all ten rungs with ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}.`;
    const { correct, total, timedOut, unanswered, secondsLeft } = summary;
    const parts = [`${correct} of ${total} right first time`];
    if (kind === 'challenge' && !timedOut) parts.push(`${Math.floor(secondsLeft)} seconds to spare`);
    if (timedOut) parts.push(`time ran out with ${unanswered} to go`);
    return parts.join(' · ');
  }

  #clearNote({ kind, floor }, stars, justCleared) {
    if (kind !== 'challenge') return null;
    const level = levelOfFloor(floor);
    if (justCleared) {
      return el('p', { class: 'result__clear', text: floor === level.lastFloor ? `Floor ${floor} cleared! You reached the top of the ${level.label} level!` : `Floor ${floor} cleared! Floor ${floor + 1} is open.` });
    }
    return stars >= CLEAR_STARS ? null : el('p', { class: 'result__tip', text: `You need ${CLEAR_STARS} stars to clear the floor. Try the Learn cards or the ladder, then take the Challenge again.` });
  }

  #actions({ kind, floor, levelId }, stars) {
    const go = (label, icon, route, variant) => createButton({ label, icon, variant, big: variant === 'primary', onClick: route });
    const tower = go('Tower', '🗼', () => this.routes.menu());
    if (kind === 'revision') return [go('Revise again', '🔁', () => this.routes.quiz({ mode: 'revision', levelId }), 'primary'), tower];
    const level = levelOfFloor(floor);
    const buttons = [];
    if (kind === 'challenge') {
      const clearedNow = stars >= CLEAR_STARS && floor < level.lastFloor;
      buttons.push(clearedNow ? go(`Floor ${floor + 1}`, '⬆️', () => this.routes.floor(floor + 1), 'primary') : go('Try again', '⏱️', () => this.routes.quiz({ mode: 'challenge', floor, levelId }), 'primary'));
    } else {
      buttons.push(go('Take the Challenge', '⏱️', () => this.routes.quiz({ mode: 'challenge', floor, levelId: level.id }), 'primary'));
    }
    buttons.push(go('Floor', '🏢', () => this.routes.floor(floor)), tower);
    return buttons;
  }

  /** The ladder climbed: 17, 34, 51 ... shown as a list to read back. */
  #ladderList(floor) {
    return el('section', { class: 'missed', attrs: { 'aria-label': 'The ladder' } },
      el('h2', { text: `The ${floor} times table` }),
      el('p', { class: 'missed__line', text: skipCount(floor).join(', ') }));
  }

  /** The facts missed in this round, each with the working that makes it easy. */
  #missedList(summary) {
    if (summary.missed.length === 0) return null;
    return el('section', { class: 'missed', attrs: { 'aria-label': 'Facts to practise' } },
      el('h2', { text: 'Facts to practise' }),
      el('ul', { class: 'missed__list' }, ...summary.missed.map((q) => el('li', { class: 'missed__item' },
        el('strong', { text: describeAnswer(q).split(', so')[0] }),
        el('span', { class: 'missed__working', text: workingFor(q.table, q.multiplier) })))));
  }
}
