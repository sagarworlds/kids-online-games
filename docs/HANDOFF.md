# Handoff: where the work stands and what to do next

Written 2026-11-26 by the cloud Claude session that built most of this site, for whoever picks it up next (another Claude, or a person). It is
a working note, not part of the product: **update it or delete it when the work below is done** (it is on its own branch, `SP/docs/handoff-2`,
so it does not ride along with a feature PR). It replaces the note of 2026-11-14, which is out of date.

Read first: `README.md`, `docs/SPEC.md` (rules, the 19 games, the 3D layer, accessibility), `e2e/README.md` (the browser suite).

## 1. The project in one paragraph

"Kids Learning Games": a static site (vanilla ES2022 modules, no frameworks, no bundler, no CDNs, three.js vendored under `src/vendor/three/`)
with 19 games for ages 8 to 10 (12 of them also have a 3D version), Easy / Medium / Hard, tap targets of at least 48px, a strict same-origin
Content-Security-Policy (`render.yaml`), deployed on Render. Repository `sagarworlds/kids-online-games`. The engine is in `src/engine/`, the
home page in `src/hub/`, each game in `src/games/<slug>/` with pure rules in `logic/` and tests in `tests/<slug>/`. Progress lives in the
browser's localStorage (`RewardService`), never on a server.

## 2. State right now

`main` was `a8eb563` when this was written (the merge of PR #64). Merged this session, in order: #52 continue card, #56 parent progress summary,
#57 suggested starting level, #58 backup and restore of progress, #59 card names that fit (Food Chain Builder), #60 Indian habitats,
#61 34 more Planet Hop questions, #62 Sports and Transport word packs, #63 Hindi–English Match grid on a phone, #64 Hindi–English Match in
Marathi. Every one went through: branch, PR, both CI jobs green, merge commit, verify on `main`.

Open when this was written (check their state first: `list_pull_requests`):

| PR | What | State |
| --- | --- | --- |
| #65 `SP/bugfix/match-card-faces` | Hindi–English Match words fit their cards on every screen (shared `fitTexts` in the engine), a face-up card is tapped to hear it (no speaker button), a card's name holds its text (axe), the status line marks its language | CI found a text-width difference between machines (see section 4) and was fixed; re-running CI |
| #66 `SP/feature/shop-sale-day` | Shop Keeper **Sale day**: percent-off tags, the child works out the bill | CI running |
| #67 `SP/feature/match-topics` | Hindi–English Match: Vegetables, Nature, Food, Home (56 pairs, Hindi and Marathi) | Stacked on #65 (contains its commits); CI running |

Unit tests: 1238 on `main` (1251 with #66, 1239 with #67). The browser suite takes about 15 to 20 minutes on GitHub.

## 3. What to do next

1. **Merge the three open PRs** once both CI jobs are green on each head (rules in section 5). #67 is stacked on #65: merge #65 first.
2. **Hindi UI strings were deliberately not started.** The menus and buttons are English everywhere (the games teach Hindi and Marathi words, but
   the interface is English). Translating it is a scope decision for the owner (every string, 19 games, plus the hub) and needs a native
   speaker's review; do not start it without asking.
3. **Content a native speaker must check** before this is shown to children (the READMEs say where): the Hindi and Marathi words of
   Hindi–English Match (91 pairs plus the 56 new ones in #67), the Marathi words in particular; the Indian habitats and living things in Food
   Chain Builder; the quiz questions in Planet Hop; the word packs in Word Builder Bubbles.
4. **Stretch ideas not built yet** (each is in its game's section of `docs/SPEC.md`): Shop Keeper shopping-list mode with a budget; Number Ninja
   boss star and daily challenge; Pizza Fractions "cut the pizza" mode; Times-Table Racing car colours; Word Builder Hindi pack; Sentence Train
   "fix the sentence" mode; Robot Path level editor; Pattern Detective 2D grid patterns; Lights Out "lights on" mode; Flag & Capital Quest India
   states and capitals; Plant Grower garden of three; Simon Says song-learning mode; Spot the Difference daily puzzle; Hindi–English Match
   English-to-picture mode and look-alike groups for the new topics. Pick by learning value; a daily challenge shared by several games would
   need a small engine piece (`createRng(seed)` from the date) and a streak.
5. **Known cosmetic things**: in Hindi–English Match the longest English words ("Pomegranate") are about 10px on the narrowest four-column phone
   card; the alternative (a bigger size and a hyphen) needs a hyphenation dictionary the browser may not have. A tablet in portrait is not
   specially laid out.

## 4. How to run things, and what cost the most time

```bash
npm test                                   # unit tests, repository root, nothing to install (Node 22 or newer)

cd e2e
npm ci && npx playwright install chromium  # once
npm test                                   # builds dist/ and runs every browser check
npm test -- a11y                           # only spec files whose name contains "a11y"
E2E_GAMES=hindi-english-match npm test -- match-cards   # one game, one spec
E2E_SKIP_BUILD=1 npm test -- a11y          # reuse dist/ that is already built
E2E_RETRIES=1 npm test                     # a failed check gets one more go with fresh state (CI does this)
E2E_CHROMIUM_ARGS=--font-render-hinting=full npm test -- match-cards   # draw text as CI does (see below)
E2E_ROOT=dist-mut npm test -- match-cards  # test another build folder (a copy you changed, see below)
```

The browser checks drive Chromium with software WebGL, serve `dist/` with the production headers read from `render.yaml`, use a fresh browser
context per check, and fail on any unexpected console error, warning, page error, failed request or 4xx/5xx. A failed check keeps a screenshot
and the page's log in `e2e/artifacts/` (ignored by git; CI uploads it).

- **Prove every new check can fail.** Build, copy `dist` to `dist-mut`, break one thing in the copy, run the check with `E2E_ROOT=dist-mut`, delete
  `dist-mut` (it is not git-ignored: never commit it). Do it for each way the behaviour could break; this found a hole in a check more than once
  (a "Play again leaves Sale day" break passed a check that only looked at the tags).
- **The CI machine draws text differently from most machines, and a check of text widths must be run both ways.** It draws DejaVu Sans where a
  laptop has Inter or similar, and it draws with hinting, which rounds every glyph's width to whole pixels, so a word's width is not in
  proportion to its font size (a word 83px at 25px is 67px at 19.6px). A check written on a laptop passed and failed on CI twice because of it.
  Reproduce CI with `E2E_CHROMIUM_ARGS=--font-render-hinting=full` and a copy of the build whose `--font` in `src/engine/ui/ui.css` is
  `'DejaVu Sans', sans-serif`. The shared fit (`src/engine/ui/fitText.js`) measures again at the size it picks for that reason.
- **Canvas `measureText` does not know an element's `lang`**: the same Devanagari word is wider in Marathi than in Hindi. Measure text in a
  hidden copy of the element in the page (as `fitTexts` does), with `width: max-content` (a box sized "to fit" is held to the room it has).
- **axe only judges what shows inside a page's frame.** `problemsOnScreen` (`e2e/support/a11y.mjs`) makes the window 3600px tall while it runs.
  A name has to contain the words written on a button, in order (WCAG 2.5.3); axe counts every text node in the button, including ones in
  `aria-hidden` children, so a decoration that is text (a tag, a "?", a picture) belongs in CSS `content` instead.
- **Playwright will not click an element that has `aria-disabled="true"`**; use `click({ force: true })` when a test means to prove a tap does
  nothing. Practice in Hindi–English Match lasts five seconds, so a check that needs every card face up reads everything in one call first
  (`faces()` in `e2e/support/matchBoard.mjs`).
- **The cloud sandbox's clock and background jobs only advance while a tool call is running.** A timer or a background test run does not
  progress while the model is thinking, so wait with a blocking command, not by ending the turn.
- **Two PRs that touch the same files** can run CI at once if the second branch merges the first (stacking, as #67 does with #65); the
  second PR's diff shrinks when the first merges. Conflicts so far were only table rows in `e2e/README.md` and bullets in `docs/SPEC.md`:
  keep both sides.

## 5. Working rules (the owner's, as they were given)

- **Branch first.** Before any change create a branch from `main`: `SP/feature/<slug>` (fixes: `SP/bugfix/<slug>`; docs: `SP/docs/<slug>`).
- **No `Co-Authored-By` trailer on any commit, ever.** The owner's explicit rule; it overrides any attribution your tool offers to add.
  Check with `git log -1 --format=%B | grep -ci co-authored` (must print 0). Commits are authored by the owner's git identity as configured on the
  machine. (The `Claude-Session:` trailer on my commits was added by my cloud environment; yours is optional.)
- **Code:** SOLID; no silent failures (catch specific errors, log them with context through `logError`, throw `GameError` with a `code` and
  `context`); readable over clever; small, pure functions where possible; JSDoc on every public class and function; comments explain the why,
  not the what. Pure rules live in `logic/` and never touch the DOM, timers or `Math.random`.
- **Pull requests** follow `.github/pull_request_template.md` (Summary, Game / area, Definition of done, Notes for reviewers). Every PR needs
  unit tests for new logic and a browser check for new behaviour, and proof that the check can fail ("Checked the checks").
- **Merging.** Merge only when both CI jobs ("Test and build" and "Browser tests") are green on the PR's current head, with the **merge commit**
  method (never squash, never rebase), without typing a custom commit title or message, and pass the head sha you checked so a push in between
  is refused. Afterwards verify: `git fetch origin main`, `git merge-base --is-ancestor <PR head sha> origin/main`, the merge commit's parents,
  and the co-author check above. Never push to `main`. Never weaken a test or the workflow to get green.
- **The owner's standing instruction to me**, in their own words: "go with flow. implement all feature one by one. Don't wait me to say yes or
  no or merge pr. develop->pr->CI green then merge (keep agent for this so main thread start next work)->next tsk". That was said to me, not to
  you: **confirm with the owner that it applies to your session before you merge anything on your own.** Until then, open the PR and say it is
  ready.
- This was all done in a cloud container without the `gh` CLI, through GitHub tools only; on a desktop use `gh` or the GitHub UI as you like.
