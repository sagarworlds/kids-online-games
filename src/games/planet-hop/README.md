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
