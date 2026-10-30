# Robot Path (`robot-path`)

The child plans a robot's route with command blocks, presses **Run**, and watches the robot follow
the plan to the battery: a first taste of programming.

**Learning goal:** sequencing, debugging, directions (left and right *relative to the way the robot
faces*), loops, functions and planning ahead.

## How to play

1. Pick a level on the map. Level *n* opens when level *n − 1* has at least one star.
2. Tap blocks in the palette to add them to your program. Drag a block by its grip (⠿) to move it,
   or use ◀ ▶ to reorder and ✖ to remove it.
3. **Run** plays the program at one block every 400 ms. **Step** runs one block at a time (and **Run**
   carries on from there). **Reset** stops and returns the robot to the start; **Clear** empties the program.
4. A wall or the edge of the board stops the robot ("Robot hit a wall at step 4") and the block that
   caused it turns red with "✖ Stopped here". After two failed runs you get a hint.

## Worlds and blocks

| World | Levels | Board | New blocks |
| --- | --- | --- | --- |
| 1 Garden | 1–10 | 5 × 5 | Forward, Turn left, Turn right |
| 2 Factory | 11–20 | 6 × 6 | Repeat ×2–9 (can be nested) |
| 3 Space | 21–30 | 7 × 7 | Pick gem, and **Function F** (build it once, call it with *Call F*) |

The grown-up difficulty lock maps onto the worlds: Easy = World 1, Medium = World 2, Hard = World 3,
and the first level of the locked world is always open.

## Stars

Reached the battery = 1, used at most **par** blocks = +1, collected every gem = +1. "Every gem" is
automatically met on levels with no gems (Worlds 1 and 2), so there a solved level earns 2 stars and
a solution within par earns 3. This reading of the spec is flagged in the pull request.

"Blocks used" counts every block you place: nested blocks and the body of Function F included.

## Data: `data/levels.json`

Levels are hand-editable ASCII maps, validated on load (the error names the file and the field):

```
"map": ["..#.G", "....#", "...#.", ".#...", ".#..^"]
```

`.` empty · `#` rock · `*` gem · `G` battery · `^ > v <` the robot's start square and which way it faces.
Rows run top to bottom. Each level also has `par`, `maxBlocks` (the number of slots shown), a `title` and a `tip`.
Gems are only allowed in worlds that have the Pick gem block.

## File map

```
index.html, main.js, style.css   Page, composition root (loads and validates levels, builds `routes`), styles
data/levels.json                 3 worlds, 30 levels
logic/                           Pure rules, no DOM (all unit-tested)
  interpreter.js                 compile() flattens Repeat and Function F (200-step cap), run() returns a frame trace
  program.js                     Add / remove / move / set-repeat on the program, block limit, "F cannot call itself"
  levels.js                      Parses and validates levels.json
  scoring.js, progress.js        Stars and which levels are open
  messages.js                    Run messages and hints
scenes/                          MapScene (level map), PuzzleScene (board + editor + playback), CompleteScene
ui/BoardView.js                  SVG board: tiles, rocks, battery, gems, the robot
ui/ProgramEditor.js              Palette, program strips, drag and drop, keyboard buttons
```

Tests are in `tests/robot-path/`. `solver.js` (BFS) and `solutions.js` (a reference program for every level in
Worlds 2 and 3) live there, not in the shipped game, so the answers are not downloaded by the browser.

## What the tests guarantee

- Every level can be reached (BFS) and is solvable within `maxBlocks`.
- In World 1, `par` is the exact shortest route.
- Every reference solution runs in the real interpreter and earns 3 stars.
- Levels meant to need a Repeat (World 2) or Repeat / Function F (levels 22–30) really do: a plain program
  that collects every gem would not fit in `maxBlocks`.

## Notes

- The board is SVG, not canvas: it stays sharp at any size and the robot moves and turns with CSS transitions.
  The robot's "nose" triangle shows which way it faces, so direction never depends on colour.
- A run that will hit the 200-step cap fast-forwards after the first 10 blocks, instead of making the child wait 80 s.
- Buttons that cannot act right now because the program is full, or because F cannot call itself, stay tappable and
  explain why; only the run-time lock is a true `disabled`.
- With `prefers-reduced-motion` the robot jumps from square to square and the dance and bump animations are off.

## Stretch ideas (not built)

A level editor that saves to JSON; an `If wall ahead` block for a World 4.
