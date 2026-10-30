import { LightsScene } from './LightsScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { getLevel, PUZZLES_PER_ROUND } from '../logic/levels.js';
import { generateForLevel } from '../logic/puzzleGenerator.js';
import { newPuzzleState, tap, undo, restart } from '../logic/puzzleState.js';
import { starsForPuzzle } from '../logic/scoring.js';
import { hintTap } from '../logic/hint.js';
import { createBoardView } from '../ui/BoardView.js';

/** One puzzle of the round: tap jars until every firefly is free. */
export class PuzzleScene extends LightsScene {
  #state = null;
  #board = null;
  #hint = null;
  #hud = null;
  #moveEl = null;
  #status = null;
  #buttons = {};
  #overlay = null;

  /** @param {import('./LightsScene.js').Round} round */
  enter(round) {
    const { services } = this;
    this.round = round;
    const level = getLevel(round.levelId);
    this.#state = newPuzzleState(generateForLevel(round.levelId, services.rng), round.levelId);

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'puzzle', label: 'Puzzle' }, { id: 'moves', label: 'Moves' }, { id: 'par', label: 'Par' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('puzzle', `${round.index + 1}/${PUZZLES_PER_ROUND}`);
    this.#hud.setStat('par', this.#state.par);

    this.#board = createBoardView({ size: level.size, onTap: (r, c) => this.#onTap(r, c) });
    this.#status = el('p', { class: 'lo-status', attrs: { role: 'status' } });
    this.#buttons.undo = createButton({ label: 'Undo', icon: '↶', onClick: () => this.#apply(undo(this.#state), 'click') });
    this.#buttons.restart = createButton({ label: 'Restart', icon: '↺', onClick: () => this.#apply(restart(this.#state), 'click') });
    this.#buttons.hint = createButton({ label: 'Hint', icon: '💡', onClick: () => this.#showHint() });
    const controls = el('div', { class: 'lo-controls', attrs: { role: 'group', 'aria-label': 'Puzzle controls' } },
      this.#buttons.undo, this.#buttons.restart, this.#buttons.hint);

    const costNote = round.levelId === 'easy' ? 'Undo and Restart are free.' : 'Undo and Restart count as moves.';
    this.#overlay = el('div', { class: 'lo-solved', attrs: { role: 'dialog', 'aria-label': 'Puzzle solved' } });
    this.#overlay.hidden = true;

    this.ui.append(this.#hud.el, el('main', { class: 'lo' },
      el('div', { class: 'lo-board' }, this.#board.el, this.#overlay),
      this.#status, controls, el('p', { class: 'lo-note', text: `Fewer taps earn more stars. ${costNote}` })));
    this.#render();
    this.#board.focusCell(0, 0);
  }

  #onTap(r, c) {
    this.#hint = null;
    this.#apply(tap(this.#state, r, c), 'click');
  }

  #apply(next, sound) {
    if (next === this.#state) return;
    this.#state = next;
    this.#hint = null;
    this.services.audio.play(sound);
    this.#render();
    if (next.solved) this.#onSolved();
  }

  #showHint() {
    const hint = hintTap(this.#state);
    this.#hint = hint;
    this.#render();
    if (hint) {
      this.#status.textContent = `Try the jar in row ${hint[0] + 1}, column ${hint[1] + 1}.`;
      this.#board.focusCell(hint[0], hint[1]);
    }
  }

  #render() {
    const s = this.#state;
    this.#board.render(s.board, { hint: this.#hint, locked: s.solved });
    this.#hud.setStat('moves', s.moves);
    setDisabled(this.#buttons.undo, s.solved || s.history.length === 0);
    setDisabled(this.#buttons.restart, s.solved || (s.history.length === 0 && s.moves === 0));
    setDisabled(this.#buttons.hint, s.solved);
    if (!this.#hint && !s.solved) this.#status.textContent = '';
  }

  #onSolved() {
    const { services } = this;
    const s = this.#state;
    const stars = starsForPuzzle(s.moves, s.par);
    const results = [...this.round.results, { moves: s.moves, par: s.par, stars }];
    const last = results.length >= PUZZLES_PER_ROUND;

    this.#board.el.classList.add('is-solved');
    services.audio.play(stars === 3 ? 'cheer' : 'chime');
    if (stars === 3) launchConfetti({ rng: services.rng });
    this.#status.textContent = `Solved in ${s.moves} moves. Par is ${s.par}.`;

    const next = { ...this.round, index: this.round.index + 1, results };
    this.#overlay.replaceChildren(
      el('h2', { text: 'All the fireflies are free!' }),
      el('div', { class: 'lo-solved__stars', attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` }, html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars) }),
      el('p', { text: `${s.moves} moves · par ${s.par}` }),
      createButton({ label: last ? 'See results' : 'Next puzzle', icon: '▶', variant: 'primary', big: true,
        onClick: () => (last ? this.routes.results(next) : this.routes.play(next)) }));
    this.#overlay.hidden = false;
    this.#overlay.querySelector('button')?.focus();
  }
}
