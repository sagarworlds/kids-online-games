import { RobotScene } from './RobotScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { findLevel, levelKey } from '../logic/levels.js';
import { execute } from '../logic/interpreter.js';
import { countBlocks, hasBlocks } from '../logic/program.js';
import { describeOutcome, hintAfterFailures } from '../logic/messages.js';
import { createBoardView } from '../ui/BoardView.js';
import { createProgramEditor } from '../ui/ProgramEditor.js';

/** The robot runs one block every 400 ms, as in the spec. */
const STEP_SECONDS = 0.4;
/**
 * A run that will hit the 200-step cap would take 80 s at normal pace. The first few blocks play at normal
 * speed so the child sees what is happening, then the rest fast-forwards to the "Too many steps!" message.
 */
const RUNAWAY_NORMAL_STEPS = 10;
const RUNAWAY_STEP_SECONDS = 0.03;
/** How long the robot dances before the "Level complete" screen. */
const CELEBRATE_SECONDS = 1.6;
/** After this many failed runs on a level, show a hint. */
const HINT_AFTER_FAILURES = 2;
const TONE_ICON = { good: '✔', bad: '✖', info: 'ℹ' };

/**
 * The puzzle: build a program with blocks, press Run (or Step) and watch the
 * robot follow it. The scene only animates the trace the interpreter already
 * computed, so what you see is exactly what the rules say.
 */
export class PuzzleScene extends RobotScene {
  #level = null;
  #board = null;
  #editor = null;
  #hud = null;
  #program = null;
  #statusEl = null;
  #hintEl = null;
  #buttons = {};

  /** @type {{ frames: object[], outcome: object, index: number, auto: boolean, timer: number }|null} */
  #playback = null;
  #celebrating = 0;
  #failures = 0;
  #completed = false;
  #result = null;

  /** @param {{ levelId: number }} params */
  enter({ levelId }) {
    const { services, data } = this;
    const level = findLevel(data.levels, levelId);
    if (!level) throw new GameError('UNKNOWN_LEVEL', `There is no level ${levelId}`, { levelId });
    this.#level = level;
    const { bestStars } = services.rewards.getSave(services.game.slug);
    const firstTime = (bestStars[levelKey(level.id)] ?? 0) === 0;

    this.#hud = createHud({
      homeHref: services.game.homeHref,
      title: `Level ${level.id}: ${level.title}`,
      stats: [{ id: 'blocks', label: 'Blocks' }, { id: 'par', label: 'Par' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('par', level.par);

    this.#board = createBoardView(level);
    this.#editor = createProgramEditor({
      level,
      onChange: (program) => this.#onProgramChange(program),
      onMessage: (text) => this.#setStatus(text, 'info'),
    });
    this.#program = this.#editor.getProgram();

    this.#statusEl = el('p', { class: 'board__status', attrs: { role: 'status' } });
    this.#hintEl = el('p', { class: 'puzzle__hint', attrs: { role: 'status' } });
    this.#hintEl.hidden = true;

    this.#buttons.run = createButton({ label: 'Run', icon: '▶', variant: 'primary', onClick: () => this.#run() });
    this.#buttons.step = createButton({ label: 'Step', icon: '⏭', onClick: () => this.#step() });
    this.#buttons.reset = createButton({ label: 'Reset', icon: '↺', onClick: () => this.#reset() });
    this.#buttons.clear = createButton({ label: 'Clear', icon: '🗑', onClick: () => this.#editor.clear() });
    const controls = el('div', { class: 'controls', attrs: { role: 'group', 'aria-label': 'Run controls' } },
      this.#buttons.run, this.#buttons.step, this.#buttons.reset, this.#buttons.clear);

    // Controls sit right under the board and messages appear below them, so the Run button never moves.
    const boardColumn = el('section', { class: 'puzzle__board-col' },
      el('div', { class: 'board-wrap' }, this.#board.el),
      controls,
      this.#statusEl,
      firstTime && level.tip ? el('p', { class: 'puzzle__tip' }, el('strong', { text: 'Tip: ' }), level.tip) : null,
      this.#hintEl);

    this.ui.classList.add('puzzle-scene');
    this.ui.append(this.#hud.el, el('main', { class: 'puzzle' }, boardColumn, this.#editor.el));
    this.#syncCounts();
  }

  // ------------------------------------------------------------ status

  #setStatus(text, tone) {
    this.#statusEl.className = `board__status board__status--${tone}`;
    this.#statusEl.replaceChildren(
      el('span', { class: 'board__status-icon', text: TONE_ICON[tone], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text }),
    );
  }

  #clearStatus() {
    this.#statusEl.className = 'board__status';
    this.#statusEl.replaceChildren();
  }

  #syncCounts() {
    this.#hud.setStat('blocks', `${countBlocks(this.#program)}/${this.#level.maxBlocks}`);
  }

  // ----------------------------------------------------------- editing

  #onProgramChange(program) {
    this.#program = program;
    this.#syncCounts();
    // Editing means the last run no longer matches the program, so start from a clean board.
    this.#resetBoard();
    this.#clearStatus();
  }

  #resetBoard() {
    this.#playback = null;
    this.#board.reset();
    this.#editor.setHighlight({ active: [], failed: null });
    this.#syncButtons();
  }

  // ----------------------------------------------------------- running

  #run() {
    if (this.#celebrating > 0 || this.#playback?.auto) return;
    if (this.#playback) {
      // Already stepping by hand: carry on automatically from here.
      this.#playback.auto = true;
      this.#playback.timer = STEP_SECONDS;
      this.#syncButtons();
      return;
    }
    this.#startPlayback(true);
  }

  #step() {
    if (this.#celebrating > 0 || this.#playback?.auto) return;
    if (!this.#playback && !this.#startPlayback(false)) return;
    this.#advance();
  }

  /** Computes the whole run up front, then locks editing while it plays. @returns {boolean} False if nothing to run. */
  #startPlayback(auto) {
    if (!hasBlocks(this.#program)) {
      this.#setStatus('Add some blocks first', 'info');
      return false;
    }
    const { frames, outcome } = execute(this.#level, this.#program);
    if (outcome.status === 'empty') {
      this.#setStatus('Add some blocks first', 'info');
      return false;
    }
    this.#board.reset();
    this.#clearStatus();
    this.#editor.setLocked(true);
    // `timer` starts full, so the first block runs straight away.
    this.#playback = { frames, outcome, index: 0, auto, timer: STEP_SECONDS };
    this.#syncButtons();
    return true;
  }

  #advance() {
    const pb = this.#playback;
    if (!pb || pb.index >= pb.frames.length - 1) return;
    pb.index += 1;
    const frame = pb.frames[pb.index];
    this.#board.showFrame(frame);
    // Light up the block that ran and every repeat / call around it.
    this.#editor.setHighlight({ active: [...frame.ancestors, frame.blockPath] });

    const { audio } = this.services;
    if (frame.event === 'move') audio.play('click');
    else if (frame.event === 'turn') audio.play('pop');
    else if (frame.event === 'pick') audio.play('ding');
    else if (frame.event === 'bump' || frame.event === 'edge') audio.play('thud');

    if (pb.index >= pb.frames.length - 1) this.#finish();
  }

  #finish() {
    const { outcome } = this.#playback;
    const message = describeOutcome(outcome);
    this.#setStatus(message.text, message.tone);
    this.#playback = null;

    if (outcome.status === 'success') {
      this.#board.celebrate();
      this.services.audio.play('cheer');
      this.#celebrating = CELEBRATE_SECONDS;
      this.#result = { blocks: countBlocks(this.#program), collected: outcome.collected, totalGems: outcome.totalGems };
      this.#syncButtons();
      return;
    }

    // The block that caused the crash turns red and gets a ✖ (see CSS), so it is not shown by colour alone.
    this.#editor.setHighlight({ active: [], failed: outcome.crash?.blockPath ?? null });
    this.services.audio.play('boop');
    this.#failures += 1;
    if (this.#failures >= HINT_AFTER_FAILURES) {
      this.#hintEl.textContent = `Hint: ${hintAfterFailures(this.#level, outcome)}`;
      this.#hintEl.hidden = false;
    }
    this.#editor.setLocked(false);
    this.#syncButtons();
  }

  #reset() {
    if (this.#celebrating > 0) return;
    this.#editor.setLocked(false);
    this.#resetBoard();
    this.#clearStatus();
  }

  #syncButtons() {
    const running = Boolean(this.#playback?.auto);
    const busy = this.#celebrating > 0;
    setDisabled(this.#buttons.run, busy || running);
    setDisabled(this.#buttons.step, busy || running);
    setDisabled(this.#buttons.reset, busy);
    setDisabled(this.#buttons.clear, busy || Boolean(this.#playback));
  }

  /** Seconds between blocks: normal pace, except a doomed runaway program fast-forwards after a few steps. */
  #stepInterval() {
    const pb = this.#playback;
    const runaway = pb?.outcome.status === 'too-many-steps' && pb.index >= RUNAWAY_NORMAL_STEPS;
    return runaway ? RUNAWAY_STEP_SECONDS : STEP_SECONDS;
  }

  // -------------------------------------------------------------- loop

  update(dt) {
    if (this.#completed) return;
    if (this.#celebrating > 0) {
      this.#celebrating -= dt;
      if (this.#celebrating <= 0) {
        this.#completed = true;
        this.routes.complete({ levelId: this.#level.id, result: this.#result });
      }
      return;
    }
    const pb = this.#playback;
    if (!pb?.auto) return;
    pb.timer += dt;
    // A while (not an if) keeps the pace right even after a slow frame.
    while (this.#playback?.auto && this.#playback.timer >= this.#stepInterval()) {
      this.#playback.timer -= this.#stepInterval();
      this.#advance();
    }
  }
}
