import { recolor, subtleRecolor } from './recolor.js';
import { remove } from './remove.js';
import { add } from './add.js';
import { resize } from './resize.js';
import { flip } from './flip.js';
import { move } from './move.js';
import { rotate } from './rotate.js';

/**
 * @typedef {{
 *   id: string, type: 'recolor'|'remove'|'add'|'resize'|'flip'|'move'|'rotate', targetKind: 'object'|'scene',
 *   canApply: (target: import('../geometry.js').SceneObject|null, context: any) => boolean,
 *   apply: (target: import('../geometry.js').SceneObject|null, context: any) => ({
 *     replace?: import('../geometry.js').SceneObject|null, add?: import('../geometry.js').SceneObject,
 *     box: import('../geometry.js').Box, label: string
 *   })|null
 * }} Mutation
 * One file for each, all with the same shape, so a new kind of difference is a new file and one line here (open for
 * extension, closed for modification). `apply` returns null when it cannot find a way to make a clear difference.
 */

/** @type {Readonly<Record<string, Mutation>>} */
export const MUTATIONS = Object.freeze(Object.fromEntries([recolor, subtleRecolor, remove, add, resize, flip, move, rotate].map((m) => [m.id, m])));
