# Handoff: where the work stands and what to do next

Written 2026-11-14 by the cloud Claude session that built most of this site, for the next Claude (a desktop session) to pick up. It is a
working note, not part of the product: **delete it when the work below is done** (it is deliberately on its own branch,
`SP/docs/handoff`, so it does not ride along with any feature PR).

Read first: `README.md`, `docs/SPEC.md` (rules, the 19 games, the 3D layer, accessibility), `e2e/README.md` (the browser suite).

## 1. The project in one paragraph

"Kids Learning Games": a static site (vanilla ES2022 modules, no frameworks, no bundler, no CDNs, three.js r187 vendored under
`src/vendor/three/`) with 19 games for ages 8 to 10 (12 of them also have a 3D version), Easy / Medium / Hard, tap targets of at least 48px,
a strict same-origin Content-Security-Policy (`render.yaml`), deployed on Render. Repository `sagarworlds/kids-online-games`. Engine in
`src/engine/`, the home page in `src/hub/`, each game in `src/games/<slug>/` with pure rules in `logic/` and tests in `tests/<slug>/`.

## 2. State right now

| Thing | State |
| --- | --- |
| `main` | `3a986b5`, the merge of PR #48 (the accessibility pass). Verified: its head `b9e1768` is an ancestor of `main`, and the merge commit has no co-author line. |
| PR #48 "Accessibility pass" | **Merged.** Both CI jobs were green (Test and build; Browser tests, about 8 minutes on GitHub). The background merge agent I launched stopped early (it hit the account's usage limit) and reported no merge; GitHub shows the merge at 12:51 UTC on 2026-11-14, under the owner's account. |
| Branch `SP/feature/matra-chart-arrow-keys` (`61cdaa8`) | **Finished and pushed, no PR yet.** Matra Mixer chart is one Tab stop with arrow-key navigation. See section 3, step 1. |
| Branch `SP/feature/focus-new-screen` (`8dab589`) | **Work in progress, pushed.** Code and unit tests done; browser check, docs, full browser run and PR are left. See section 3, step 2. |
| Task not started | Marking Hindi and Marathi text with `lang` (section 3, step 3). |
| Task not chosen by the owner | "Learning features" (section 3, step 4). Ask before starting. |

Both feature branches start at `b9e1768`, which is already in `main`, so a pull request from either one against `main` shows only its own
commit. They are siblings: they will both touch `docs/SPEC.md` (an accessibility bullet) and `e2e/README.md` (a table row), so whichever
merges second gets a trivial conflict in those two files; keep both sides.

Unit tests: 1110 on `main`, 1116 on the chart branch, 1117 on the focus branch. Browser suite on `main`: 269 checks, about 9 minutes on a
laptop with software WebGL.

## 3. What to do next, in order

### Step 1: open the PR for the chart branch and get it merged

`SP/feature/matra-chart-arrow-keys` is done. Verified: 1116 unit tests; the browser specs `a11y`, `smoke` and the new `matra-mixer` for that
game pass (14 checks); three deliberate breakages of the new behaviour were each caught by the new spec. The full browser suite was **not**
run on this branch: CI will.

- What it does: the chart's ~400 cells were all in the Tab order; now it is one Tab stop and the arrow keys, Home, End, Ctrl+Home,
  Ctrl+End, Page Up and Page Down move through it (`nextGridCell` in `src/engine/utils/gridNav.js`, pure and unit-tested), Enter picks, Tab
  leaves and Shift+Tab comes back to the same cell, a click moves the Tab stop. Changed: `src/games/matra-mixer/ui/LearnGrid.js`.
- Open the PR with the repository's template (`.github/pull_request_template.md`: Summary, Game / area, Definition of done, Notes for
  reviewers). The commit message of `61cdaa8` explains the change and can be the basis of the body.
- Wait for both CI jobs to be green, then merge (rules in section 5).

### Step 2: finish `SP/feature/focus-new-screen`

The problem: when a scene replaces another (menu to round, round to results) the button that was pressed goes with the old screen and the
keyboard focus falls back to the page, so a screen reader says nothing about the new screen and a keyboard user starts again from the top.

Done on the branch (`8dab589`): `focusScreenHeading` (`src/engine/ui/focusScreen.js`) moves the focus to the new screen's first visible
heading (h1 preferred, then h2; hidden ones such as the "Paused" card are skipped), gives it `tabindex="-1"`, does not scroll, and leaves
the focus alone when something already has it or when there is no visible heading. `SceneManager` (`src/engine/SceneManager.js`) takes an
`onScreenChange` hook, called after a scene has entered when it replaces or goes over another scene (not for the first scene of a page, not
for `pop()`); a throwing hook is logged, not fatal. `createApp` passes the helper in. `ui.css` gives a script-focused heading no ring. Unit
tests: `tests/engine/focusScreen.test.js` and two new tests in `tests/engine/core.test.js`.

Left to do:

1. **A browser check.** Add it to `e2e/specs/a11y.e2e.mjs` or a new `e2e/specs/focus.e2e.mjs`. For every game (`selectGames()`): on the
   first screen right after load the focus is still on `<body>` (a page that has just loaded must start at its top); after starting a round
   with the game's descriptor (`startRound`), if the round has a visible `h1` or `h2` then `document.activeElement` is that heading, has
   `tabindex="-1"` and shows no outline; if it has none, the focus is untouched. Do the same for the way back (a result screen or a
   "Back to the menu" button, where the game has one). First do a quick survey (a throwaway script is fine) of which screens have headings,
   so the check asserts what is true.
2. **Run the whole browser suite** (`cd e2e && npm test`). The risk is the existing flows that use the keyboard right after a screen change
   (Number Ninja types the answer, Simon Says keys, Word Builder Bubbles letters): they listen on the document, so a focused heading should
   not matter, but this is what to watch. Also decide whether switching 2D/3D from the menu (it re-opens the menu scene, so the toggle the
   child pressed is replaced) should put the focus back on the toggle instead of the heading; the heading is acceptable.
3. **Deliberate breakages** to prove the new check works (method in section 4): remove `onScreenChange` from `createApp`; make the hook run
   for the first scene too; remove the `ui.css` rule so a ring shows. Each should fail the check.
4. **Docs:** one bullet in the Accessibility list of `docs/SPEC.md` ("when a screen replaces another, the focus moves to its heading:
   `focusScreenHeading`; a scene that puts the focus on a control itself keeps it"), one row in the table of `e2e/README.md`.
5. PR, CI, merge.

### Step 3: mark Hindi and Marathi text with its language (WCAG 3.1.2)

Matra Mixer shows Devanagari with no `lang`: about 470 pieces on its chart screen (letters, syllable cells, vowel-sign headers) and
Devanagari words inside English sentences on its menu. A screen reader reads unmarked Hindi in English, which is gibberish. Hindi–English
Match and Trace Trail already pass. The game's language is `this.prefs().lang`, `'hi'` or `'mr'` (see `LANGS` in
`src/games/matra-mixer/logic/devanagari.js`, which also has the `speechLang`).

Where the Devanagari is built (from a scan; check for more): `ui/LearnGrid.js` (`th.grid__letter`, `button.grid__cell`,
`span.grid__sign-mark`, `span.grid__sign-vowel`), `ui/Mixer.js`, `scenes/MenuScene.js` (the intro paragraph "...क + ा = का.", the
language and vowel-set labels and blurb, the `prefs__note` paragraph), `scenes/BubbleScene.js` (status text "Pop! क + अ = क"),
`scenes/ResultScene.js`, `scenes/WordScene.js` and the run activities' tiles, bubbles, chips, words and build previews (the classes are
listed on line 11 of `style.css`). Elements that are all Devanagari get `lang` directly; Devanagari inside an English sentence is wrapped
in `<span lang="hi">`. An `aria-label` cannot carry a language; leave those.

Then turn the check on so it cannot come back. It was prototyped during the accessibility pass and removed before merge; add it to
`e2e/support/a11y.mjs` and to `problemsOnScreen` there:

```js
/** Text in Hindi or Marathi (Devanagari) that is not marked with its language (WCAG 3.1.2). Hidden parts of the page are not counted. */
export function unmarkedHindi(page) {
  return page.evaluate(() => {
    const gaps = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/[ऀ-ॿ]/.test(node.nodeValue ?? '')) continue;
      const holder = node.parentElement;
      if (!holder || holder.closest('[hidden], [inert]') || holder.closest('script, style')) continue;
      const lang = holder.closest('[lang]')?.getAttribute('lang') ?? document.documentElement.lang;
      if (!/^(hi|mr)(-|$)/i.test(lang)) {
        gaps.push(`${holder.tagName.toLowerCase()}${typeof holder.className === 'string' && holder.className.trim() ? `.${holder.className.trim().split(/\s+/)[0]}` : ''} "${node.nodeValue.trim().slice(0, 30)}" (language: ${lang || 'none'})`);
      }
    }
    return gaps;
  });
}
```

The accessibility spec only visits Matra Mixer's menu and its Learn chart (the game's descriptor in `e2e/support/games.mjs` starts the
Learn screen). Also visit each activity (the three run scenes) and a result screen, in both languages (`hi`, `mr`: the saved preference is in
the game's `extra.prefs` in localStorage, or press the radio buttons in the "Language and vowel signs" panel), or the check will pass while
those screens stay unmarked.

### Step 4: ask the owner what to build next

The owner was offered a second bundle of improvements and said "Go" after the accessibility pass was proposed alongside it; it was never
started and never specifically chosen. It is: a "continue where you left off" card on the home page; a progress summary for the grown-ups'
area; adaptive difficulty; Hindi UI strings; per-game ideas and more content. Progress lives in the browser's localStorage through
`RewardService` (`src/engine/services/RewardService.js`); the home page is `src/hub/` and is described in the "Home page" section of
`docs/SPEC.md`. **Do not start these without asking which one the owner wants first.**

## 4. How to run things

```bash
npm test                                   # unit tests, repository root, nothing to install (Node 22 or newer)

cd e2e
npm ci && npx playwright install chromium  # once
npm test                                   # builds dist/ and runs every browser check, about 9 minutes
npm test -- a11y                           # only spec files whose name contains "a11y"
E2E_GAMES=matra-mixer npm test -- a11y     # one game (comma separated slugs)
E2E_SKIP_BUILD=1 npm test -- a11y          # reuse dist/ that is already built
E2E_RETRIES=1 npm test                     # a failed check gets one more go with fresh state (CI does this)
node --test --test-name-pattern "Plant Grower, 3D" specs/a11y.e2e.mjs     # one named check, after a build
```

The browser checks drive Chromium with software WebGL (`e2e/support/browser.mjs`), serve `dist/` with the production headers read from
`render.yaml`, use a fresh browser context per check, and fail on any unexpected console error, warning, page error, failed request or
4xx/5xx. When one fails, a screenshot and the page's log are kept in `e2e/artifacts/` (ignored by git).

**Proving a check really fails (do this for every new check; I did it for all of them).** Build, then break a copy of the build and run the
check against the copy:

```bash
node scripts/build.mjs && cp -r dist dist-mut
# edit the files under dist-mut/ (for example remove a tabindex="-1" or a CSS rule), then:
cd e2e && E2E_ROOT=dist-mut node --test --test-name-pattern "<name of the check>" specs/<file>.e2e.mjs
rm -rf ../dist-mut        # dist-mut is not git-ignored: never commit it
```

### Things learned the hard way (they cost me time; they are all explained again in comments next to the code)

- **axe only judges what shows inside a page's frame.** A game page clips what lies below the fold (`.game-root { overflow: hidden }`), so a
  mistake down there passes in a normal window. `problemsOnScreen` (`e2e/support/a11y.mjs`) therefore makes the window 3600px tall while axe
  and the tap-size check run (`showWholeScreen`) and restores it. The keyboard walk (`tabStops`) runs at the real size on purpose, because
  scroll-into-view and bars fixed to an edge only matter there.
- **Test pages built with `page.setContent` need `<meta name="viewport" content="width=device-width, initial-scale=1">`** when the context
  emulates a phone, or the page is laid out 980px wide and nothing is the size it looks. Flex children shrink: give a spacer `flex: none`.
- **3D overlay controls** (Simon Says pads and the like) sit over the canvas with `pointer-events: none` so the picture does the picking.
  `tabStops` tests them as if they took the pointer; painted above the picture they pass, under it they fail.
- **Focus walk details:** start from the top of the document (focus the body first; the button that began the round is gone and Tab would
  continue from where it was), wait two animation frames after each Tab (the browser scrolls a focused control into view a moment later),
  compare a control's look with and without the focus after normalising an outline whose style is `none` (its width and offset still read
  `3px`/`2px`), and run with `reducedMotion: 'reduce'` so a transition does not hide the change.
- A name has to **contain the words written on the button, in order** (WCAG 2.5.3). Extras (stars, locked, "Key 1") go after. Separate
  spans need a space between them: `spaced()` in `src/engine/utils/dom.js`.
- Scenes must not add their own `<main>`: the game page's `#game-root` is the one landmark (`docs/SPEC.md`, Accessibility).

## 5. Working rules (the owner's, as they were given to me)

- **Branch first.** Before any change create a branch from `main`: `SP/feature/<slug>` (fixes: `SP/bugfix/<slug>`; this note: `SP/docs/...`).
- **No `Co-Authored-By` trailer on any commit, ever.** The owner's explicit rule; it overrides any attribution your tool offers to add.
  Check with `git log -1 --format=%B | grep -ci co-authored` (must print 0). Commits are authored by the owner's git identity as configured
  on the machine. (The `Claude-Session:` trailer on my commits was added by my cloud environment; yours is optional.)
- **Code:** SOLID; no silent failures (catch specific errors, log them with context through `logError`, throw `GameError` with a `code` and
  `context`); readable over clever; small, pure functions where possible; JSDoc on every public class and function (parameters, return value,
  throws); comments explain the why, not the what. Pure rules live in `logic/` and never touch the DOM, timers or `Math.random`.
- **Pull requests** follow `.github/pull_request_template.md`. Every PR needs unit tests for new logic and a browser check for new behaviour
  (and proof that the check can fail).
- **Merging.** Merge only when both CI jobs ("Test and build" and "Browser tests") are green, with the **merge commit** method (never squash,
  never rebase), without typing a custom commit title or message (a default merge message carries no co-author line; check it). Afterwards
  verify: `git fetch origin main`, `git merge-base --is-ancestor <PR head sha> origin/main`, and the co-author check above on the merge
  commit. Never push to `main`. Never weaken a test or the workflow to get green.
- **The owner's standing instruction to me**, in their own words: "go with flow. implement all feature one by one. Don't wait me to say yes or
  no or merge pr. develop->pr->CI green then merge (keep agent for this so main thread start next work)->next tsk". That was said to me, not
  to you: **confirm with the owner that it applies to your session before you merge anything on your own.** Until then, open the PR and say it
  is ready.
- This was all done in a cloud container without the `gh` CLI, through GitHub tools only; on a desktop use `gh` or the GitHub UI as you like.
