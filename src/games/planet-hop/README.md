# Planet Hop

Put the planets in order, find out how heavy you would feel on each one, and test what you know about the solar system.
For ages 8–10. Works with touch, mouse and keyboard, and offline once loaded. Nothing is stored about the child's weight.

## How to play

Pick a level, then one of three ways to play. Every way ends on a results screen with 1–3 stars and your **space rank**
(Space Cadet → Astronaut at 8 stars → Commander at 20 stars, counted over every mode and level).

| Mode | What you do | Stars |
|------|-------------|-------|
| **Line them up** | Eight planets float in a mixed-up order. Drag each into its orbit, starting next to the Sun. A wrong orbit slides the planet back with a hint ("Mars is the 4th planet, the red one."). A right one locks in and circles slowly. | 0–1 wrong drops = 3, 2–3 = 2, more = 1 |
| **Weigh-in** | Say how much you weigh (or pick "a 20 kg dog"), hop a rocket from planet to planet and watch a cartoon scale show your felt weight. After 3 hops, a mission check asks 5 "you would weigh X kg on a mystery place, which one is it?" questions. | The shared rule on the 5 questions: 5 right = 3 stars, 4 = 2 |
| **Planet quiz** | 10 questions with pictures to choose from. | 9–10 right = 3 stars, 7–8 = 2 |

| Level | Line them up | Weigh-in | Quiz |
|-------|--------------|----------|------|
| Easy | names and orbit numbers | pick a toy weight; 3 places to choose from | 3 answers, easiest questions |
| Medium | names, no numbers | type your own weight; 4 choices | 4 answers |
| Hard | pictures only, no names | type your own weight; 5 choices | 4 answers, trickiest questions |

Keys **1–5** pick an answer. In the line-up, press Enter on a planet and then on an orbit (or tap, tap) instead of dragging.
"Show real size" draws the planets in their true proportions (Mercury becomes tiny); normally they are drawn on a
compressed scale so the smallest is still easy to see and tap.

## 3D view

On a device that can do WebGL 2, **Line them up** and **Weigh-in** open in 3D by default (the quiz stays flat). A
**3D view / 2D view** button on the menu, and inside each 3D round, switches and remembers the child's choice. Everything
that decides play (the rules, hints, stars, scores, the mystery questions, the saved progress) is the same code as 2D, so
the same play earns the same stars; only the picture and how a planet is picked up and put down change.

| | 3D line-up | 3D weigh-in |
|---|---|---|
| What you see | The Sun with eight empty orbit rings. A planet you pick floats above the Sun, then slides into the orbit you choose. | All the planets and the Moon. A rocket flies in an arc to the place you pick and lands on top of it. |
| How you play | Tap a planet, then tap its orbit on the picture **or** on the numbered orbit buttons below. | Tap a place on the picture **or** its button. Your felt weight shows on the card and the bar. |
| Gravity | – | After landing, an astronaut steps out and jumps with the same push everywhere: about 5.9 times as high on the Moon as on Earth, 2.6 times on Mars, 40% as high on Jupiter. The sentence under the card says so (and "Jump again" repeats it). The jumps are real physics: height and time both go as 1 / gravity. |
| "Show real size" | Planets grow or shrink to true proportions (Mercury becomes a speck, Jupiter about 29 times as wide). | Same; the rocket and astronaut shrink with the body they stand on, and the camera follows. |

**Controls.** One finger or the mouse turns the picture, two fingers or the wheel zoom, and the arrow keys and + / − do
both while the picture has focus. **Whole system** glides back to the overview. Orbits are evenly spaced, not to true
distance (Neptune is 77 times as far out as Mercury, which would squash the inner planets into the Sun); sizes follow
the same compressed or real scale as the 2D pictures.

**If 3D cannot run**, the game opens the 2D version with no error screen: no WebGL 2, the 3D file failing to load, the
scene failing to start, or the graphics being lost mid-round (a weigh-in keeps the weight already entered, in memory only).
That only lasts for the visit; it does not change the child's saved choice. Phones: the picture is at least 46% of the
height with the controls below (beside it in landscape), every button is at least 48 px, and with "less motion" turned on
nothing spins, the camera cuts instead of gliding, the rocket is simply there, and the astronaut holds the top of the jump.

Files: `logic/space3d.js` (where things go and how the camera frames them), `logic/motion3d.js` (easing, camera glide, the
rocket's arc), `logic/gravityJump.js` (the jump and its sentence), `logic/rocketTrip.machine.js` (what the rocket is
doing), and `three/` (`SpaceStage` builds the stage, camera and scenery from `SolarSystem`, `planetTextures` draws the
planet surfaces on a canvas, `figures` builds the rocket and astronaut, and the two scenes). `ui/WeightSetup.js` and
`ui/MissionCheck.js` are the screens the 2D and 3D weigh-ins share. three.js is loaded with `import()` only when a 3D
scene opens, so the 2D game and the home page never download it. Tests: `tests/planet-hop/space3d.test.js`.

## How it works

- `data/planets.json`, `quiz.json` and `presets.json` hold all the content. Planet order, gravity, size and distance are
  read from `planets.json` only (never written into the code). On load the files are checked; a mistake names the file and
  field in the console and shows the friendly error screen. The quiz is also checked against the planets: a question that
  says it is about "the biggest planet" must have the planet with the biggest radius as its answer.
- `logic/` is pure (no DOM, storage, timers or `Math.random`): line-up rules, `feltWeight` and weight input checking,
  the mystery questions, quiz building, picture sizes, scale-dial maths and ranks. Tests are in `tests/planet-hop/`.
- `ui/` draws the planets (SVG, one picture each), the cartoon scale and the question panel; `scenes/` has one scene per
  mode plus menu and results, and they only talk through the `routes` object built in `main.js`. Dragging uses the shared
  `src/engine/ui/DragDrop.js`.
- **Privacy:** the weight is kept in the weigh-in scene only. It is not written to storage and does not leave the device.
  Only stars and the rank badge are saved.

### Felt weight

`feltWeight(kg, gravity)` = weight × gravity, rounded to one decimal, worked out in whole numbers so a result such as
25 kg on Venus (22.75) rounds to 22.8 and not 22.7 because of floating-point error. Weights from 10 to 150 kg are accepted
(a dot or a comma works as the decimal point); anything else shows "Please enter a number between 10 and 150".

## Needs a human check

- **Gravity values** are the ones in `docs/SPEC.md`. The spec asks for them to be verified against the NASA Planetary Fact
  Sheet before release; that could not be done from the build environment (no network access to it). Venus (0.91) and
  Uranus (0.90) are the closest calls: the fact sheet lists both at about 8.87 m/s², which is about 0.90 of Earth's.
  Edit `data/planets.json` if they should change; nothing else needs to.
- The planet facts, the 31 quiz questions and their explanations were written for this game. Please read them through
  before classroom use. The quiz explains Pluto as a dwarf planet.
- Mercury and Mars have the same gravity (0.38), as do, within a hundredth, Venus and Uranus. The mystery questions never
  offer such look-alikes together, so every question has exactly one right answer.
