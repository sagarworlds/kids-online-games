# Lights Out (`lights-out`)

A grid of jars with fireflies. Tapping a jar flips it and its up, down, left and right neighbours; the child must
switch every firefly off (free them all) in as few taps as possible.

**Learning goal:** logical reasoning, cause and effect, planning, and persistence (try, observe, adjust).

## How to play

1. Pick a size: Easy 3 × 3, Medium 4 × 4, Hard 5 × 5. A round is 5 puzzles.
2. Tap a jar. A lit jar (firefly inside) goes dark and the other way round, and so do its neighbours.
3. Get every jar dark. **Undo** and **Restart** are always there, and **Hint** points at a jar that belongs to a solution.
4. Stars per puzzle: at most *par* taps = 3, at most par + 3 = 2, solved = 1. The round's stars are the average, rounded.

Keyboard: arrow keys move between jars, Space or Enter taps. Each jar announces its row, column and whether it holds a
firefly. A lit jar is brighter *and* shows a firefly, so it never depends on colour alone.

## Rules worth knowing

- Puzzles are made by tapping *k* random distinct jars on a dark board, so they are always solvable and *k* is the par
  (Easy 2–3, Medium 4–6, Hard 7–10). A scramble that cancels itself out is thrown away.
- On **Easy** Undo and Restart are free. On **Medium and Hard** they count as a move, so careless tapping costs stars.
- Hints: Easy uses the taps recorded when the puzzle was made (minus the ones already done); Medium and Hard solve the
  *current* board, so a hint stays right even after mistakes.

## The solver (`logic/solver.js`)

A tap is a vector with a 1 in each jar it flips; tapping twice cancels and order never matters, so the board is the XOR
(addition mod 2) of the taps used. Switching a board off means solving `A·x = b` over GF(2), which Gaussian elimination
does with XOR as "subtract". Boards can have several solutions (they differ by "null patterns" that change nothing), so
the solver tries them all and returns a smallest one. It returns `null` for the boards that cannot be solved (some 4×4
and 5×5 boards can't). Tests compare it with brute force over *every* 2×2, 3×3 and 4×4 board.

## File map

```
index.html, main.js, style.css    Page, composition root (routes), styles
scenes/                           MenuScene, PuzzleScene, ResultScene (+ LightsScene base with routes)
ui/BoardView.js                   DOM grid of jar buttons (roving focus, arrow keys)
logic/                            Pure rules, no DOM (all unit-tested)
  board.js                        toggle (immutable), isSolved
  solver.js                       GF(2) Gaussian elimination, minimum solution
  puzzleGenerator.js              k random distinct taps, never already solved
  puzzleState.js                  tap / undo / restart and what they cost
  hint.js, scoring.js, levels.js
```

## Stretch ideas (not built)

"Lights On" reverse mode; an X-shaped toggle variant for experts.
