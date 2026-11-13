# Browser tests

Real-browser checks for the games. They open every game the way a child does (home page, menu, a round, a first move), in 2D and in
3D, on a desktop and on a phone, and they make 3D fail on purpose to prove the game carries on flat.

They live in their own package so the site itself keeps **no dependencies** (`npm test` in the repository root still needs nothing
installed). The only dependency here is [Playwright](https://playwright.dev) with Chromium.

## Run them

```bash
cd e2e
npm ci
npx playwright install chromium   # once; add --with-deps on a bare Linux machine
npm test                          # builds the site, then runs every check (about 4 minutes)
```

Smaller runs:

```bash
npm test -- smoke                      # only spec files whose name contains "smoke"
E2E_GAMES=lights-out npm test          # only one game (comma separated slugs)
E2E_SKIP_BUILD=1 npm test              # reuse the dist/ folder that is already built
E2E_RETRIES=1 npm test                 # run a failed check once more with fresh state (CI does this)
E2E_CHROMIUM=/path/to/chrome npm test  # a browser Playwright does not know about
```

## What they check

| File | What it proves |
| --- | --- |
| `specs/smoke.e2e.mjs` | Every game opens, starts a round and takes a first move. 3D games are checked in 3D (the canvas shows a picture, three.js is downloaded only when a 3D screen needs it), in 2D (the choice is remembered, three.js is never downloaded) and on a phone (nothing spills off the screen). |
| `specs/fallbacks.e2e.mjs` | Each 3D game, when 3D cannot run: a browser with no WebGL, graphics lost mid-play, graphics that cannot start, 3D files that do not download. The child keeps a working flat game with no error screen, and the reason is logged. |
| `specs/offline.e2e.mjs` | With the real service worker: the first visit stores only the home page and the shared engine (a small part of the site); a game opened online is saved whole (every file the build lists for it, flags and 3D files included), then the home page and every game (3D ones too) open and play with the network cut; a game that was never saved sends the child home with a note. |
| `specs/hub.e2e.mjs` | The home page has a card for every game, each opens its game, and Home comes back. The list of games these checks know about matches the registry. |
| `specs/lights-out.e2e.mjs` | Lights Out played to the moment a puzzle is solved (a pattern for deeper checks of one game, in `specs/<slug>.e2e.mjs`): in 2D the freed fireflies fly out over the solved card and are gone afterwards, nothing flies for a child who wants less motion, and in 3D the flat jars under the picture stay quiet. |
| `specs/slow-device.e2e.mjs` | A 3D view that runs too slowly gives way to the flat game in place, for each 3D game (every animation frame is made expensive on purpose), and the device remembers, so the next visit opens flat. Lights Out also checks the order: a lower resolution twice, then the flat game. |
| `specs/save-all.e2e.mjs` | A grown-up can save every game for offline play from the settings: through the grown-ups' check, the button saves everything (progress, then "All games are saved", the same when reopened), and then every game, 3D ones drawing, plays with the network cut. A game with a file that cannot be downloaded is not claimed saved, the others are, and the grown-up is told. |
| `specs/install.e2e.mjs` | The site can be installed as an app: Chromium itself finds nothing in the way of installing the home page or any game page (manifest, icons, service worker and page agree), the manifest parses without errors, and the manifest and every icon load with the right types. |
| `specs/phones.e2e.mjs` | The shared top bar stays compact on small and landscape phones (360x640, 667x375, 320x568): one row where it can be, at most two lines of stats, never wider than the screen, with the game's name still there for screen readers. |
| `specs/harness.e2e.mjs` | The harness itself: it notices console errors, uncaught errors, 404s and Content-Security-Policy violations, tells a blank canvas from a picture, and serves the production headers. |

Every check except the slow-device ones keeps the 3D views from judging their own speed (`quietFrameWatch` in `support/browser.mjs`): the software renderer on a test machine is slow on purpose, and a view that gave way to the flat game because of it would fail every 3D check.

Every check opens a **fresh browser context** (empty storage, like a first visit). A check fails if the page reports anything it
did not expect: a console error or warning, an uncaught error, a failed request, a 4xx or 5xx response. The checks that break 3D on
purpose list the messages they expect (`support/webgl.mjs`) and then check that the game logged them.

## How it works

- **The build is tested, not the source tree.** `npm test` runs `node ../scripts/build.mjs` and serves `dist/` (what Render
  publishes), so a file the build forgets fails here and not in front of a child.
- **Production headers.** The static server sends the headers from `render.yaml` (the strict Content-Security-Policy above all), read
  from that file so the checks cannot drift from what is deployed. A script, style or request the policy forbids fails the check.
- **Software WebGL.** A headless machine has no GPU, so Chromium draws WebGL with SwiftShader. It is slow but draws what a phone
  would, which is enough to tell "a picture" from "a blank canvas".
- **When a check fails**, a screenshot and the page's log are saved in `e2e/artifacts/` (CI uploads that folder).

## Add or change a game

`support/games.mjs` is the only place that knows about individual games: how to reach a round, what is on screen during one, and
what a first move looks like. The other files are written once for all games. A game with no entry (or an entry that says it has no
3D version while `src/games/<slug>/three/` exists) fails `specs/hub.e2e.mjs`, so a new game cannot ship without browser checks.

```js
{
  slug: 'lights-out', title: 'Lights Out',
  three: { menu: false, round: true },   // null for a game with no 3D version
  menu: '.menu',                         // on screen when the first screen is ready (2D and 3D)
  start: press(/Start/),                 // first screen -> a round in progress
  playing: '.jar',                       // on screen while a round is in progress (2D and 3D)
  async act(page, { touch }) { ... },    // a first move that must have a visible effect
},
```

Write selectors that exist in both views, and tap by position (`tap()` in `support/ui.mjs`) wherever a flat control sits under a 3D
picture: that proves the picture itself picks the right object.
