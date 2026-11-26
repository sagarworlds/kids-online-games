# Flag & Capital Quest

Fly around the world, learn flags and capitals, and earn a passport stamp for every country you explore.
For ages 8–10. Works with touch, mouse and keyboard, and offline once loaded.

## How to play

1. Pick a level and a continent (or **Whole world**) on the world map. A trip is 10 questions.
2. Answer the question. After each answer the country is shown on the map and you learn a fun fact.
3. A country is **explored** once you have answered 2 questions about it right. It turns green on the map and gets a stamp in the **Passport**.

| Level  | Questions asked                                          |
|--------|----------------------------------------------------------|
| Easy   | Which country has this flag? (4 choices)                 |
| Medium | Flags, and "What is the capital of …?"                   |
| Hard   | Flags, capitals, "Tap the country on the map", and "… is the capital of which country?" |

Stars for a trip: 3 stars for 9 or 10 right, 2 stars for 7 or 8, 1 star otherwise.
Keys **1–4** pick an answer. On the map, drag to move, use the mouse wheel, pinch or the **＋ / －** buttons to zoom,
and the arrow keys to pan. Every map question has a **Choose from a list instead** button for keyboard and screen-reader players.

## 3D view

On a device that can do WebGL 2 the world map and every trip use a **globe**. A **3D view / 2D view** button on the hub
switches and remembers the choice. The questions, answers, progress, stamps and stars are the same code as 2D (the 3D
scenes extend the 2D `WorldScene` and `TripScene`, replacing only the map), so the same play earns the same stars.

- **Spin and zoom:** one finger or the mouse spins the globe (it turns slowly when zoomed in, so the surface follows the
  finger), two fingers or the wheel zoom, the arrow keys and + / − do both while the picture has focus, and the **＋ − ⤢**
  buttons (in the corner of the picture) zoom and go back to the whole area. A trip starts turned to its continent.
- **After an answer** the globe turns to the country, which turns orange with its name beside it, and on a right answer a
  **plane flies the shortest route over the surface** (a great circle: why routes look curved on a flat map) and parks over it.
- **Explored countries** are coloured green as in 2D **and** get a gold pin, so "visited" is not told by colour alone.
- **Tap a country** on a map question: a tap on the globe is turned into a point on the flat map and tested against the real
  outline of each country, with the same enlarged tap circle for tiny countries as in 2D. "Choose from a list instead" is
  still there for keyboard and screen-reader players.
- **On a phone** the globe is at least 45% of the screen's height (the hub, and a trip held upright); on its side the
  globe fills the left half. On a very short phone (under 760 px tall) the answers keep their room and the globe is a bit
  smaller, so the answers are never pushed out of reach. Every button is at least 48 px. With "less motion" the globe
  turns without gliding and the plane is simply there.
- **If 3D cannot run** (no WebGL 2, a 3D file failing to load, the scene failing to start, or the graphics being lost) the
  2D screen opens with no error screen; a trip carries on from the same question. A slow connection shows "Getting the
  globe ready" instead of a blank page. That only lasts for the visit; it does not change the saved choice.
- The world picture on the globe is drawn in code from `assets/world.svg` on a canvas, 2048 px wide (1024 px on a weak
  device). That is larger than the 512 px the other 3D versions keep to, on purpose (see `docs/SPEC.md`). three.js is loaded
  with `import()` only when a 3D screen opens, so the 2D game and the home page never download it.

Files: `logic/globe.js` (where a place on the flat map is on the sphere, which way the camera faces it, how far back it
stands to see a continent, the plane's route; unit-tested in `tests/flag-capital-quest/globe.test.js`), and `three/`
(`GlobeMap` is the globe with the same interface as the 2D `WorldMap`, `globeSkin` draws its picture and finds the country
at a point, `globeParts` builds the plane and pins, `Trip3DScene` and `World3DScene` are the two screens).

## How it works

- `logic/` holds the rules and has no DOM, storage, timers or `Math.random` (an injected `rng` is used): projection, pan and
  zoom maths (`mapView.js`), tap resolution that enlarges the hit area of tiny countries, question building with
  distractors from the same continent, progress ("explored") and scoring. All of it is covered in `tests/flag-capital-quest/`.
- `data/countries.json` lists every country with its continent, capital(s), flag file and a fun fact. It is checked on load;
  a malformed file names the file and field in the console and shows the friendly error screen.
- `assets/world.svg` is the map and `assets/flags/*.svg` are the flags. Both are generated, see below.
- `ui/` draws the pan/zoom map (`WorldMap.js`), flags and passport stamps. `scenes/` are the world hub, trip, results and
  passport screens; they only talk to each other through the `routes` object built in `main.js`.
- Progress is stored on this device only (`save.extra.progress` of the shared save). Nothing leaves the device.

## Data and licences

- Country outlines: Natural Earth 1:10m, via the `world-atlas` package (public domain).
- Flags: the 4:3 SVGs of `flag-icons` (MIT). Its licence is kept next to the flags in `assets/flags/LICENSE.txt`.
- `scripts/make-flag-quest-assets.mjs` builds `assets/world.svg` and copies the flags (one-off; not needed to run the game):
  `node scripts/make-flag-quest-assets.mjs <flag-icons dir> <world-atlas dir>`.

### Choices about places

- Capitals: a country with more than one capital lists all of them and any is accepted. **Israel** has none listed because
  the status of Jerusalem is disputed, so it is never asked as a capital question.
- Kosovo, Taiwan, Palestine and Western Sahara are drawn as neutral grey shapes and are not asked about.
- The overseas parts of France and the Netherlands are cut off the map so the countries are drawn where children expect them.
- Tiny countries have an enlarged invisible tap circle (at least 24 px radius) so they can be hit on a phone. Where a tap
  lands on a bigger neighbour's own shape the circle counts only half, so tapping the edge of Ukraine does not answer
  "Slovakia". On a continent view, countries that cannot be seen there (for example Kiribati, Tonga and Samoa in
  Oceania) are never asked as map questions.

## Needs a human check

The countries, capitals and fun facts were written for this game and should be read through by an adult before they are
relied on in a classroom. Flag artwork and borders come from the sources above and have not been compared one by one.
