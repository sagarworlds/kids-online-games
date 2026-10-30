# Spot the Difference

Two pictures look the same, but they are not. Tap the differences in either picture. Every pair is made by code from a
seed, so there are endless puzzles and no hand-drawn image pairs. For ages 8–10. Works with touch, mouse and keyboard,
and offline once loaded.

## How to play

1. Pick a level and a place (park, kitchen, beach, classroom, space, or a mix of all five).
2. A round is **5 pictures**. In each, tap a difference in **either** picture. A hit draws a green circle round it on both
   pictures, says what changed ("The bird changed colour") and plays a "ding". A miss shows a small ✖ and the pictures dim
   for a moment: taps are ignored for 300 ms, so tapping everywhere at random cannot find anything.
3. **Hint** (2 for the whole round) pulses a soft glowing circle over the region of one difference you have not found.
4. Find them all, then press **Next picture**. After 5 pictures you get 1–3 stars, your time and the kinds of difference
   you spotted.

| Level | Differences | Things in a picture | Kinds of difference | Target time |
|-------|-------------|---------------------|---------------------|-------------|
| Easy | 3 | 12 | colour, missing, added | 60 s |
| Medium | 5 | 15 | + size (±30%), flipped | 90 s |
| Hard | 7 | 18 | + moved, turned, a subtler colour change | 120 s |

**Stars (each picture):** all found with at most 1 miss and inside the target time = 3, up to 3 misses = 2, otherwise 1.
The round's stars are the average of the 5 (a half rounds up). Each miss also takes 3 seconds off the time bonus.
**Nothing is ever lost**: there is no fail state, and the clock only decides stars.

**Keyboard:** Tab to a picture, then the **arrow keys** move a crosshair (**Shift** + arrow moves it further) and **Enter**
(or Space) taps there. The clock pauses while the grown-ups settings are open, or the tab is hidden.

## How it is built

- `data/objects.json` has **77 object drawings** (tree, bird, cup, cloud, rocket…) made only of rectangles, circles, ellipses,
  polygons and simple paths. A `"$"` fill means "the object's own colour" (`"$d"` darker, `"$l"` lighter), which is how one
  drawing can be any colour and recolouring still looks right. `data/themes/*.json` has a background and a pool of 20–30
  of those objects for each place. Both are checked on load (`logic/templates.js`): a bad file names itself and the field
  in the log and shows the friendly error screen.
- `logic/` is pure and deterministic (no DOM, storage, timers or `Math.random`; a seeded `rng` is passed in):
  - `sceneBuilder` places 12–18 different objects without touching (biggest first, rejection sampling, with a limit).
  - `mutations/` has one file per kind of difference, all with the same shape (`canApply`, `apply`), so a new kind is a new
    file and a line in `mutations/index.js`. Each makes sure the change is clearly visible: a new colour is at least 90°
    away in hue and different in lightness (40–70° for the Hard "subtle" one, still far enough in RGB); resizing is ±30%,
    never leaving an object under 36 px or pushing it into a neighbour; a move is at least 48 px; a turn is 25–70°; only
    objects marked `asymmetric` are flipped and objects marked `noRotate` (a ball, a sun) are never turned; an added object
    is a kind that is not in the picture yet.
  - `differenceMaker` uses the kinds in turn, each object at most once, and keeps every place to tap apart from the others.
  - `puzzle.generatePuzzle` is deterministic for a seed (so a daily puzzle is easy to add later). If a seed is unlucky it
    tries a nearby one, up to 3 times, then throws `PUZZLE_FAILED` with the theme, level and seed, which the error screen
    and the log show.
  - `hitTest` and `round` hold the tapping rules, hints, cooldown and stars.
- `tests/spot-the-difference/` checks all of that, including **300 seeds for every level (and every theme at every level)**:
  each puzzle has exactly the right number of differences, found by an independent comparison of the two pictures that does
  not use how they were made; each is visible (the colour, size, distance and angle limits above); the places to tap never
  overlap and are each at least 48 × 48; and nothing in either picture touches or leaves the edge.
- `ui/Picture.js` draws both pictures with the same function from the data, as SVG, so they can only differ where the data
  does. Circles, crosses, hints and the keyboard crosshair are drawn on a layer above. `scenes/` has the menu, the game and
  the results.

## Notes for the reviewer: needs a human check

- The **drawings** are simple cartoon shapes made in code. They have been checked by looking at screenshots, but an artist
  or a child should say whether each of the 77 things is recognisable (for example the satellite, the astronaut, the swing).
- Tapping accuracy on a **real touch screen** (especially small phones) and on Safari / iPad is untested here. The area to
  tap is made at least 48 px on the screen however small the picture gets, and a tap is turned into picture coordinates from
  the picture's real on-screen size.
- The spoken labels use the browser's voices, and only if "read aloud" is on in the grown-ups settings.
- There is no "show me" button: if a child is stuck after both hints, they can leave with Home. That is as the spec has it.
