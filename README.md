# Kids Learning Games

Sixteen browser games for children aged 8–10: maths, languages, logic, science and memory.
Plain HTML, CSS and JavaScript (ES modules). No frameworks, no bundler, no external CDNs,
no ads, no cookies, no analytics. All progress stays in the browser's `localStorage`.

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
src/hub/                   Home page: games registry, player name, profile, reset
src/app/createApp.js       Wires services for a game page (composition helper)
src/games/<slug>/          One folder per game (index.html, main.js, scenes/, logic/, data/, style.css)
tests/                     Node tests (engine, hub, each game's logic/)
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

## Status

| # | Game | Status |
| --- | --- | --- |
| – | Engine, hub, player profile, parent area | Done |
| 1 | Number Ninja | In progress |
| 2–16 | Remaining games | Not started (shown as "Coming soon" on the hub) |

## Notes for reviewers

- **Name validation** deliberately differs from the spec's regex: it also allows Unicode combining
  marks (`\p{M}`), because Devanagari vowel signs such as the "ा" in "सागर" are marks, not letters,
  and would otherwise be rejected.
- Content that needs human verification before release (capitals, planet gravity values, food-chain
  facts) will be flagged in each game's own README when those games are built.
