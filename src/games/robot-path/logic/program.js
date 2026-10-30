import { GameError } from '../../../engine/utils/errors.js';

/** @typedef {import('./interpreter.js').Command} Command */
/** @typedef {import('./interpreter.js').Program} Program */

/**
 * Pure editing operations for the program the child builds. Every function
 * returns a new program and leaves its input untouched, so the editor can
 * keep a simple "current program" value and the logic stays easy to test.
 *
 * Addressing uses ids made of a section and indices:
 * - a *block* id is "main.2" or "main.1.0" (block 0 inside the repeat at index 1) or "f.0";
 * - a *list* id is either a section ("main", "f") or a repeat block's id ("main.1"),
 *   meaning "the blocks inside that repeat".
 */

export const MIN_REPEAT = 2;
export const MAX_REPEAT = 9;
const SECTIONS = new Set(['main', 'f']);

/** @returns {Program} */
export function emptyProgram() {
  return { main: [], f: [] };
}

/**
 * @param {import('./interpreter.js').CommandType} type
 * @param {number} [times] Repeat count (repeat blocks only).
 * @returns {Command}
 */
export function makeBlock(type, times = MIN_REPEAT) {
  return type === 'repeat' ? { type, times, body: [] } : { type };
}

const clone = (program) => JSON.parse(JSON.stringify(program));

/** @param {Command} command @returns {number} The block plus everything nested inside it. */
function sizeOf(command) {
  return 1 + (command.body ?? []).reduce((sum, child) => sum + sizeOf(child), 0);
}

/**
 * Blocks the child has placed, nested blocks and Function F's body included.
 * This is the number compared with `par` and `maxBlocks`.
 * @param {Program} program
 * @returns {number}
 */
export function countBlocks(program) {
  return [...program.main, ...program.f].reduce((sum, command) => sum + sizeOf(command), 0);
}

/**
 * @param {string} id
 * @returns {{ section: 'main'|'f', indices: number[] }}
 * @throws {GameError} 'BAD_ID' for anything that is not a section followed by indices.
 */
export function parseId(id) {
  const [section, ...rest] = String(id).split('.');
  // Check the text of each index: Number('') is 0, which would let "main.1." slip through.
  const indices = rest.map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
  if (!SECTIONS.has(section) || indices.some(Number.isNaN)) {
    throw new GameError('BAD_ID', `"${id}" is not a block or list id`, { id });
  }
  return { section, indices };
}

/** The id of the list that holds a block, e.g. "main.1.0" -> "main.1", "main.2" -> "main". */
export function parentListId(blockId) {
  const { section, indices } = parseId(blockId);
  if (indices.length === 0) throw new GameError('BAD_ID', `"${blockId}" is a list, not a block`, { id: blockId });
  return [section, ...indices.slice(0, -1)].join('.');
}

/** The position of a block inside its list. */
export function indexInParent(blockId) {
  const { indices } = parseId(blockId);
  if (indices.length === 0) throw new GameError('BAD_ID', `"${blockId}" is a list, not a block`, { id: blockId });
  return indices.at(-1);
}

/** Resolves a list id to the actual array inside `program` (not a copy). */
function listAt(program, listId) {
  const { section, indices } = parseId(listId);
  let list = program[section];
  for (const index of indices) {
    const block = list[index];
    if (!block || block.type !== 'repeat') {
      throw new GameError('BAD_ID', `"${listId}" is not a list`, { id: listId });
    }
    list = block.body;
  }
  return list;
}

/** Function F cannot contain a call to itself: that would run forever. */
function assertAllowedHere(block, listId, allowed) {
  if (allowed && !allowed.includes(block.type)) {
    throw new GameError('BLOCK_NOT_ALLOWED', `"${block.type}" is not available on this level`, { type: block.type });
  }
  const inF = parseId(listId).section === 'f';
  const containsCall = (b) => b.type === 'callF' || (b.body ?? []).some(containsCall);
  if (inF && containsCall(block)) {
    throw new GameError('NO_RECURSION', 'Function F cannot call itself', { type: block.type });
  }
}

/**
 * Adds a block to a list.
 * @param {Program} program
 * @param {string} listId Where to add ("main", "f", or a repeat block's id).
 * @param {Command} block
 * @param {{ index?: number, maxBlocks?: number, allowed?: readonly string[] }} [options]
 *   `index` defaults to the end of the list.
 * @returns {Program}
 * @throws {GameError} 'PROGRAM_FULL', 'BLOCK_NOT_ALLOWED', 'NO_RECURSION' or 'BAD_ID'.
 */
export function addBlock(program, listId, block, { index, maxBlocks = Infinity, allowed } = {}) {
  assertAllowedHere(block, listId, allowed);
  if (countBlocks(program) + sizeOf(block) > maxBlocks) {
    throw new GameError('PROGRAM_FULL', `This level allows at most ${maxBlocks} blocks`, { maxBlocks });
  }
  const next = clone(program);
  const list = listAt(next, listId);
  list.splice(index ?? list.length, 0, clone(block));
  return next;
}

/**
 * Removes a block together with anything inside it.
 * @param {Program} program
 * @param {string} blockId
 * @returns {Program}
 */
export function removeBlock(program, blockId) {
  const next = clone(program);
  const list = listAt(next, parentListId(blockId));
  const index = indexInParent(blockId);
  if (index >= list.length) throw new GameError('BAD_ID', `no block at ${blockId}`, { id: blockId });
  list.splice(index, 1);
  return next;
}

/**
 * Moves a block (with its contents) to a list. `index` is the position in the
 * target list *after* the block has been taken out of its old place, which is
 * what a drop position naturally means.
 *
 * @param {Program} program
 * @param {string} blockId
 * @param {string} targetListId
 * @param {number} index
 * @returns {Program}
 * @throws {GameError} 'BAD_MOVE' when dropping a repeat inside itself, 'NO_RECURSION', or 'BAD_ID'.
 */
export function moveBlock(program, blockId, targetListId, index) {
  if (targetListId === blockId || targetListId.startsWith(`${blockId}.`)) {
    throw new GameError('BAD_MOVE', 'A block cannot be moved inside itself', { blockId, targetListId });
  }
  const next = clone(program);
  // Resolve the target array *before* removing anything, so index shifts cannot
  // point us at the wrong list.
  const target = listAt(next, targetListId);
  const source = listAt(next, parentListId(blockId));
  const [block] = source.splice(indexInParent(blockId), 1);
  if (!block) throw new GameError('BAD_ID', `no block at ${blockId}`, { id: blockId });
  assertAllowedHere(block, targetListId);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, block);
  return next;
}

/**
 * Sets how many times a repeat block repeats.
 * @param {Program} program
 * @param {string} blockId
 * @param {number} times Whole number from {@link MIN_REPEAT} to {@link MAX_REPEAT}.
 * @returns {Program}
 */
export function setRepeatTimes(program, blockId, times) {
  if (!Number.isInteger(times) || times < MIN_REPEAT || times > MAX_REPEAT) {
    throw new GameError('BAD_REPEAT', `Repeat must be ${MIN_REPEAT} to ${MAX_REPEAT} times`, { times });
  }
  const next = clone(program);
  const block = listAt(next, parentListId(blockId))[indexInParent(blockId)];
  if (!block || block.type !== 'repeat') throw new GameError('BAD_ID', `${blockId} is not a repeat block`, { id: blockId });
  block.times = times;
  return next;
}

/**
 * Reads a block without copying (for rendering and tests).
 * @param {Program} program
 * @param {string} blockId
 * @returns {Command|undefined}
 */
export function getBlock(program, blockId) {
  return listAt(program, parentListId(blockId))[indexInParent(blockId)];
}

/**
 * Reads a list (a section or a repeat block's body) without copying, for rendering.
 * @param {Program} program
 * @param {string} listId "main", "f", or a repeat block's id.
 * @returns {Command[]}
 */
export function getList(program, listId) {
  return listAt(program, listId);
}

/** True once the program holds at least one block that does something. */
export function hasBlocks(program) {
  return countBlocks(program) > 0;
}
