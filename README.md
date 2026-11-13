# Kids Learning Games

Sixteen browser games for children aged 8–10: maths, languages, logic, science and memory.
Plain HTML, CSS and JavaScript (ES modules). No frameworks, no bundler, no external CDNs,
no ads, no cookies, no analytics. The only third-party code is three.js, copied into `src/vendor/three/`
for the 3D versions of some games. All progress stays in the browser's `localStorage`.

The full design is in [`docs/SPEC.md`](docs/SPEC.md).

## Is this "pure JavaScript" or Node?

The games are **pure browser JavaScript**; nothing runs on a server. Node is used only as
developer tooling: unit tests (`node --test`), a local preview server, and a small script that
copies the shippable files into `dist/` for deployment.

## Run it locally

```bash
npm start          # http://localhost:3000  (zero-dependency static server)
```

```bash
npm test           # unit tests for engine, hub and every game's logic/
```

### Browser tests

`npm test` needs nothing installed. A second suite drives a real browser (Playwright, in its own package so the
site keeps no dependencies): every game in 2D and 3D, on a desktop and a phone, with 3D made to fail on purpose,
and offline from the service worker. See [`e2e/README.md`](e2e/README.md).

```bash
cd e2e && npm ci && npx playwright install chromium && npm test
```

## Offline

After the first visit the whole site works without a network. `npm run build` generates `dist/sw.js`, a service
worker that precaches every shipped file under a version derived from a hash of the site, so each deploy gets a fresh
cache and old ones are deleted. Opened from `npm start` the worker stays inert (version `dev`), so local development
never sees stale files. To try it: `npm run build`, `npm run start:dist`, open the site, then switch the network off.

## Deploy to Render (static site)

`render.yaml` is a Render Blueprint, so no manual configuration is needed:

1. Push this repo to GitHub.
2. In Render: **New + → Blueprint**, pick the repo, and apply. Render runs
   `node scripts/build.mjs` (copies `index.html` and `src/` into `dist/`) and publishes `dist/`.
3. Every push to the connected branch redeploys automatically.

Prefer clicking through the dashboard? **New + → Static Site**, build command
`node scripts/build.mjs`, publish directory `dist`.

The Blueprint also sets a strict `Content-Security-Policy` (everything is same-origin) and a
few other security headers. If you add an asset type from another origin, update that header.

## Project layout

```
index.html                 Home page (hub)
src/engine/                Game loop, scenes, services (input, audio, storage, rewards, speech), UI kit
src/engine/three/           Shared 3D layer: stage, orbit camera, labels, 3D-or-2D choice (see docs/SPEC.md)
src/vendor/three/           three.js r187, vendored unchanged (MIT)
src/hub/                   Home page: games registry, player name, profile, reset
src/app/createApp.js       Wires services for a game page (composition helper)
src/games/<slug>/          One folder per game (index.html, main.js, scenes/, logic/, data/, style.css)
tests/                     Node tests (engine, hub, each game's logic/)
docs/                      SPEC.md (the design) and STATE_MACHINES.md (every state machine, with diagrams)
scripts/                   build.mjs (copy to dist/), serve.mjs (local server)
```

## Git workflow

- `main` is the stable branch and the one Render deploys.
- Every new piece of work starts from an up-to-date `main` on its own branch:
  `SP/feature/<game-slug>` for a game (for example `SP/feature/number-ninja`),
  `SP/bugfix/<short-name>` for a fix.
- Open a pull request into `main` for each branch. The PR template carries the Definition of Done
  from `docs/SPEC.md`. Merge only when its checklist and `npm test` pass.
- Small commits with clear messages. No co-author trailers.

## Adding a game

1. Create `src/games/<slug>/` following the structure and rules in `docs/SPEC.md`.
2. In `src/hub/gamesRegistry.js`, set that game's `available` to `true`.
3. Add tests under `tests/<slug>/` for its `logic/` files, then run `npm test`.

## 3D versions

Some games have a 3D version drawn with three.js; every game keeps its 2D version, which is also the fallback when a
device has no WebGL 2 or 3D fails. The library is loaded only when a 3D scene opens. A 3D view that runs too slowly (a weak
phone) first lowers its resolution and then gives way to the flat game, and the device remembers, so games open flat there
from then on; a very weak device starts flat, and the child can always choose 3D. The rules for adding one are in
the "3D versions (Three.js)" section of [`docs/SPEC.md`](docs/SPEC.md).

Done so far: **Planet Hop** (Line them up and Weigh-in; see [its README](src/games/planet-hop/README.md#3d-view)) and
**Robot Path** (the whole puzzle, with a robot's-eye camera; see [its README](src/games/robot-path/README.md#3d-view)) and
**Flag & Capital Quest** (a globe to spin, with a plane that flies to each country; see [its README](src/games/flag-capital-quest/README.md#3d-view)) and
**Times-Table Racing** (the track seen from behind your car, with a see-through ghost; see [its README](src/games/times-table-racing/README.md#3d-view)) and
**Table Tower** (a tower that grows with each table cleared, and sums built from slabs; see [its README](src/games/table-tower/README.md#3d-view)) and
**Plant Grower** (a plant in a pot you can turn, with a sun that crosses the sky and rain you can see; see [its README](src/games/plant-grower/README.md#3d-view)) and
**Pizza Fractions** (a round pizza whose topped slices lift, with toppings that sit on them; see [its README](src/games/pizza-fractions/README.md#3d-view)) and
**Lights Out** (jars with fireflies on a table at night, which fly away when you win; see [its README](src/games/lights-out/README.md#3d-view)) and
**Pattern Detective** (the case file as solids on pedestals that turn, with a tap to hear each name; see [its README](src/games/pattern-detective/README.md#3d-view)) and
**Number Ninja** (falling stars that spin and split in two when you answer; see [its README](src/games/number-ninja/README.md#3d-view)) and
**Simon Says** (pads on a console that press down and glow, in the game and in Music Maker; see [its README](src/games/simon-says/README.md#3d-view)) and
**Sentence Train** (a toy train yard where the carriages roll away when the sentence is right; see [its README](src/games/sentence-train/README.md#3d-view)).

That is **all twelve** of the 3D versions in the plan. Where one differs from the plan's table (no cube on Lights Out's Hard level, no cylinder in Pattern Detective, a fixed camera in
Number Ninja and Sentence Train), its README says why.

## State machines

Screens and rules with phases (ready → playing → finishing → done) are declared as data in `*.machine.js` files and driven
with `src/engine/utils/stateMachine.js`, not with loose booleans. [`docs/STATE_MACHINES.md`](docs/STATE_MACHINES.md) lists
every machine (and the ones still to migrate) with diagrams generated from the code. After changing a machine, run
`npm run machines` to refresh them; `npm test` fails if they are out of date.

## Status

Which games are playable is defined by the `available` flag of each entry in
[`src/hub/gamesRegistry.js`](src/hub/gamesRegistry.js); the rest show as "Coming soon" on the home page.
Every game folder has its own README (how to play, learning goal, rules, file map).

## Notes for reviewers

- **Name validation** deliberately differs from the spec's regex: it also allows Unicode combining
  marks (`\p{M}`), because Devanagari vowel signs such as the "ा" in "सागर" are marks, not letters,
  and would otherwise be rejected.
- Content that needs human verification before release (capitals, planet gravity values, food-chain
  facts) will be flagged in each game's own README when those games are built.
