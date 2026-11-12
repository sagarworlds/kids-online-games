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

## 3D view

On a device that can do WebGL 2 the puzzle is 3D. A **3D view / 2D view** button on the menu switches and remembers the choice. The
puzzles, the taps, Undo and Restart (and what they cost), the hints, the stars and the saved progress are the same code as 2D (the 3D
puzzle extends `PuzzleScene` through two small hooks: how the board is made and how the screen is laid out), so the same seed and the
same taps give the same puzzles and the same stars in both views.

- **The board** is a table at night with a glass jar on a coaster for every cell, which you can turn and zoom (drag, pinch, scroll or the
  arrow keys on the picture). A lit jar has a glowing **firefly** inside and a warm glow; a dark jar is empty and cool, so the two differ by
  shape and brightness, not colour alone. **Tap a jar** to flip it and its neighbours: the flipped jars bounce. When the puzzle is solved
  the fireflies fly away above the board.
- **Hint** says which jar in words ("Try the jar in row 2, column 3"), outlines that jar and floats an arrow over it.
- **The jar buttons are still there.** The flat grid of buttons is laid over the picture, one on each jar, invisible except for its focus ring
  and the hint outline. So the keyboard and screen readers work as before (arrows move between jars, Space or Enter flips, every jar says its
  row, column and whether it holds a firefly), and they are never smaller than 48 pixels. A tap on the picture is worked out from the picture
  itself (on an invisible stand-in for each jar that does not move when the jar bounces, so a bouncing jar never catches a tap meant for the one
  behind it).
- **If 3D cannot run**: no WebGL 2 means no 3D button; if the 3D file will not load, the flat puzzle opens. If 3D cannot start, or the graphics
  are lost *in the middle of a puzzle*, the picture goes and the flat grid becomes the board again, exactly as it was (same jars, same moves),
  and the next puzzles are flat too for the rest of the visit. That only lasts for the visit; it does not change the saved choice.
- **On a phone** the picture takes at least 45% of the screen's height with Undo, Restart and Hint under it; the "solved" card goes in the
  panel under the picture so the fireflies can be seen. With "less motion" nothing bounces, drifts or flies, the flipped jars change at once,
  and the camera does not glide. three.js is loaded with `import()` only when the 3D puzzle opens.

**Not built: the cube.** The plan for the 3D versions (`docs/SPEC.md`) also imagines the Hard level as a cube whose lights wrap round the
edges. That is a different puzzle (the neighbours of a jar change, so the solver, the par and what is solvable change, and a flat grid could not
show it if 3D failed), so 2D and 3D would no longer earn the same stars. The 3D board is the same size as 2D at every level (3 x 3, 4 x 4,
5 x 5). A "cube" mode for both views would be a separate feature.

Files: `logic/look3d.js` (where each jar stands, which jars a tap changed, the camera, the bounce and the flights of the fireflies),
unit-tested in `tests/lights-out/look3d.test.js`; and `three/` (`jarModels`, `BoardView3D`, `Puzzle3DScene`). The firefly's glow is the
shared `engine/three/glow.js`.

## Stretch ideas (not built)

"Lights On" reverse mode; an X-shaped toggle variant for experts.
