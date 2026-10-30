// Reference solutions for Worlds 2 and 3, kept out of the shipped game so the answers are not in the data
// the browser downloads. Each one is checked against its level in levels.test.js.
// (World 1 needs no entry: its par is the exact shortest path, found by solver.js.)
import { F, L, R, P, C, rep, prog } from './helpers.js';

export const solutions = {
  11: prog([rep(5, [F])]),
  12: prog([rep(4, [F]), L, rep(4, [F])]),
  13: prog([rep(4, [F, L, F, R])]),
  14: prog([rep(5, [F, L, F, R])]),
  15: prog([rep(3, [rep(2, [F]), L])]),
  16: prog([rep(2, [F, F, L, F, F, R])]),
  17: prog([F, F, rep(3, [F, L, F, R])]),
  18: prog([rep(2, [rep(2, [F]), L, rep(2, [F]), R])]),
  19: prog([rep(5, [F]), R, rep(3, [F, R, F, L])]),
  20: prog([rep(2, [F, L, F, R]), L, rep(2, [F, L, F, R])]),
  21: prog([rep(3, [F]), P, rep(3, [F])]),
  22: prog([rep(3, [F, P]), F]),
  23: prog([C, L, C, R, C], [F, P, F]),
  24: prog([C, L, C, R, C, F], [rep(2, [F]), P]),
  25: prog([rep(3, [C, L]), F], [F, F, P]),
  26: prog([rep(3, [C]), F], [F, P, L, F, P, R]),
  27: prog([C, R, F, R, C, L, F], [F, F, F, P]),
  28: prog([rep(3, [C])], [rep(2, [F]), P, L, F, R]),
  29: prog([rep(4, [C]), F], [F, F, P, R]),
  30: prog([rep(2, [C, L, C, R]), F], [F, P, F, P]),
};
