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
