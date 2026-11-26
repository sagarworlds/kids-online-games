# Browser tests

Real-browser checks for the games. They open every game the way a child does (home page, menu, a round, a first move), in 2D and in
3D, on a desktop and on a phone, and they make 3D fail on purpose to prove the game carries on flat.

They live in their own package so the site itself keeps **no dependencies** (`npm test` in the repository root still needs nothing
installed). The only dependencies here are [Playwright](https://playwright.dev) with Chromium and [axe-core](https://github.com/dequelabs/axe-core)
(the accessibility rules engine, pinned to one version so a new release cannot change the verdicts).

## Run them

```bash
cd e2e
npm ci
npx playwright install chromium   # once; add --with-deps on a bare Linux machine
npm test                          # builds the site, then runs every check (about 9 minutes)
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
| `specs/continue.e2e.mjs` | The home page's "Continue where you left off" card, following what a child does: no card for a visitor who has not played or for a game that was only opened; the card names the game played last, opens it and follows the next game played (also one played in another tab); it stays when a subject is chosen and keeps the keyboard focus when the page refreshes itself; it goes when the grown-ups reset progress; it is not made from a record the page does not know or that is damaged; and it passes the accessibility checks on a phone and a desktop. |
| `specs/lights-out.e2e.mjs` | Lights Out played to the moment a puzzle is solved (a pattern for deeper checks of one game, in `specs/<slug>.e2e.mjs`): in 2D the freed fireflies fly out over the solved card and are gone afterwards, nothing flies for a child who wants less motion, and in 3D the flat jars under the picture stay quiet. |
| `specs/match-marathi.e2e.mjs` | Hindi–English Match in Marathi, through the real screens: a new child gets Hindi and choosing Marathi changes the menu's sentence and example; the cards show the Marathi word, a "मरा" tag and `lang="mr"`, and are named "Marathi card: …"; a Marathi card and its English card match; a whole round is played from the word file and ends on three stars, listed in Marathi, with the stars saved under `mr-easy` and none under Hindi's `easy`; the language is remembered across a reload and Hindi's stars (under the plain ids, as older saves have them) are kept apart from Marathi's; and the menu, the board and the results pass the accessibility checks on a phone. |
| `specs/match-grid.e2e.mjs` | Hindi–English Match's card grid at every level on a desktop, a phone, a small phone and the smallest phone: every card is on the screen (the page cannot be slid sideways to reach one), at least 48px each way, and none sits on another. A card has a smallest width, so a screen that cannot hold the level's columns must give the grid fewer columns and more rows. Only positions and sizes are measured, so the machine's font does not matter. |
| `specs/word-packs.e2e.mjs` | Word Builder Bubbles, every pack in its word file at every level (so a pack added later is checked too): choose the pack and the level on the menu, start, and spell the first word from its clue with the keyboard. That shows the pack's chip is on the menu, the round is drawn from that pack and that level, and the picture, clue and bubbles work; it also checks that no two words share a clue. |
| `specs/food-chain.e2e.mjs` | Food Chain Builder, for every habitat in its data (so a habitat added later is checked too): each one is solved through the real screens (tap the food then its eater for every required arrow, Check, and on a Hard habitat the What if answers from the data) and ends on three saved stars; on a small phone no card sticks out of the board or sits on another; on a desktop, a phone and a small phone no word on a card is wider than the card, which would break it in the middle ("Mudskippe" / "r"); a name made too long for its card is shrunk to fit, then fitted again when the board is resized or turns to the phone layout; and the Hard board of each place passes the accessibility checks on a phone. |
| `specs/planet-quiz.e2e.mjs` | Planet Hop's quiz at every level, answering from the game's own question file: a full round of ten ends on three stars, every question drawn belongs to the chosen level (there are enough of each, so a Hard round is never filled with easier ones), each right answer is acknowledged with its explanation, and two Hard rounds are not the same ten questions. |
| `specs/slow-device.e2e.mjs` | A 3D view that runs too slowly gives way to the flat game in place, for each 3D game (every animation frame is made expensive on purpose), and the device remembers, so the next visit opens flat. Lights Out also checks the order: a lower resolution twice, then the flat game. |
| `specs/save-all.e2e.mjs` | A grown-up can save every game for offline play from the settings: through the grown-ups' check, the button saves everything (progress, then "All games are saved", the same when reopened), and then every game, 3D ones drawing, plays with the network cut. A game with a file that cannot be downloaded is not claimed saved, the others are, and the grown-up is told. |
| `specs/install.e2e.mjs` | The site can be installed as an app: Chromium itself finds nothing in the way of installing the home page or any game page (manifest, icons, service worker and page agree), the manifest parses without errors, and the manifest and every icon load with the right types. |
| `specs/phones.e2e.mjs` | The shared top bar stays compact on small and landscape phones (360x640, 667x375, 320x568): one row where it can be, at most two lines of stats, never wider than the screen, with the game's name still there for screen readers. |
| `specs/focus.e2e.mjs` | Where the keyboard focus goes when one screen replaces another, on every game (in a browser with no WebGL, so each game opens its flat screens at once). The first screen of a page leaves the focus alone. A round with a visible heading takes the focus onto it (no Tab stop, no ring), a screen that put the focus on a control itself keeps it, and a screen with no heading leaves it on the page. The way back from a round does the same where a game has a button for it. With a keyboard, Enter on the start button lands on the new heading and the next Tab goes on from there. The last block checks the check: each mistake it is there for is shown to it and must be found. |
| `specs/a11y.e2e.mjs` | Accessibility of what a child reaches first: the home page, every game's first screen and a round in 2D and 3D on a phone, every first screen on a desktop, and the grown-ups' dialogs. Each screen must pass axe (WCAG 2.0 to 2.2 A and AA plus best practices), show the keyboard focus on every control it reaches by Tab, never leave the focused control hidden under a picture or a bar, and have no control under 48px to tap. The dialogs also take the focus and give it back. The last block shows the checks pages with the mistake each is there for. |
| `specs/backup.e2e.mjs` | Backing up and restoring progress in the grown-ups' settings, through the real buttons, file chooser and confirmation: "Save a copy" downloads a file named for the day with the progress, name and last played game, and not the device record; a copy saved in one browser and restored in a fresh one brings back the name, the stars, the home page total and the game played last, after the grown-up has been told what it holds; it brings back what a reset took away; saying no changes nothing; a text file, JSON from another app, a copy with seven stars, one with a key it should not hold and one from a newer version are each refused in plain words with nothing changed; and the section passes the accessibility checks with a message showing. |
| `specs/suggested-level.e2e.mjs` | The level a menu opens on, for every game with an Easy / Medium / Hard picker (what each game's save looks like once Easy is done is in `EASY_DONE`, `support/games.mjs`): a child who has played nothing gets Easy and no "Suggested"; once Easy is done well the menu opens on Medium with Medium, only, suggested. In Shop Keeper: one star stays on Easy, two moves on, Medium done well offers Hard, a child who skipped ahead is offered Hard, a grown-up's lock decides and suggests nothing, and the picker with the tag passes the accessibility checks. |
| `specs/progress.e2e.mjs` | The progress summary in the grown-ups' settings on the home page, from saves written the way the games write them: a child who has played nothing gets one plain sentence and no empty list; with four games played the sentence has the right stars and badges, the folded list opens and has the right row for a played, a badge-only and an unplayed game, the game played last is marked, each subject adds up, and the section's text is really seen (not squeezed away); it passes the accessibility checks with the list open on a phone; a reset with the settings open brings it up to date. |
| `specs/matra-mixer.e2e.mjs` | The Matra Mixer chart, with a keyboard: its 400 or so cells are one Tab stop, the arrow keys, Home, End, Ctrl+Home, Ctrl+End and the page keys move through it (stopping at the edges), Enter picks a cell, Tab leaves and Shift+Tab comes back to the same cell, and a click moves the Tab stop. |
| `specs/harness.e2e.mjs` | The harness itself: it notices console errors, uncaught errors, 404s and Content-Security-Policy violations, tells a blank canvas from a picture, and serves the production headers. |
| `specs/matra-language.e2e.mjs` | The language of the Hindi and Marathi in Matra Mixer, which shows Devanagari everywhere. In both languages, every screen (the menu with its language panel, the chart and the matra station, and each activity at its first round, after a try and on its results) has all of its Devanagari marked with `lang`, and, outside the language panel, with the language the game is set to. The accessibility checks look for the same thing on every screen they visit. |

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

## How the accessibility checks work

`support/a11y.mjs` looks at a screen four ways, and `problemsOnScreen` runs all four:

- **axe** runs in a window made tall enough to show the whole screen. axe judges only what shows inside the page's frame, so a mistake
  below the fold (the Flag Quest continent buttons were one) passes in a normal window. The window is put back afterwards.
- **A keyboard walk** presses Tab from the top of the page, at the window's real size, because the browser scrolls a focused control into
  view and a bar fixed to the edge can still cover it. Each stop must look different with the focus than without it, and must be the top
  thing at its centre. Controls laid over a 3D picture let taps through on purpose (`pointer-events: none`), so they are tested as if
  they took the pointer: painted above the picture they pass, painted under it they fail.
- **Tap sizes**: every control a finger can hit is at least 48px each way. A checkbox or radio button counts as its label.
- **Language**: Hindi or Marathi text (Devanagari) must say so with `lang="hi"` or `lang="mr"`, on itself or something around it
  (`unmarkedHindi`). A screen reader reads it with its English voice otherwise (WCAG 3.1.2). Parts that are hidden are not counted.

A failure lists every problem on every screen of that game at once. To see one by hand, open the page, press Tab, and look.

```bash
npm test -- a11y                          # only the accessibility checks
E2E_GAMES=plant-grower npm test -- a11y   # one game
```

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
  back: press(/Back to the menu/),       // optional: from a round to the first screen with the game's own button (most games end a round on a results screen)
},
```

Write selectors that exist in both views, and tap by position (`tap()` in `support/ui.mjs`) wherever a flat control sits under a 3D
picture: that proves the picture itself picks the right object.
