import { el, clear } from '../../../engine/utils/dom.js';
import { GameError, logError } from '../../../engine/utils/errors.js';
import {
  addBlock, removeBlock, moveBlock, setRepeatTimes, makeBlock, countBlocks, getList,
  parentListId, indexInParent, parseId, emptyProgram, MIN_REPEAT, MAX_REPEAT,
} from '../logic/program.js';

/** Every block has an arrow/symbol AND a word, so meaning never depends on colour or icon alone. */
const BLOCKS = {
  forward: { icon: '↑', label: 'Forward' },
  left: { icon: '↰', label: 'Turn left' },
  right: { icon: '↱', label: 'Turn right' },
  repeat: { icon: '🔁', label: 'Repeat' },
  pick: { icon: '💎', label: 'Pick gem' },
  callF: { icon: 'ƒ', label: 'Call F' },
};
const PALETTE_ORDER = ['forward', 'left', 'right', 'repeat', 'pick', 'callF'];
/** Pointer must move this far before a press on the grip becomes a drag. */
const DRAG_THRESHOLD = 6;
/** Draw at most this many empty slots, so a long program does not push the controls off screen. */
const MAX_VISIBLE_SLOTS = 12;

/** Friendly versions of the GameErrors the program model can throw. */
function friendly(error, maxBlocks) {
  const messages = {
    PROGRAM_FULL: `No more room! This level allows ${maxBlocks} blocks.`,
    NO_RECURSION: 'Function F cannot call itself.',
    BAD_MOVE: 'A Repeat cannot go inside itself.',
    BLOCK_NOT_ALLOWED: 'That block is not available on this level.',
  };
  return messages[error.code] ?? null;
}

/**
 * The block editor: a palette to tap, and the program strip(s) to arrange.
 *
 * - Tap a palette block to add it to the *target* list (the main program by
 *   default; tap a list's title or a Repeat's "add inside" button to change it).
 * - Drag a block by its grip to reorder it or move it into or out of a Repeat.
 * - Every action also has a button (◀ ▶ ✖ and +/−), so the whole editor works
 *   by keyboard and without precise dragging.
 *
 * The editor only holds the program; running it is the scene's job.
 *
 * @param {{
 *   level: import('../logic/levels.js').Level,
 *   onChange: (program: import('../logic/interpreter.js').Program) => void,
 *   onMessage: (text: string) => void
 * }} options
 * @returns {{
 *   el: HTMLElement,
 *   getProgram: () => import('../logic/interpreter.js').Program,
 *   clear: () => void,
 *   setLocked: (locked: boolean) => void,
 *   setHighlight: (highlight: { active?: string[], failed?: string|null }) => void
 * }}
 */
export function createProgramEditor({ level, onChange, onMessage }) {
  const usesFunction = level.allowed.includes('callF');
  let program = emptyProgram();
  let target = 'main';
  let locked = false;
  let highlight = { active: [], failed: null };
  let drag = null;

  const root = el('section', { class: 'editor', attrs: { 'aria-label': 'Program editor' } });
  const counter = el('p', { class: 'editor__count', attrs: { role: 'status' } });
  const lists = el('div', { class: 'editor__lists' });

  // ------------------------------------------------------------ palette

  /** @type {Map<string, HTMLButtonElement>} */
  const paletteButtons = new Map();
  const palette = el('div', { class: 'palette', attrs: { role: 'group', 'aria-label': 'Blocks you can add' } });
  for (const type of PALETTE_ORDER.filter((t) => level.allowed.includes(t))) {
    const info = BLOCKS[type];
    const button = el('button', {
      class: `palette__block block--${type}`,
      attrs: { type: 'button', 'data-type': type },
      on: { click: () => addFromPalette(type) },
    }, el('span', { class: 'block__icon', text: info.icon, attrs: { 'aria-hidden': 'true' } }), el('span', { text: info.label }));
    paletteButtons.set(type, button);
    palette.append(button);
  }
  root.append(palette, counter, lists);

  // ------------------------------------------------------------ editing

  /** Runs an edit; a rule-breaking edit becomes a friendly message instead of an error. */
  function attempt(edit) {
    try {
      const next = edit();
      program = next;
      render();
      onChange(program);
    } catch (error) {
      const text = error instanceof GameError ? friendly(error, level.maxBlocks) : null;
      if (text) onMessage(text);
      else {
        logError(error, 'program-editor');
        onMessage('Oops, that did not work. Try again.');
      }
    }
  }

  function addFromPalette(type) {
    if (locked) return;
    const listId = target;
    const newIndex = getList(program, listId).length;
    attempt(() => {
      const next = addBlock(program, listId, makeBlock(type), { maxBlocks: level.maxBlocks, allowed: level.allowed });
      // A new Repeat becomes the target, so the next taps go inside it.
      if (type === 'repeat') target = `${listId}.${newIndex}`;
      return next;
    });
  }

  const focusKey = (name, id) => `${name}:${id}`;

  /** Re-renders and puts keyboard focus back where it was (the DOM is rebuilt on every edit). */
  function withFocusKept(fn) {
    const key = root.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    fn();
    if (key) root.querySelector(`[data-fk="${key}"]`)?.focus();
  }

  // ------------------------------------------------------------- render

  /**
   * The target is a path ("main.1" = the body of the repeat at index 1), so a move or a removal can leave it
   * pointing at a different block or at nothing. Fall back to the main program rather than failing.
   */
  function ensureTargetValid() {
    try {
      getList(program, target);
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
      target = 'main';
    }
  }

  function render() {
    ensureTargetValid();
    withFocusKept(() => {
      clear(lists);
      lists.append(renderList('main', 'Main program'));
      if (usesFunction) lists.append(renderList('f', 'Function F'));
      const used = countBlocks(program);
      counter.textContent = `Blocks: ${used} of ${level.maxBlocks}`;
      updatePalette(used);
      applyHighlight();
    });
  }

  function updatePalette(used) {
    const full = used >= level.maxBlocks;
    const inF = target === 'f' || target.startsWith('f.');
    for (const [type, button] of paletteButtons) {
      // Only the run-time lock is a real `disabled`. A full program or a call inside F stays tappable
      // (aria-disabled + dimmed) so the tap can explain *why* it is not allowed, instead of doing nothing.
      button.disabled = locked;
      button.setAttribute('aria-disabled', String(full || (type === 'callF' && inF)));
      button.title = type === 'callF' && inF ? 'Function F cannot call itself' : '';
    }
  }

  function renderList(listId, title) {
    const blocks = getList(program, listId);
    const isTarget = target === listId;
    const used = countBlocks(program);
    const heading = el('button', {
      class: 'list__title',
      attrs: { type: 'button', 'aria-pressed': String(isTarget), 'data-fk': focusKey('title', listId) },
      on: { click: () => setTarget(listId) },
    }, el('span', { text: isTarget ? `${title} · adding here` : title }));
    heading.disabled = locked;

    const strip = el('ol', { class: `strip${isTarget ? ' is-target' : ''}`, attrs: { 'aria-label': title }, data: { list: listId } });
    blocks.forEach((block, i) => strip.append(renderBlock(block, `${listId}.${i}`, i, blocks.length)));
    if (isTarget) {
      const free = Math.max(0, level.maxBlocks - used);
      for (let n = 0; n < Math.min(free, MAX_VISIBLE_SLOTS); n++) strip.append(el('li', { class: 'slot', attrs: { 'aria-hidden': 'true' } }));
    }
    return el('div', { class: 'list' }, heading, strip);
  }

  function renderBlock(block, id, index, length) {
    const info = BLOCKS[block.type];
    const li = el('li', { class: `block block--${block.type}`, data: { id } });

    const grip = el('span', { class: 'block__grip', text: '⠿', attrs: { 'aria-hidden': 'true', title: 'Drag to move' } });
    grip.addEventListener('pointerdown', (event) => startDrag(event, id, li));

    const button = (symbol, name, onClick, disabled) =>
      el('button', {
        class: 'block__btn', text: symbol,
        attrs: { type: 'button', 'aria-label': `${name} ${info.label} block ${index + 1}`, 'data-fk': focusKey(name, id), disabled: disabled || locked },
        on: { click: onClick },
      });

    const listId = parentListId(id);
    const controls = el('span', { class: 'block__controls' },
      button('◀', 'Move earlier', () => moveAndFixTarget(id, listId, index - 1), index === 0),
      button('▶', 'Move later', () => moveAndFixTarget(id, listId, index + 1), index === length - 1),
      button('✖', 'Remove', () => removeAndFixTarget(id), false));

    const head = el('span', { class: 'block__head' }, grip,
      el('span', { class: 'block__icon', text: info.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'block__label', text: info.label }));

    if (block.type !== 'repeat') {
      li.append(head, controls);
      return li;
    }

    // Repeat: a stepper for the count, an "add inside" switch, and a nested strip.
    const stepper = el('span', { class: 'block__times' },
      el('button', { class: 'block__btn', text: '−', attrs: { type: 'button', 'aria-label': `Fewer times, repeat block ${index + 1}`, 'data-fk': focusKey('less', id), disabled: locked || block.times <= MIN_REPEAT }, on: { click: () => attempt(() => setRepeatTimes(program, id, block.times - 1)) } }),
      el('output', { class: 'block__count', text: `×${block.times}`, attrs: { 'aria-label': `${block.times} times` } }),
      el('button', { class: 'block__btn', text: '+', attrs: { type: 'button', 'aria-label': `More times, repeat block ${index + 1}`, 'data-fk': focusKey('more', id), disabled: locked || block.times >= MAX_REPEAT }, on: { click: () => attempt(() => setRepeatTimes(program, id, block.times + 1)) } }));
    const isTarget = target === id;
    const addInside = el('button', {
      class: 'block__btn block__inside', text: isTarget ? 'adding here' : 'add inside',
      attrs: { type: 'button', 'aria-pressed': String(isTarget), 'data-fk': focusKey('inside', id), disabled: locked },
      on: { click: () => setTarget(id) },
    });
    const nested = el('ol', { class: `strip strip--nested${isTarget ? ' is-target' : ''}`, attrs: { 'aria-label': `Inside repeat block ${index + 1}` }, data: { list: id } });
    block.body.forEach((child, i) => nested.append(renderBlock(child, `${id}.${i}`, i, block.body.length)));
    li.append(head, stepper, addInside, controls, nested);
    return li;
  }

  /** A move can re-number the blocks, so a nested "add inside" target goes back to its section (main or F). */
  function moveAndFixTarget(id, listId, index) {
    attempt(() => {
      const next = moveBlock(program, id, listId, index);
      target = parseId(target).section;
      return next;
    });
  }

  function setTarget(listId) {
    if (locked) return;
    target = listId;
    render();
  }

  /** Removing a Repeat (or anything inside the target) must not leave the target pointing at nothing. */
  function removeAndFixTarget(id) {
    attempt(() => {
      const next = removeBlock(program, id);
      if (target === id || target.startsWith(`${id}.`)) target = parentListId(id);
      else if (target.startsWith(`${parentListId(id)}.`)) {
        // A sibling repeat's index may have shifted down by one.
        const parent = parentListId(id);
        const removedAt = indexInParent(id);
        const [head, ...rest] = target.slice(parent.length + 1).split('.').map(Number);
        if (head > removedAt) target = [parent, head - 1, ...rest].join('.');
      }
      return next;
    });
  }

  // ---------------------------------------------------------- highlight

  function applyHighlight() {
    for (const node of root.querySelectorAll('.is-active, .is-failed')) node.classList.remove('is-active', 'is-failed');
    for (const id of highlight.active) root.querySelector(`.block[data-id="${id}"]`)?.classList.add('is-active');
    if (highlight.failed) {
      const node = root.querySelector(`.block[data-id="${highlight.failed}"]`);
      node?.classList.add('is-failed');
    }
    // Keep the block being run in view when the program is long.
    const current = [...root.querySelectorAll('.block.is-active, .block.is-failed')].at(-1);
    current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // --------------------------------------------------------------- drag

  function dropTarget(x, y, movingEl) {
    const hit = document.elementFromPoint(x, y)?.closest?.('ol[data-list]');
    // A repeat cannot be dropped into its own contents.
    if (!hit || movingEl.contains(hit)) return null;
    const siblings = [...hit.children].filter((c) => c.classList.contains('block') && c !== movingEl);
    let index = 0;
    for (const sibling of siblings) {
      const r = sibling.getBoundingClientRect();
      // Reading order: below the sibling's row, or on its row and right of its middle, means "after it".
      if (y > r.bottom || (y >= r.top && x > r.left + r.width / 2)) index += 1;
    }
    return { list: hit, listId: hit.dataset.list, index, before: siblings[index] ?? null };
  }

  function clearDropMarks() {
    for (const n of root.querySelectorAll('.drop-before, .drop-end')) n.classList.remove('drop-before', 'drop-end');
  }

  function startDrag(event, id, blockEl) {
    if (locked || event.button > 0) return;
    drag = { id, blockEl, startX: event.clientX, startY: event.clientY, ghost: null, pointerId: event.pointerId };
    event.target.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragCancel);
    window.addEventListener('keydown', onDragKey);
  }

  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.ghost = el('div', { class: `drag-ghost block--${drag.blockEl.className.match(/block--(\w+)/)?.[1] ?? ''}`, text: drag.blockEl.querySelector('.block__label')?.textContent ?? '' });
      document.body.append(drag.ghost);
      drag.blockEl.classList.add('is-dragging');
    }
    drag.ghost.style.left = `${event.clientX + 8}px`;
    drag.ghost.style.top = `${event.clientY + 8}px`;
    clearDropMarks();
    const drop = dropTarget(event.clientX, event.clientY, drag.blockEl);
    if (!drop) return;
    if (drop.before) drop.before.classList.add('drop-before');
    else drop.list.classList.add('drop-end');
  }

  function endDragVisuals() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragCancel);
    window.removeEventListener('keydown', onDragKey);
    drag?.ghost?.remove();
    drag?.blockEl.classList.remove('is-dragging');
    clearDropMarks();
  }

  function onDragEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { id, blockEl, ghost } = drag;
    const drop = ghost ? dropTarget(event.clientX, event.clientY, blockEl) : null;
    endDragVisuals();
    drag = null;
    if (drop) moveAndFixTarget(id, drop.listId, drop.index);
  }

  function onDragCancel() {
    endDragVisuals();
    drag = null;
  }

  function onDragKey(event) {
    if (event.key === 'Escape') onDragCancel();
  }

  // ---------------------------------------------------------------- API

  render();
  return {
    el: root,
    getProgram: () => program,
    clear() {
      program = emptyProgram();
      target = 'main';
      render();
      onChange(program);
    },
    setLocked(value) {
      locked = value;
      root.classList.toggle('is-locked', value);
      render();
    },
    /** Lights up the block(s) being run, or marks the one that failed. Does not rebuild the DOM. */
    setHighlight(next) {
      highlight = { active: next.active ?? [], failed: next.failed ?? null };
      applyHighlight();
    },
  };
}
