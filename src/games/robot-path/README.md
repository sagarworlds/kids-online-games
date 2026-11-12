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

## 3D view

On a device that can do WebGL 2 the puzzle opens in 3D by default. A **3D view / 2D view** button on the level map, and
inside every 3D puzzle, switches and remembers the choice (the blocks you have built come with you). The rules, the
blocks, running, stepping, hints, stars and saved progress are the same code as 2D, so the same play earns the same stars;
only the board changes.

- **The board** is the same grid, rocks, battery, gems and robot, seen at an angle. One finger or the mouse turns it, two
  fingers or the wheel zoom, the arrow keys and + / − do both while the picture has focus, and **Whole board** glides back.
- **The robot walks** to the next square, **turns on the spot** (right is clockwise seen from above), **leans into a rock
  or the edge and bounces back** (the block that caused it still turns red with "✖ Stopped here"), **hops to pick up a
  gem**, and dances when it reaches the battery. The nose and eyes show which way it faces.
- **Robot's view** puts the camera behind the robot, looking the way it looks, and carries it along. Then a *turn left*
  bends the picture to the left and a *turn right* to the right: the point of the game, since left and right in a program
  are the robot's own, whichever way the board is turned. Switch it off to get your map view back.
- **On a phone** the picture is at least 46% of the height with the run buttons pinned at the top of the controls, and the
  blocks scroll below them (beside the picture in landscape). Every button is at least 48 px. With "less motion" turned on
  the robot is simply where each step leaves it, the camera cuts instead of gliding, and nothing spins.
- **If 3D cannot run** (no WebGL 2, the 3D file failing to load, the scene failing to start, or the graphics being lost
  mid-puzzle) the 2D puzzle opens with no error screen, with your blocks. That only lasts for the visit; it does not change
  the saved choice.

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
  board3d.js                     3D geometry: where squares are, which way the robot faces and turns, what each step looks
                                 like, the robot's-view camera (unit-tested)
scenes/                          MapScene (level map), PuzzleScene (board + editor + playback), CompleteScene
ui/BoardView.js                  SVG board: tiles, rocks, battery, gems, the robot
ui/ProgramEditor.js              Palette, program strips, drag and drop, keyboard buttons
three/                           The 3D view, loaded with import() only when a puzzle opens in 3D (the 2D game and the
                                 home page never download three.js): Puzzle3DScene (the puzzle scene with a 3D board and
                                 layout), BoardView3D (the board and its camera), boardModels (rocks, battery, gem, robot),
                                 boardTheme (the world colours)
```

Tests are in `tests/robot-path/`. `solver.js` (BFS) and `solutions.js` (a reference program for every level in
Worlds 2 and 3) live there, not in the shipped game, so the answers are not downloaded by the browser.

## What the tests guarantee

- The 3D geometry (`tests/robot-path/board3d.test.js`): a right turn is clockwise seen from above and a left turn anticlockwise
  from every heading, the robot never turns the long way round, the robot's-view camera sits behind the robot for every
  heading, and playing every level's reference solution step by step ends where the rules say.
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
