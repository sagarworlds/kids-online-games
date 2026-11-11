# three.js (vendored)

Version **0.187.0** (r187), copied unchanged from the npm package `three` (`build/three.module.js` and
`build/three.core.js`). MIT licence, see `LICENSE`.

Why it is copied here instead of loaded from a CDN or installed with npm: the site has no bundler, must work
offline, and its Content-Security-Policy only allows files from our own origin (see `docs/SPEC.md`).

- Games never import from this folder. They import `src/engine/three/three.js`, the single door to the library.
- Do not edit these files. To upgrade: `npm pack three`, copy the same two files and `LICENSE`, update the
  version above, run `npm test`, then open each 3D game once.
