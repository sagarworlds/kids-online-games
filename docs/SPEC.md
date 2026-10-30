# Kids Learning Games — Development Spec (Pure JavaScript)

Oct 30, 2026 · @Sagar

## How to use this doc with Claude Code

This spec covers 16 browser games for children aged 8–10. Each one is built in plain HTML, CSS and JavaScript (ES modules), with no frameworks and no build step. All games share one small engine described in the next section, so build that first, then add games one at a time.

**Suggested build order**

1. Shared engine and the game hub (menu that lists all games)
2. Number Ninja, Robot Path (they exercise the game loop, input and grid logic)
3. Hindi–English Match, Simon Says, Lights Out (state-heavy, little animation)
4. Pizza Fractions, Shop Keeper, Times-Table Racing, Word Builder Bubbles
5. Sentence Train, Pattern Detective, Flag & Capital Quest, Planet Hop
6. Food Chain Builder, Plant Grower, Spot the Difference

**Prompt template for Claude Code** (one game per session)

```
Read docs/SPEC.md. Follow the "Shared architecture & conventions" section exactly.
Create branch SP/feature/<game-slug> from main.
Implement game <N>: <Game name> under src/games/<game-slug>/.
Meet every acceptance criterion in that game's section, add its unit tests,
register it in the hub, then run the tests and fix failures.
Commit with a clear message and no co-author trailer.
```

Save this doc as Markdown (`docs/SPEC.md`) in the repo so Claude Code can read it directly.

**Every game section follows the same layout:** learning goal, core loop, screens, rules, difficulty levels, data model, modules, feedback, edge cases, acceptance criteria, stretch ideas.

## Shared architecture & conventions

All 16 games run on one tiny engine: a scene manager, a game loop, and injected services for input, audio, storage and rewards. Games depend only on interfaces (JSDoc typedefs), never on concrete services.

**Tech constraints**

- Vanilla JavaScript (ES2022 modules), HTML5, CSS3. No frameworks, no bundler, no external CDNs.
- Runs by opening `index.html` through any static server (`npx serve .`). Works offline.
- Target: Chrome, Edge, Safari, Firefox (latest 2 versions); tablets 768px+ and desktops. Portrait and landscape.
- Canvas for action games; DOM + CSS for card, drag-and-drop and quiz games.
- Unit tests with Node's built-in runner (`node --test`), so no test dependencies either.

**Folder structure**

```
/index.html                 Game hub (menu of all games)
/src/engine/
    Game.js                 Owns the loop; delegates to the active scene
    SceneManager.js         Push / pop / replace scenes
    Scene.js                Base class: enter(), exit(), update(dt), render(ctx)
    GameLoop.js             requestAnimationFrame loop, fixed dt clamp (max 50 ms)
    services/
        InputService.js     Unified pointer + keyboard events
        AudioService.js     Web Audio tones + short SFX, global mute
        StorageService.js   localStorage wrapper with try/catch + in-memory fallback
        RewardService.js    Stars, badges, streaks
        SpeechService.js    Optional speechSynthesis for read-aloud
    ui/
        Button.js, Modal.js, Confetti.js, ProgressBar.js, Hud.js
    utils/
        random.js (seeded RNG, shuffle), geometry.js, timer.js, errors.js
/src/games/<game-slug>/
    index.html              Thin page that boots the game
    main.js                 Composition root: wires services into scenes
    scenes/                 MenuScene, PlayScene, ResultScene (+ game-specific)
    logic/                  Pure rules (no DOM): generators, validators, scoring
    data/                   JSON content (words, flags, levels)
    assets/                 SVG / small PNG / audio
    style.css
/tests/<game-slug>/*.test.js  Tests for logic/ only
/docs/SPEC.md               This document
```

**Module responsibilities**

| Module | Single responsibility | Depends on |
| --- | --- | --- |
| `Game` | Run the active scene each frame | `SceneManager`, `GameLoop` |
| `SceneManager` | Hold the scene stack and transitions | `Scene` interface |
| `Scene` (base) | Lifecycle hooks; subclasses add behaviour (Open/Closed) | Services passed in constructor |
| `InputService` | Translate pointer/keyboard into `tap`, `drag`, `key` events | DOM |
| `AudioService` | Play named sounds; respect mute | Web Audio API |
| `StorageService` | Read/write JSON per game key | `localStorage` |
| `RewardService` | Award stars (1–3) and badges | `StorageService` |
| `logic/*` | Pure functions: generate question, check answer, score | Nothing (fully testable) |

**SOLID rules for every game**

- Logic files are pure: no DOM, no timers, no randomness except an injected RNG. This keeps them testable.
- Scenes receive services through their constructor (Dependency Inversion); `main.js` is the only place that creates concrete classes.
- New games extend `Scene`; they never edit engine files (Open/Closed). If the engine needs a feature, add it as a new service.
- Each scene does one job: menu, play, or results.

**Error handling**

- Define `GameError` (with `code` and `context`) in `utils/errors.js`. Throw it for invalid data (for example a malformed level JSON), never plain strings.
- Validate every JSON data file on load; on failure, log `console.error` with file name and field, then show a friendly "Oops, something went wrong — back to menu" screen. Never a blank page.
- `StorageService` and `AudioService` must never crash the game: catch, log once, fall back (in-memory store, silent audio).
- Wrap each frame's `update`/`render` in try/catch inside `GameLoop`; on error, stop the loop and show the error screen.

**Documentation**

- JSDoc on every exported class and function: purpose, `@param`, `@returns`, `@throws`.
- Comments explain *why* (game rules, difficulty formulas), not *what*.
- Each game folder gets a short `README.md`: how to play, learning goal, file map.

**UX rules for 8–10 year olds**

- Tap targets at least 48×48 px; font at least 20px for body text and 32px for questions.
- Rounds last 1–3 minutes. Instant feedback on every answer (sound + colour + animation in under 150 ms).
- No "Game Over". Mistakes show "Try again!" plus a hint after 2 wrong tries.
- Results screen always shows 1–3 stars and one positive message; stars save per level.
- Every game has three difficulty levels (Easy / Medium / Hard) and a parent settings panel: sound on/off, read-aloud on/off, difficulty lock.
- No ads, no external links, no data leaves the device, no personal data collected.

**Accessibility**

- Keyboard play for every game (Tab/Enter/arrow keys). Visible focus rings.
- Colour contrast 4.5:1 for text; never use colour alone to signal right/wrong (add an icon ✔ / ✖ and a shape).
- `prefers-reduced-motion` turns off shakes, confetti and screen flashes.
- Read-aloud option via `speechSynthesis` for questions (helps early readers).

**Shared game state shape**

```js
/** @typedef {{ level: 'easy'|'medium'|'hard', score: number, streak: number,
 *   correct: number, attempts: number, startedAt: number }} RoundState */
/** Saved per game under key `kidsgames:<slug>` */
/** @typedef {{ bestStars: Record<string, 1|2|3>, bestScore: number,
 *   badges: string[] }} SaveData  // global settings live in kidsgames:settings */
```

**Star rule (default, games may override):** accuracy ≥ 90% = 3 stars, ≥ 70% = 2 stars, otherwise 1 star.

**Git workflow**

- One branch per game, created from `main` before any change: `SP/feature/<game-slug>` (for example `SP/feature/number-ninja`). Fixes use `SP/bugfix/<short-name>`.
- Small commits with clear messages; no co-author trailers.
- Merge to `main` only when all acceptance criteria and tests pass.

**Definition of done (every game)**

- [ ] All acceptance criteria in the game section pass
- [ ] `node --test` passes for its `logic/` tests
- [ ] Playable with mouse, touch and keyboard
- [ ] No console errors during a full round
- [ ] Listed in the hub with icon, name and learning tag

## Home page (game hub), player profile & local storage

All 16 games are reached from one home page (`/index.html`). It greets the child by a randomly generated name they can edit, and it stores every bit of player and game data in the browser's `localStorage` only.

**Home page layout**

- **Header:** avatar + greeting ("Hi, Brave Panda!") with a pencil button to edit the name, total stars earned across all games, and a gear button for settings.
- **Subject filter chips:** All, Math, Language, Logic, Science, Memory.
- **Game grid:** 16 large cards (min 160 × 160 px), grouped by subject. Each card shows the icon, game name, learning tag (e.g. "Fractions"), stars earned so far, and a "New" badge if never played. Tapping a card opens `src/games/<slug>/index.html`.
- **Footer:** "Grown-ups" link to the parent area (reset progress, settings lock).
- Every game screen has a Home button that returns here, and results screens use the player name ("Great job, Brave Panda!").

**Game cards by subject**

| Subject | Games |
| --- | --- |
| Math | Number Ninja, Pizza Fractions, Shop Keeper, Times-Table Racing |
| Language | Word Builder Bubbles, Hindi–English Match, Sentence Train |
| Logic | Robot Path, Pattern Detective, Lights Out |
| Science & world | Flag & Capital Quest, Planet Hop, Food Chain Builder, Plant Grower |
| Memory & focus | Simon Says, Spot the Difference |

**Random player name**

- On the first visit, generate a friendly name as *Adjective + Animal* from two word lists in `data/names.json` (at least 30 each), e.g. "Brave Panda", "Clever Tiger", "Happy Dolphin". The avatar is the matching animal icon.
- Save it at once so the same name appears on every visit.
- **Edit:** the pencil button turns the name into a text input with Save and Cancel. A "Shuffle" (🎲) button suggests a new random name.
- **Validation:** trim spaces; 2–20 characters; letters (any script, including Devanagari), numbers and spaces only (`/^[\p{L}\p{N} ]{2,20}$/u`); check a small blocklist of rude words. Invalid input shows a friendly message ("Names need 2 to 20 letters") and keeps the old name.
- No surname, age, email or photo is ever asked for.

**Hub modules**

- `src/hub/gamesRegistry.js` — one array of `{ slug, title, subject, icon, path, learningTag }`. The hub and the stars total read only from this list, so adding a game means adding one entry.
- `src/hub/nameGenerator.js` — `randomName(rng)` returns `{ name, avatar }`.
- `src/hub/ProfileService.js` — `getProfile()`, `rename(name)` (validates, throws `GameError('INVALID_NAME')`), `shuffleName()`; depends on the `StorageService` interface.
- `src/hub/HubPage.js` — renders header, filters and cards; listens to the `storage` event so a rename in another tab updates the page.

**localStorage keys**

| Key | Holds | Shape |
| --- | --- | --- |
| `kidsgames:profile` | Player name and avatar | `{ version, name, avatar, createdAt }` |
| `kidsgames:settings` | Global settings for every game | `{ version, sound, readAloud, difficultyLock }` |
| `kidsgames:<slug>` | One game's progress (16 keys) | `SaveData` (see shared state shape above) |

**Storage rules**

- All reads and writes go through `StorageService`; games and the hub never touch `localStorage` directly.
- Every stored object has a `version` number; `StorageService` runs small migration functions when the version is older.
- Corrupted JSON in one key: log it with the key name, reset only that key to defaults, and carry on.
- `localStorage` missing, blocked (private mode) or full (`QuotaExceededError`): fall back to in-memory storage for the session and show a small notice: "Progress won't be saved on this device".
- Nothing is sent to a server; there are no cookies and no analytics.
- **Parent area:** "Reset all progress" clears every `kidsgames:*` key after a simple parent check (answer a question like 7 × 8) and a confirm dialog. The profile name is kept unless "Also reset name" is ticked.

**Acceptance criteria**

- [ ] Home page lists all 16 games from `gamesRegistry.js`, and every link opens its game
- [ ] First visit creates and saves a random name; reloading shows the same name
- [ ] Name can be edited and shuffled; invalid names are rejected with a friendly message (unit-tested)
- [ ] Stars on each card and the total match each game's saved data
- [ ] Every game has a Home button and uses the player name on its results screen
- [ ] Works when `localStorage` is unavailable (in-memory fallback, no crash)
- [ ] Reset clears only `kidsgames:*` keys

## Game 1 — Number Ninja (`number-ninja`)

Math problems fall from the sky as stars, and the child types each answer before it reaches the ground, building fast mental arithmetic.

**Learning goal:** fluency in addition, subtraction, multiplication and simple division (grades 3–5).

**Core loop:** a problem spawns at the top → it falls at speed *v* → the child types the answer + Enter (or taps an on-screen number pad) → a correct answer slices the star (+points) → a missed star costs one of 5 shields → the round ends after 20 problems or when shields reach 0.

**Screens:** Menu (choose operation + level) → Play (canvas + answer box + number pad + HUD: score, shields, streak) → Results (stars, accuracy, best streak, "hardest problem" replay).

**Rules & mechanics**

- Up to 3 problems on screen at once. Typing an answer targets the lowest matching star first.
- Points = 10 + (streak × 2), capped at 30 per answer. A streak resets on a miss or a wrong answer.
- A wrong answer shakes the input and does not cost a shield; only a star hitting the ground does.
- Fall speed rises 5% every 5 correct answers; it never goes above the level's max.
- A star that lands shows its correct answer for 1.5 s (learning moment).

**Difficulty levels**

| Level | Operations | Number range | Fall time (top → ground) | Max on screen |
| --- | --- | --- | --- | --- |
| Easy | + − | 0–20, no negatives | 12 s → 9 s | 2 |
| Medium | + − × | +/− up to 100, × tables 2–5 | 10 s → 7 s | 3 |
| Hard | + − × ÷ | +/− up to 500, ×/÷ tables 2–12, exact division only | 8 s → 5 s | 3 |

**Data model**

```js
/** @typedef {{ id: number, a: number, b: number, op: '+'|'-'|'x'|'/',
 *   answer: number, x: number, y: number, speed: number }} Problem */
```

**Modules**

- `logic/problemGenerator.js` — `generateProblem(level, ops, rng)`; avoids repeating the same problem within 5 spawns.
- `logic/scoring.js` — `scoreAnswer(streak)`, `starsFor(accuracy)`.
- `logic/answerMatcher.js` — `findTarget(problems, value)` returns the lowest matching problem or null.
- `scenes/PlayScene.js` — spawning, falling, collision with the ground, HUD.
- `ui/NumberPad.js` — on-screen 0–9, backspace, enter (48px+ keys).

**Feedback:** slice animation + rising "+12" text + "ding"; a miss gives a soft thud and the shield icon cracks. Every 5 streak shows "Ninja streak!".

**Edge cases**

- Leading zeros and empty input are ignored; max input length is 4 digits.
- Two stars with the same answer: the lowest one is cleared.
- Tab hidden (`visibilitychange`) pauses the game; a Resume button appears.
- Division always produces whole numbers; subtraction never goes negative on Easy.

**Acceptance criteria**

- [ ] Problems match the chosen level's ranges (unit-tested with 1,000 generated samples)
- [ ] Typing the right answer clears the correct star within one frame
- [ ] A landed star reduces shields by 1 and shows its answer
- [ ] Round ends after 20 problems or 0 shields and shows stars by accuracy
- [ ] Playable fully by keyboard and fully by on-screen pad
- [ ] Pauses when the tab is hidden

**Stretch ideas:** a "boss star" with a two-step problem; daily challenge with a fixed seed; practise-mistakes mode that replays missed problems.

## Game 2 — Pizza Fractions (`pizza-fractions`)

The child runs a pizza counter and fills orders like "3/8 pepperoni" by tapping slices, so fractions become something they can see and count.

**Learning goal:** read fractions, link numerator/denominator to parts of a whole, recognise equivalent fractions (1/2 = 2/4 = 4/8) and compare fractions.

**Core loop:** a customer appears with an order ticket → the pizza is shown cut into *d* slices → the child picks a topping and taps slices to place it → taps "Serve" → the game checks the fraction → the customer reacts → next customer. 8 customers per round.

**Screens:** Menu → Kitchen (pizza canvas, topping tray, order ticket, Serve button, coins) → Results (stars, coins earned, list of orders with ✔/✖).

**Rules & mechanics**

- Tapping a slice toggles the selected topping on/off. One topping per slice.
- An order is correct when the topped-slice fraction equals the ordered fraction (compare with cross-multiplication, not floats).
- Equivalence orders (Medium+): the ticket says "1/2 olive" but the pizza has 8 slices, so 4 slices are needed.
- Multi-topping orders (Hard): "1/4 mushroom and 1/2 cheese" on the same pizza; slices may not overlap.
- Wrong serve: the customer shows a thought bubble with the ordered fraction drawn as a mini pizza, and the child can try again (max 2 retries).
- Coins: 10 per correct serve on the first try, 5 on a retry.

**Difficulty levels**

| Level | Slice counts | Order types |
| --- | --- | --- |
| Easy | 2, 4, 8 | Same denominator as the cut ("3/8" on an 8-slice pizza) |
| Medium | 4, 6, 8, 12 | Adds equivalent fractions ("1/3" on a 6-slice pizza) |
| Hard | 6, 8, 10, 12 | Two toppings per order + "Which is bigger?" bonus question |

**Data model**

```js
/** @typedef {{ num: number, den: number }} Fraction */
/** @typedef {{ topping: string, amount: Fraction }} OrderLine */
/** @typedef {{ id: number, customer: string, lines: OrderLine[], slices: number }} Order */
/** @typedef {(string|null)[]} PizzaState  // topping per slice, length = slices */
```

**Modules**

- `logic/fraction.js` — `simplify`, `equals(a, b)` (cross-multiply), `compare`, `fromSlices(count, total)`.
- `logic/orderGenerator.js` — creates orders that are always solvable with the given slice count.
- `logic/orderChecker.js` — `checkOrder(order, pizzaState)` returns `{ ok, perLine: [{ topping, expected, actual }] }`.
- `scenes/KitchenScene.js` — canvas pizza drawn with `ctx.arc`; hit test by angle from centre.
- `ui/OrderTicket.js` — shows the fraction stacked (numerator over denominator), large font.

**Feedback:** correct = customer smiles, "Yum!", coin sound; wrong = slices that are off pulse gently, with a hint such as "You have 2/8, the order is 3/8".

**Edge cases**

- Never generate impossible orders (for example 1/3 on an 8-slice pizza).
- Serving an empty pizza is blocked with "Add some toppings first!".
- A tap exactly on a slice border picks the slice under the angle, rounded down.

**Acceptance criteria**

- [ ] `fraction.equals` handles equivalents (2/4 = 1/2) and is unit-tested
- [ ] Generator never produces an unsolvable order (tested over 1,000 orders per level)
- [ ] Tap/click and keyboard (arrow keys move between slices, Space toggles) both work
- [ ] Wrong serve shows the visual hint and allows 2 retries
- [ ] Round of 8 customers ends on the Results screen with correct stars

**Stretch ideas:** a "cut the pizza" mode where the child picks the slice count; sharing problems ("share 3 pizzas between 4 friends").

## Game 3 — Shop Keeper (`shop-keeper`)

The child runs a small shop: customers buy items, pay with notes, and the child drags coins and notes into the tray to give exact change.

**Learning goal:** money recognition, addition of prices, subtraction for change, and making an amount with the fewest coins/notes.

**Core loop:** a customer brings 1–3 items → the till shows the total (Easy) or the child adds it up (Medium+) → the customer pays → the child drags money from the cash drawer into the change tray → taps "Give change" → checked → next customer. 6 customers per round.

**Screens:** Menu → Shop (counter with items, price tags, customer, payment shown, cash drawer, change tray, running tray total) → Results (stars, "perfect change" count, coins saved).

**Currency:** Indian Rupee by default (₹1, ₹2, ₹5, ₹10 coins; ₹10, ₹20, ₹50, ₹100, ₹200, ₹500 notes). Put denominations in `data/currency.inr.json` so another currency file (USD, GBP) can be added without code changes.

**Rules & mechanics**

- Change is correct when the tray total equals payment − bill.
- Bonus "Smart change" star when the child uses the minimum number of pieces (computed with a greedy algorithm, which is exact for INR denominations).
- Medium+: total is hidden; the child first types the total, then gives change.
- Tapping money in the tray sends it back to the drawer.
- The tray shows a live total on Easy only; Medium+ shows it after "Give change".

**Difficulty levels**

| Level | Items per customer | Prices | Payment | Total shown |
| --- | --- | --- | --- | --- |
| Easy | 1 | ₹1–₹50, whole | Next note up (₹10/₹20/₹50/₹100) | Yes |
| Medium | 2 | ₹5–₹150 | Any larger note | No, child adds |
| Hard | 3 | ₹10–₹450 | Sometimes 2 notes (₹500 + ₹100) | No, child adds |

**Data model**

```js
/** @typedef {{ value: number, kind: 'coin'|'note', label: string, img: string }} Denomination */
/** @typedef {{ name: string, price: number, img: string }} Item */
/** @typedef {{ items: Item[], total: number, paid: number[], changeDue: number }} Sale */
```

**Modules**

- `logic/saleGenerator.js` — builds a sale where `paid > total` and change is possible.
- `logic/change.js` — `sum(pieces)`, `minPieces(amount, denominations)` (greedy), `checkChange(sale, tray)`.
- `ui/DragDrop.js` — pointer-event drag with snap-back; keyboard alternative: focus a piece, Enter adds it to the tray.
- `scenes/ShopScene.js` — renders the counter with DOM elements and CSS.
- `data/items.json` — 30+ friendly items (apple, pencil, ball, kite) with prices per level.

**Feedback:** correct change = till "ka-ching" and the customer waves; too much = "You gave ₹5 too much"; too little = "The customer needs ₹3 more".

**Edge cases**

- All money math in whole rupees (integers); never floats.
- Exact payment (no change due) occurs on Hard: the child must tap "No change needed".
- Drag released outside the tray snaps back to the drawer.

**Acceptance criteria**

- [ ] `minPieces` returns the true minimum for all amounts 1–999 (unit-tested)
- [ ] Drag-and-drop works with mouse, touch and keyboard
- [ ] Too much / too little messages show the exact difference
- [ ] Currency loads from JSON; swapping the file changes the coins with no code edits
- [ ] Round of 6 customers shows stars and "Smart change" count

**Stretch ideas:** discount day (10% off); shopping-list mode where the child is the customer with a budget.

## Game 4 — Times-Table Racing (`times-table-racing`)

Each correct multiplication answer pushes the child's car forward on a track, racing a ghost car that replays their own best run.

**Learning goal:** automatic recall of times tables 2–12, with a focus on the tables the child gets wrong most.

**Core loop:** a question appears (`7 × 8 = ?`) with 4 answer buttons → a correct tap boosts the car forward 1/20 of the track → a wrong tap makes the car wobble for 1 s and repeats the question later → the race ends when the car crosses the finish (20 correct) → the time is compared with the ghost.

**Screens:** Menu (pick tables or "Mixed", pick level) → Race (side-view track canvas, question card, 4 big answer buttons, timer) → Results (time, ghost difference, stars, per-table accuracy heat strip).

**Rules & mechanics**

- The 3 wrong options are "near misses": the answer ± the table number, a swapped-digit answer (56 → 65), and answer ± 1. All distinct and positive.
- Ghost car: record a timestamp for each correct answer in the best run; replay those timestamps in the next race. The first race has a default ghost that gets one answer every 5 s.
- Adaptive practice: questions answered wrongly get a higher weight (×3) in future draws for that child; weights saved in storage.
- Stars by time vs ghost: beat ghost = 3, within +5 s = 2, finished = 1.

**Difficulty levels**

| Level | Tables | Answer mode | Default ghost pace |
| --- | --- | --- | --- |
| Easy | 2, 5, 10 | 4 buttons | 1 answer / 5 s |
| Medium | 2–10 | 4 buttons | 1 answer / 4 s |
| Hard | 2–12, includes missing factor (`? × 6 = 42`) | Type the answer | 1 answer / 3 s |

**Data model**

```js
/** @typedef {{ a: number, b: number, answer: number, missing: 'answer'|'a'|'b' }} Question */
/** @typedef {{ table: string, times: number[] }} GhostRun  // ms since start per correct answer */
/** @typedef {Record<string, number>} FactWeights  // key "7x8" -> weight */
```

**Modules**

- `logic/questionPicker.js` — weighted random pick using `FactWeights`; never the same fact twice in a row.
- `logic/distractors.js` — `makeOptions(question, rng)` returns 4 shuffled unique options.
- `logic/ghost.js` — `ghostProgressAt(run, elapsedMs)` returns 0–1.
- `scenes/RaceScene.js` — parallax background, two cars, smooth easing of car position.

**Feedback:** correct = engine "vroom" and speed lines; wrong = tyre squeak plus the right fact shown for 1 s (`7 × 8 = 56`).

**Edge cases**

- Treat 6×7 and 7×6 as the same fact for weights but show both forms.
- Ghost data corrupted or missing → fall back to the default ghost and log it.
- Car position never moves backward.

**Acceptance criteria**

- [ ] Options are always 4 unique positive numbers including the answer (unit-tested)
- [ ] Ghost replays the saved best run accurately (±50 ms)
- [ ] Missed facts appear more often in the next race
- [ ] Results show per-table accuracy
- [ ] Keyboard: keys 1–4 choose options; typing mode on Hard

**Stretch ideas:** unlockable car colours for stars earned; two-player split-screen on one tablet.

## Game 5 — Word Builder Bubbles (`word-builder-bubbles`)

Letters float in bubbles around an underwater scene, and the child pops them in the right order to spell the word shown by a picture and clue.

**Learning goal:** spelling, letter order, phonics and vocabulary (picture → word link).

**Core loop:** show a picture + clue ("It says meow") and empty letter slots → bubbles carrying the word's letters plus 2–4 decoy letters drift and bounce → the child pops the next correct letter → it flies into its slot → a wrong letter wobbles and floats away → the word completes with a celebration → next word. 10 words per round.

**Screens:** Menu (word pack + level) → Play (canvas with bubbles, picture card, letter slots, Hint button, speaker icon) → Results (stars, words learned, "tricky words" list to practise).

**Rules & mechanics**

- Letters must be popped in order. The next empty slot pulses.
- Bubbles move with simple physics: constant velocity, bounce off walls, gentle bob (sine wave). Bubbles do not collide with each other on Easy (simpler); they do on Hard.
- Hint (3 per round): the next correct bubble glows for 2 s.
- Speaker icon reads the word aloud with `speechSynthesis` (skip silently if unsupported).
- Repeated letters (for example "apple") each get their own bubble.
- Stars: 0–1 mistakes per word on average = 3, ≤ 2 = 2, otherwise 1.

**Difficulty levels**

| Level | Word length | Decoy letters | Bubble speed | Clue |
| --- | --- | --- | --- | --- |
| Easy | 3–4 letters (cat, sun) | 2 | Slow (40 px/s) | Picture + first letter filled |
| Medium | 5–6 letters (plant, rabbit) | 3 | 70 px/s | Picture only |
| Hard | 7–9 letters (elephant) | 4, similar-looking (b/d, m/n) | 100 px/s | Text clue only |

**Data model**

```js
/** @typedef {{ word: string, clue: string, image: string, pack: string, level: string }} WordEntry */
/** @typedef {{ id: number, letter: string, x: number, y: number, vx: number, vy: number,
 *   r: number, isDecoy: boolean }} Bubble */
```

**Modules**

- `data/words.json` — packs: Animals, Food, Home, School, Nature (at least 25 words each).
- `logic/bubbleFactory.js` — `createBubbles(word, decoyCount, bounds, rng)`; bubbles never spawn overlapping.
- `logic/physics.js` — `step(bubbles, dt, bounds)`, `circleCircle` collision for Hard.
- `logic/spellingState.js` — tracks filled slots, mistakes, `tryLetter(letter)` returns `'correct'|'wrong'|'complete'`.
- `scenes/BubbleScene.js` — render + pointer hit test (point in circle).

**Feedback:** pop sound + small sparkle; wrong letter = soft "boop" and the bubble drifts off; complete word = the picture animates and the word is read aloud.

**Edge cases**

- Words with repeated letters: popping any matching bubble counts.
- Keyboard play: typing a letter pops the nearest matching bubble.
- Resize/rotate keeps bubbles inside the new bounds.

**Acceptance criteria**

- [ ] All letters of the word plus decoys spawn with no overlap
- [ ] Only the next correct letter fills a slot; wrong letters never fill it
- [ ] Keyboard and touch both work
- [ ] Read-aloud works where supported and fails silently elsewhere
- [ ] Results list "tricky words" (words with 2+ mistakes)

**Stretch ideas:** Hindi word pack (Devanagari letters); a "make any word" free mode using a dictionary list.

## Game 6 — Hindi–English Match (`hindi-english-match`)

A memory card-flip game where each pair is a Hindi word and its English meaning (सेब ↔ Apple), so children build bilingual vocabulary while training memory.

**Learning goal:** vocabulary in both languages, reading Devanagari, and working memory.

**Core loop:** a face-down grid of cards → the child flips two → if they are a Hindi–English pair they stay open (both words read aloud) → if not, they flip back after 1 s → the round ends when all pairs are found.

**Screens:** Menu (topic + level + "Practice: show all cards for 5 s first") → Board (card grid, moves counter, timer, pairs found) → Results (stars, moves, time, list of all pairs with pictures for review).

**Rules & mechanics**

- A pair matches by `pairId`, not by text, so the same English word can be reused across topics.
- While 2 unmatched cards are open, further taps are ignored until they flip back.
- Cards can show a small picture under the word on Easy to help non-readers.
- Stars by moves: moves ≤ pairs × 1.5 = 3, ≤ pairs × 2.5 = 2, otherwise 1.
- Read-aloud: Hindi with `lang='hi-IN'`, English with `lang='en-IN'` (if a voice exists).

**Difficulty levels**

| Level | Grid | Pairs | Help |
| --- | --- | --- | --- |
| Easy | 3 × 4 | 6 | Pictures on cards, Hindi cards tinted orange and English blue |
| Medium | 4 × 4 | 8 | No pictures, same colour cards |
| Hard | 4 × 5 | 10 | Includes similar words (आम Mango / आँख Eye) |

**Data model**

```js
/** @typedef {{ pairId: string, hi: string, en: string, image?: string, topic: string }} WordPair */
/** @typedef {{ id: number, pairId: string, lang: 'hi'|'en', text: string,
 *   state: 'down'|'up'|'matched' }} Card */
```

**Modules**

- `data/pairs.json` — topics: Fruits, Animals, Colours, Body, Family, Numbers 1–10 (at least 12 pairs each).
- `logic/deck.js` — `buildDeck(pairs, count, rng)` with Fisher–Yates shuffle.
- `logic/matchState.js` — state machine: `idle → oneUp → twoUp → (matched | mismatch) → idle`; exposes `flip(cardId)`.
- `scenes/BoardScene.js` — CSS 3D flip (`transform: rotateY(180deg)`, `backface-visibility: hidden`).
- Font: a Devanagari-capable system font stack (`'Noto Sans Devanagari', 'Mangal', sans-serif`); bundle Noto Sans Devanagari locally for offline use.

**Feedback:** match = both cards glow green, chime, words spoken; mismatch = gentle shake and flip back.

**Edge cases**

- Double-tapping the same card does not count as two flips.
- Rapid tapping during the 1 s flip-back is ignored.
- If `speechSynthesis` has no Hindi voice, hide the speaker icon for Hindi cards only.

**Acceptance criteria**

- [ ] Deck always contains exactly 2 cards per pair (one hi, one en), shuffled
- [ ] State machine unit-tested for all transitions, including double taps
- [ ] Devanagari renders correctly offline
- [ ] Keyboard: arrow keys move focus on the grid, Enter flips
- [ ] Results show every pair for review

**Stretch ideas:** English ↔ picture mode for younger siblings; add Marathi/Tamil packs via JSON only.

## Game 7 — Sentence Train (`sentence-train`)

Word carriages arrive scrambled on a platform, and the child drags them behind the engine in the right order so the train can leave the station.

**Learning goal:** sentence structure (subject–verb–object), capital letters and punctuation, word order in questions.

**Core loop:** the engine waits at the platform with empty couplings → 4–10 word carriages sit scrambled on a siding → the child drags carriages onto the track in order → taps the whistle → a correct sentence makes the train chug off (sentence read aloud) → a wrong one highlights the first misplaced carriage → 8 sentences per round.

**Screens:** Menu → Station (engine, track slots, siding with carriages, whistle button, picture hint) → Results (stars, sentences built, mistakes by type: order / punctuation).

**Rules & mechanics**

- The first word keeps its capital letter and the last carriage carries the punctuation (`.` `?` `!`), which gives useful clues.
- Accept more than one correct order when the sentence data lists alternatives ("Today I play" / "I play today").
- Carriages on the track can be dragged back out or swapped by dropping one on another.
- Hint button (2 per round) locks the next correct carriage into place.
- Stars: first-try correct sentences ≥ 7 = 3, ≥ 5 = 2, otherwise 1.

**Difficulty levels**

| Level | Words per sentence | Sentence types | Distractor carriage |
| --- | --- | --- | --- |
| Easy | 3–5 | Simple statements ("The cat is sleeping.") | None |
| Medium | 5–7 | Adds questions and adjectives | None |
| Hard | 7–10 | Adds clauses with "because/and/but" | 1 extra word that does not belong |

**Data model**

```js
/** @typedef {{ id: string, words: string[], alternatives?: string[][],
 *   distractor?: string, image?: string, level: string }} SentenceEntry */
/** @typedef {{ id: number, word: string, slot: number|null }} Carriage */
```

**Modules**

- `data/sentences.json` — at least 30 sentences per level, child-friendly topics.
- `logic/scrambler.js` — shuffles until the order differs from every accepted answer.
- `logic/sentenceChecker.js` — `check(slots, entry)` returns `{ ok, firstWrongIndex }`.
- `ui/DragDrop.js` (shared with Shop Keeper) — reuse, do not copy.
- `scenes/StationScene.js` — DOM layout; train exit uses CSS `transform: translateX` animation.

**Feedback:** correct = whistle + chug sound, train leaves, sentence spoken; wrong = the first wrong carriage bounces with a red outline and ✖ icon.

**Edge cases**

- The whistle is disabled until every slot is filled (except the distractor on Hard).
- Scramble must never show the correct sentence by chance.
- Long words shrink font to fit the carriage, minimum 18px; otherwise the carriage widens.

**Acceptance criteria**

- [ ] Checker accepts every listed alternative order (unit-tested)
- [ ] Scrambled order never equals a correct order
- [ ] Drag, swap and drag-back work with touch, mouse and keyboard
- [ ] Hard mode distractor must be left on the siding for success
- [ ] Results show mistakes by type

**Stretch ideas:** "Fix the sentence" mode with a punctuation carriage to place; Hindi sentence pack.

## Game 8 — Robot Path (`robot-path`)

The child plans a robot's route with command blocks (forward, turn, repeat), presses Run, and watches the robot follow the plan to the battery: a first taste of programming.

**Learning goal:** sequencing, debugging, directions (left/right relative to facing), loops and planning ahead.

**Core loop:** a grid level appears with robot, goal (battery), walls and gems → the child adds command blocks to a program strip → taps Run → the robot executes one command every 400 ms, highlighting the active block → success if it ends on the battery → failure stops at the problem block with a message → the child edits and runs again.

**Screens:** Level map (30 levels in 3 worlds, stars per level) → Puzzle (grid canvas, block palette, program strip, Run / Step / Reset buttons) → Level complete (stars, "blocks used vs best").

**Rules & mechanics**

- Commands: `Forward`, `Turn Left`, `Turn Right` (World 1); adds `Repeat N { }` (World 2); adds `Pick gem` and a `Function` block called `F` (World 3).
- The robot has a facing direction (N/E/S/W). Left/right turn relative to facing, which is the key learning point.
- Hitting a wall or leaving the grid stops the run: the robot bumps, the failing block turns red.
- Gems are optional; collecting all gives the 3rd star.
- Stars: reached goal = 1, used ≤ par blocks = +1, all gems = +1.
- Step button runs one command at a time for debugging.
- Max program length per level (for example 12 blocks) shown as empty slots.

**Difficulty (worlds)**

| World | Levels | Grid | New concept |
| --- | --- | --- | --- |
| 1 Garden | 1–10 | 5 × 5 | Sequence + turns |
| 2 Factory | 11–20 | 6 × 6 | Repeat loops |
| 3 Space | 21–30 | 7 × 7 | Functions + gems |

**Data model**

```js
/** @typedef {{ type: 'forward'|'left'|'right'|'pick'|'repeat'|'callF',
 *   times?: number, body?: Command[] }} Command */
/** @typedef {{ id: number, size: [number, number], start: { x: number, y: number, dir: 'N'|'E'|'S'|'W' },
 *   goal: { x: number, y: number }, walls: [number, number][], gems: [number, number][],
 *   par: number, maxBlocks: number, allowed: string[] }} Level */
```

**Modules**

- `data/levels.json` — 30 hand-made levels, each verified solvable by a test.
- `logic/interpreter.js` — `compile(program)` flattens repeats/functions into steps (with a 200-step safety cap) and `run(level, steps)` yields a trace of `{ x, y, dir, event, blockPath }`. Pure, so the scene only animates the trace.
- `logic/solver.js` (tests only) — BFS to confirm each level has a solution within `maxBlocks`.
- `ui/ProgramEditor.js` — tap a palette block to append, drag to reorder, tap ✖ to remove; nested area for Repeat.
- `scenes/PuzzleScene.js` — grid render, robot sprite rotation, trace playback.

**Feedback:** each executed block lights up; success = robot dance + battery charge animation; failure = bump sound and the message "Robot hit a wall at step 4".

**Edge cases**

- Infinite or huge programs (nested repeats) hit the 200-step cap with the message "Too many steps!".
- Running with an empty program shows "Add some blocks first".
- Editing is locked while running; Reset stops playback.

**Acceptance criteria**

- [ ] Interpreter unit-tested: turns, walls, edges, nested repeats, functions, step cap
- [ ] Every level in `levels.json` is solvable within `maxBlocks` (solver test)
- [ ] Active block highlights in sync with robot movement
- [ ] Stars and unlocked levels persist across reloads
- [ ] Program can be built with keyboard only

**Stretch ideas:** level editor that saves to JSON; `If wall ahead` conditional block for World 4.

## Game 9 — Pattern Detective (`pattern-detective`)

The child is a detective solving "cases": each case is a sequence of shapes, colours or numbers with a missing piece, and they pick what comes next.

**Learning goal:** pattern recognition, number sequences (skip counting, doubling), and logical reasoning.

**Core loop:** a case file opens with a sequence like 🔴🔵🔴🔵🔴❓ or `3, 6, 9, 12, ?` → 4 answer cards appear → the child picks one → correct reveals the rule ("+3 each time") with an animation → wrong gives a magnifying-glass hint → 10 cases per round.

**Screens:** Menu → Case (sequence strip, answer cards, magnifier hint, case counter) → Results (stars, detective rank badge: Rookie / Sleuth / Master).

**Pattern types (procedurally generated)**

| Type | Example | Levels |
| --- | --- | --- |
| Repeating colour/shape (AB, ABC, AAB, ABB) | 🔴🔵🔴🔵 → 🔴 | Easy+ |
| Growing pattern | ⭐, ⭐⭐, ⭐⭐⭐ → 4 stars | Easy+ |
| Add a constant | 4, 8, 12, 16 → 20 | Easy+ |
| Subtract a constant | 50, 45, 40 → 35 | Medium+ |
| Multiply / doubling | 2, 4, 8, 16 → 32 | Medium+ |
| Two attributes change (shape and colour) | 🔴▲ 🔵■ 🔴▲ → 🔵■ | Medium+ |
| Alternating rule | +2, +3, +2, +3 | Hard |
| Missing middle item (not only the end) | 5, 10, ?, 20 | Hard |
| Rotation of a shape (0°, 90°, 180°) | Arrow turning | Hard |

**Rules & mechanics**

- Sequence length: 5–6 shown items. The missing item is the last one on Easy/Medium and can be anywhere on Hard.
- Distractors are plausible: wrong next item in the cycle, off-by-one-step number, right shape wrong colour.
- Hint (after 1 wrong pick): the repeating unit is circled, or the differences between numbers are shown (+4 +4 +4).
- Stars: first-try correct ≥ 9 = 3, ≥ 6 = 2, otherwise 1.

**Data model**

```js
/** @typedef {{ shape: 'circle'|'square'|'triangle'|'star'|'arrow', color: string, rotation?: number }} Token */
/** @typedef {{ type: string, items: (number|Token)[], missingIndex: number,
 *   answer: number|Token, options: (number|Token)[], ruleText: string }} Puzzle */
```

**Modules**

- `logic/generators/*.js` — one generator per pattern type, each implementing `{ id, levels, generate(rng) => Puzzle }`. Register new types without editing others (Open/Closed).
- `logic/generatorRegistry.js` — picks a type allowed for the level, avoids the same type twice in a row.
- `logic/equality.js` — compare numbers or tokens.
- `ui/TokenView.js` — draws tokens as SVG (shapes must also differ by outline, not only colour, for colour-blind players).

**Feedback:** correct = stamp "SOLVED!" on the case file and the rule text appears; wrong = magnifier wiggle and hint.

**Edge cases**

- Options must be unique and contain the answer exactly once.
- Numbers stay between 0 and 200.
- Token colours chosen from a colour-blind-safe palette.

**Acceptance criteria**

- [ ] Each generator unit-tested: answer matches the rule, options unique, ranges respected
- [ ] Adding a new generator file + registry entry needs no other change
- [ ] Hints differ by pattern type
- [ ] Keyboard keys 1–4 choose options
- [ ] Results show rank badge by stars

**Stretch ideas:** "Make your own pattern" for a friend to solve; 2D grid patterns (3 × 3 matrix with one missing).

## Game 10 — Lights Out (`lights-out`)

A grid of lanterns: tapping one toggles it and its four neighbours, and the child must switch every lantern off in as few taps as possible.

**Learning goal:** logical reasoning, cause and effect, planning, and persistence (try, observe, adjust).

**Core loop:** a puzzle loads with some lanterns lit → the child taps a lantern → it and its up/down/left/right neighbours toggle → the move counter rises → all lanterns off = solved → next puzzle. 5 puzzles per round.

**Screens:** Menu (grid size) → Puzzle (lantern grid, moves, par, Undo, Restart, Hint) → Solved overlay (stars, moves vs par) → Results after 5 puzzles.

**Rules & mechanics**

- Puzzles are always solvable: start from all-off and apply *k* random distinct taps; *k* becomes the par.
- Stars per puzzle: moves ≤ par = 3, ≤ par + 3 = 2, solved = 1.
- Undo (unlimited) and Restart are always available; neither costs stars on Easy.
- Hint: highlight one lantern that belongs to a solution, computed from the remaining state (solve via Gaussian elimination over GF(2) on Medium/Hard; on Easy, the recorded taps that are still needed).
- Fun theme: lanterns are fireflies in jars; when solved, fireflies fly away.

**Difficulty levels**

| Level | Grid | Random taps (par) |
| --- | --- | --- |
| Easy | 3 × 3 | 2–3 |
| Medium | 4 × 4 | 4–6 |
| Hard | 5 × 5 | 7–10 |

**Data model**

```js
/** @typedef {boolean[][]} Board  // true = lit */
/** @typedef {{ board: Board, par: number, solutionTaps: [number, number][], moves: number,
 *   history: [number, number][] }} PuzzleState */
```

**Modules**

- `logic/board.js` — `toggle(board, r, c)` returns a new board (immutable), `isSolved(board)`.
- `logic/puzzleGenerator.js` — `generate(size, taps, rng)`; makes sure the result is not already all-off.
- `logic/solver.js` — `solve(board)` returns a minimal set of taps using linear algebra mod 2. Comment the maths clearly (each tap = a vector, XOR = addition).
- `scenes/PuzzleScene.js` — DOM grid of buttons, CSS glow for lit state.

**Feedback:** each tap = soft "click" and glow change; solved = all jars sparkle and fireflies scatter.

**Edge cases**

- Corner and edge cells toggle only the neighbours that exist.
- Fast double-taps register as two taps (that's valid game input), but animations must not desync from state.
- Lit and unlit look different by brightness *and* an icon (firefly vs empty jar), not colour alone.

**Acceptance criteria**

- [ ] `toggle` unit-tested for centre, edge and corner cells
- [ ] Every generated puzzle is solvable and the solver finds a solution of ≤ par taps
- [ ] Undo restores the exact previous board
- [ ] Keyboard: arrow keys move focus, Space/Enter taps
- [ ] Stars use moves vs par

**Stretch ideas:** "Lights On" reverse mode; X-shaped toggle variant for experts.

## Game 11 — Flag & Capital Quest (`flag-capital-quest`)

The child travels the world in a little plane: each correct flag or capital answer "visits" that country and colours it in on a world map they slowly complete.

**Learning goal:** recognise flags, link countries to capitals and continents, and locate countries on a map.

**Core loop:** pick a continent → a question appears (flag → country, country → capital, or "tap the country on the map") → 4 options or a map tap → correct colours the country and adds a passport stamp → wrong shows the right answer with the country highlighted → 10 questions per trip.

**Screens:** World map hub (continents, % explored, passport button) → Trip (question card + options or zoomed continent map) → Trip results (stars, new stamps) → Passport (all stamps collected, with one fun fact each).

**Rules & mechanics**

- Question types unlock by level (see table). A country counts as "explored" after 2 correct answers about it.
- Distractors come from the same continent so options are not too easy (e.g. flags of neighbours).
- Map tap answers accept a tap inside the country's SVG path; tiny countries get an enlarged invisible hit circle (min 24 px radius).
- Stars: 9–10 correct = 3, 7–8 = 2, otherwise 1.
- Fun fact card (1 sentence) appears after every correct answer, from data, not generated.

**Difficulty levels**

| Level | Countries | Question types |
| --- | --- | --- |
| Easy | \~40 well-known countries | Flag → country (4 options) |
| Medium | \~100 countries | + Country → capital |
| Hard | All \~195 | + Tap the country on the map, + capital → country |

**Data model**

```js
/** @typedef {{ code: string, name: string, capital: string[], continent: string,
 *   flag: string, fact: string, level: 'easy'|'medium'|'hard', svgPathId: string }} Country */
/** @typedef {Record<string, { correct: number, explored: boolean }>} Progress  // by country code */
```

**Modules**

- `data/countries.json` — ISO 3166 alpha-2 codes; capitals and facts verified before release (a task for the human, flag it in the README).
- `assets/flags/*.svg` — local SVG flags (use an MIT-licensed set such as `flag-icons`). Do not rely on flag emoji: Windows does not render them.
- `assets/world.svg` — simplified public-domain world map (Natural Earth based) with one `<path id="IN">` per country.
- `logic/questionFactory.js` — builds questions by type with same-continent distractors.
- `logic/progress.js` — updates explored state and % per continent.
- `scenes/MapScene.js` — SVG map with pan/zoom (pointer drag + pinch + buttons), colours explored countries.

**Feedback:** correct = plane flies to the country, stamp "thunk", country fills with colour; wrong = correct country pulses with its name label.

**Edge cases**

- Countries with multiple capitals (South Africa, Bolivia) accept any listed capital; store `capital` as an array.
- Disputed territories: leave out of questions; keep the map neutral.
- Missing flag file → skip that country and log the code once.

**Acceptance criteria**

- [ ] Every country in JSON has a flag file and a map path (validation test)
- [ ] Distractors are from the same continent and never duplicate the answer
- [ ] Map tap works on small countries via enlarged hit areas
- [ ] Explored map and passport persist across reloads
- [ ] Pan/zoom works with touch, mouse wheel and +/− buttons

**Stretch ideas:** India states & capitals pack; "guess the country from its outline".

## Game 12 — Planet Hop (`planet-hop`)

The child first drags the planets into order from the Sun, then hops between them in a rocket to see how heavy they would feel and what each planet is like.

**Learning goal:** order of the planets, relative size and distance, gravity ("you'd feel lighter on Mars"), one key fact per planet.

**Game modes**

1. **Line them up:** 8 planets float scrambled; the child drags each into its orbit slot from the Sun outward. Wrong slot = the planet drifts back with a hint ("Mars is the 4th planet, the red one").
2. **Weigh-in:** the child enters their weight (or picks a toy: "a 20 kg dog") and hops planet to planet; a cartoon scale shows the felt weight.
3. **Planet quiz:** 10 questions ("Which planet has the biggest rings?", "Which is closest to the Sun?") with picture options.

**Screens:** Menu (3 modes) → Mode scene → Results (stars, "Space Cadet → Astronaut → Commander" badge).

**Gravity data (relative to Earth = 1.00, approximate)**

| Body | Gravity × Earth |
| --- | --- |
| Mercury | 0.38 |
| Venus | 0.91 |
| Earth | 1.00 |
| Moon (bonus) | 0.17 |
| Mars | 0.38 |
| Jupiter | 2.53 |
| Saturn | 1.07 |
| Uranus | 0.90 |
| Neptune | 1.14 |

Verify these values against the NASA Planetary Fact Sheet before release, and keep them in `data/planets.json`, never hard-coded.

**Rules & mechanics**

- Felt weight = entered weight × gravity factor, rounded to 1 decimal. Explain in kid language: "Your body is the same, but the planet pulls on you less/more".
- Weight input accepts 10–150 kg; it is never saved (privacy), only used in the session.
- Line-up stars: 0–1 wrong drops = 3, 2–3 = 2, more = 1. Quiz stars use the default accuracy rule.
- Sizes on screen are relative but clamped (Mercury min 24 px so it stays tappable); a toggle "Show real size" shows the true scale to make the point.

**Data model**

```js
/** @typedef {{ id: string, name: string, order: number, gravity: number, color: string,
 *   radiusKm: number, distanceAU: number, fact: string, img: string }} Planet */
/** @typedef {{ q: string, answerId: string, optionIds: string[] }} QuizItem */
```

**Modules**

- `logic/lineup.js` — `isCorrectSlot(planetId, slotIndex)`, `allPlaced(state)`.
- `logic/weight.js` — `feltWeight(kg, gravity)` with input validation (throws `GameError` on invalid input; the UI catches and shows a friendly message).
- `logic/quiz.js` — picks 10 questions from `data/quiz.json`, shuffles options.
- `ui/DragDrop.js` — shared module.
- `scenes/LineupScene.js`, `WeighScene.js`, `QuizScene.js` — one scene per mode.

**Feedback:** correct slot = planet locks into orbit and starts circling slowly; rocket hop = short whoosh animation; scale needle springs to the new value.

**Edge cases**

- Non-numeric or out-of-range weight shows "Please enter a number between 10 and 150".
- Pluto question: answer "dwarf planet" with a friendly fact rather than ignoring it.
- `prefers-reduced-motion` stops orbit animation.

**Acceptance criteria**

- [ ] Planet order and gravity come only from JSON (test checks 8 planets, orders 1–8)
- [ ] `feltWeight` unit-tested, including invalid input
- [ ] Weight is not written to storage
- [ ] Drag-and-drop works with touch, mouse and keyboard
- [ ] All three modes reachable and each ends on Results

**Stretch ideas:** "Jump height" on each planet; build-your-own solar system sandbox.

## Game 13 — Food Chain Builder (`food-chain-builder`)

The child draws arrows between living things in a habitat (grass → rabbit → fox) to build food chains and webs, then sees what happens when one species disappears.

**Learning goal:** producers, consumers (herbivore, carnivore, omnivore), energy flow direction, habitats, interdependence.

**Core loop:** a habitat loads (Forest, Ocean, Pond, Grassland, Desert) with 4–8 organism cards → the child drags from one organism to another to draw an arrow meaning "is eaten by" → taps Check → correct arrows turn green, wrong ones turn red with a reason → when all required links are present the chain "comes alive" (animation) → next habitat.

**Screens:** Habitat select → Builder (scene background, organism cards, arrow layer, Check, Eraser, Info button per card) → "What if?" challenge (Hard) → Results (stars, organisms learned).

**Rules & mechanics**

- Arrow direction follows energy flow: from food to eater (grass → rabbit). The info panel explains this before the first level.
- Each habitat lists required links and allowed links; extra correct links are fine, wrong links are marked.
- Wrong arrow message comes from data ("A rabbit doesn't eat a fox — check the arrow direction!" when reversed; "Frogs don't eat grass" when invalid).
- "What if?" (Hard): one organism is removed; the child predicts which others go up or down in number by tapping ↑ / ↓ on each card. Answers come from data, with simple 1-step rules.
- Stars: first Check with no wrong arrows = 3, ≤ 2 wrong = 2, otherwise 1.

**Difficulty levels**

| Level | Organisms | Structure | Extra |
| --- | --- | --- | --- |
| Easy | 3–4 | Single chain | Card labels show role (Producer / Herbivore) |
| Medium | 5–6 | Two chains sharing an organism | Roles hidden |
| Hard | 7–8 | Food web | "What if?" challenge |

**Data model**

```js
/** @typedef {{ id: string, name: string, role: 'producer'|'herbivore'|'carnivore'|'omnivore'|'decomposer',
 *   img: string, fact: string }} Organism */
/** @typedef {{ from: string, to: string }} Link  // from = food, to = eater */
/** @typedef {{ id: string, name: string, level: string, organisms: string[], required: Link[],
 *   allowed: Link[], whatIf?: { removed: string, effects: Record<string, 'up'|'down'|'same'> } }} Habitat */
```

**Modules**

- `data/organisms.json`, `data/habitats.json` — content reviewed for accuracy (flag for human review in README).
- `logic/linkChecker.js` — `check(userLinks, habitat)` returns `{ correct, wrong: [{ link, reason: 'reversed'|'invalid' }], missing }`.
- `logic/whatIf.js` — scores predictions against `effects`.
- `ui/ArrowLayer.js` — SVG overlay; pointer-drag draws a live line; drop on a card creates a link; tap an arrow + Eraser removes it.
- `scenes/BuilderScene.js` — card layout positions from habitat data.

**Feedback:** green arrows animate a flowing dot (energy moving); red arrows wiggle with a short reason; completed web plays a habitat ambient sound.

**Edge cases**

- Self-links and duplicate links are rejected silently.
- Arrow dropped on empty space is cancelled.
- Keyboard: select a source card with Enter, then a target card with Enter to create a link; Delete removes the focused arrow.

**Acceptance criteria**

- [ ] `linkChecker` unit-tested for correct, reversed, invalid, missing and duplicate links
- [ ] Every habitat's required links reference organisms in that habitat (data validation test)
- [ ] Arrows can be drawn and erased with touch, mouse and keyboard
- [ ] "What if?" works on Hard habitats
- [ ] Each card's Info shows role and fact

**Stretch ideas:** decomposers bonus (mushrooms, worms) closing the loop; Indian habitats pack (Sundarbans, Western Ghats).

## Game 14 — Plant Grower (`plant-grower`)

The child grows a plant from seed to flower over 7 in-game days by balancing water, sunlight and soil nutrients; too much or too little of anything makes it droop.

**Learning goal:** what plants need to grow, life cycle (seed → sprout → plant → flower → seed), cause and effect, and that "more" is not always better.

**Core loop:** pick a seed (sunflower, cactus, tomato, rice) → each day the child sets 3 sliders (Water, Sunlight, Fertiliser: 0–10) → taps "Next day" → the simulation updates health and growth → the plant animates its new stage with a status bubble ("I'm thirsty!") → after 7 days: flower + seeds if healthy.

**Screens:** Seed picker → Garden (pot with plant, 3 sliders, day counter, health meter, "Next day") → Day summary card (what changed and why) → Results (stars, plant journal with a drawing per day).

**Simulation rules (pure, deterministic)**

- Each plant type has an ideal range per need, e.g. sunflower water 5–7, cactus water 1–2, rice water 8–10.
- Daily need score = 1 if the slider is inside the ideal range, 0.5 if within 2 of it, 0 otherwise.
- Health (0–100) changes by: +10 × (sum of need scores − 2), clamped to 0–100. Start at 70.
- Growth stage advances when health ≥ 60 at the end of a day; stays if 30–59; plant wilts (visual) if < 30 but can recover.
- After day 7: health ≥ 80 = 3 stars, ≥ 60 = 2, otherwise 1. A plant never "dies"; at worst it says "Let's try again".
- Weather events (Medium+): a rainy day adds +3 water automatically; a cloudy day caps sunlight at 4. Shown in the morning so the child can adjust.

**Difficulty levels**

| Level | Seeds | Weather | Feedback detail |
| --- | --- | --- | --- |
| Easy | Sunflower | None | Ideal range marked on sliders |
| Medium | + Tomato, Cactus | Rain / cloud events | Hint bubble only |
| Hard | + Rice | Events + heat wave (needs more water) | No hints; journal explains after |

**Data model**

```js
/** @typedef {{ id: string, name: string, ideal: { water: [number, number],
 *   sun: [number, number], food: [number, number] }, stages: string[], fact: string }} PlantType */
/** @typedef {{ day: number, health: number, stage: number, history: DayLog[] }} PlantState */
/** @typedef {{ day: number, inputs: { water: number, sun: number, food: number },
 *   weather: string, healthChange: number, message: string }} DayLog */
```

**Modules**

- `data/plants.json` — plant types, ranges, stage images.
- `logic/simulation.js` — `nextDay(state, inputs, plantType, weather)` returns a new state + `DayLog`. Document the formula in comments.
- `logic/weather.js` — seeded weather for the 7 days.
- `logic/messages.js` — maps the worst-scoring need to a kid-friendly message.
- `scenes/GardenScene.js` — SVG plant with CSS transitions between stages; sliders are native `<input type="range">` styled large.

**Feedback:** happy plant sways and smiles; thirsty plant droops with a water-drop thought bubble; over-watered shows a puddle; too much sun shows a sweat drop.

**Edge cases**

- Health is always clamped 0–100.
- Sliders keep yesterday's values by default so the child adjusts instead of resetting.
- Same seed + same inputs always give the same result (deterministic for tests).

**Acceptance criteria**

- [ ] `nextDay` unit-tested for in-range, near-range, out-of-range and clamping
- [ ] Each plant type can reach 3 stars with ideal inputs (test)
- [ ] Weather is shown before the child sets sliders
- [ ] Journal shows one entry per day with the reason for change
- [ ] Sliders operable by keyboard (arrow keys) and touch

**Stretch ideas:** grow a garden of 3 plants at once; photosynthesis mini-explainer animation.

## Game 15 — Simon Says: Colours & Sounds (`simon-says`)

Four coloured pads light up and play notes in a growing sequence; the child repeats it, and each success adds one more step.

**Learning goal:** working memory, attention, auditory and visual sequencing, and basic music (the pads are notes of a scale).

**Core loop:** the game plays a sequence of length *n* (starting at 3) → input unlocks → the child taps the pads in order → correct full sequence = *n* + 1 and a new note is added → a wrong tap replays the sequence once ("Listen again!") → a second wrong tap ends the round, and the score is the longest sequence completed.

**Screens:** Menu (mode + level) → Play (4 large pads in a circle or 2 × 2, centre display with current length, Replay button) → Results (longest sequence, personal best, stars).

**Rules & mechanics**

- Pads: Red = C4, Blue = E4, Green = G4, Yellow = C5 (a major chord, so any sequence sounds pleasant).
- Each pad also has a unique shape (circle, square, triangle, star) and a number 1–4 for colour-blind players and keyboard play.
- Playback timing: note on 500 ms + gap 150 ms on Easy; speeds up 5% every 3 rounds, down to 250 ms min.
- Input timeout: 5 s between taps on Easy/Medium, 3 s on Hard. A timeout counts as a wrong tap.
- Replay button (1 per round) plays the sequence again without penalty.
- Stars by longest sequence: Easy 8+ / 5+ / any; Medium 10+ / 7+ / any; Hard 12+ / 9+ / any.

**Modes**

| Mode | Description |
| --- | --- |
| Classic | Sequence grows by one each round |
| Reverse (Hard) | Repeat the sequence backwards |
| Music Maker | Free play: tap pads to compose, record up to 16 notes, play back (no score) |

**Difficulty levels**

| Level | Start length | Pads | Note duration |
| --- | --- | --- | --- |
| Easy | 3 | 4 | 500 ms |
| Medium | 4 | 4 | 400 ms |
| Hard | 4 | 6 (adds Purple = A4, Orange = D5) | 350 ms, Reverse mode unlocked |

**Data model**

```js
/** @typedef {{ id: number, color: string, shape: string, freqHz: number, key: string }} Pad */
/** @typedef {{ sequence: number[], inputIndex: number, phase: 'playing'|'input'|'retry'|'over',
 *   lives: number, best: number }} SimonState */
```

**Modules**

- `logic/simonState.js` — pure state machine: `start()`, `addStep(rng)`, `press(padId)` returns `'ok'|'roundComplete'|'retry'|'gameOver'`.
- `services/AudioService.js` (engine) — add a `playTone(freqHz, ms)` method using an `OscillatorNode` with a short attack/release envelope to avoid clicks.
- `logic/sequencePlayer.js` — async playback with `await sleep(ms)`; cancellable via `AbortController` when the player leaves the scene.
- `scenes/SimonScene.js` — pads as large DOM buttons; lit state via CSS class.

**Feedback:** each pad flashes bright and plays its note; round complete = rising arpeggio; retry = soft "hmm" tone and the centre says "Listen again!".

**Edge cases**

- Input is blocked during playback; taps are ignored, not queued.
- Browsers need a user gesture before audio: start the `AudioContext` on the Start button tap.
- Muted mode still works with visuals only.
- Leaving the scene mid-playback cancels timers (no sounds after exit).

**Acceptance criteria**

- [ ] State machine unit-tested: correct input, wrong once, wrong twice, timeout, reverse mode
- [ ] Notes play without clicks on Chrome and Safari (iPad)
- [ ] Keyboard 1–4 (1–6 on Hard) plays pads
- [ ] Personal best persists
- [ ] Playback stops cleanly when leaving the game

**Stretch ideas:** "Twinkle Twinkle" song-learning mode that teaches a melody phrase by phrase; animal sounds pack.

## Game 16 — Spot the Difference (`spot-the-difference`)

Two scenes sit side by side and the child taps the differences. Scenes are built from SVG objects, and the differences are generated by code, so there are endless puzzles and no hand-drawn image pairs are needed.

**Learning goal:** visual attention, observation, and vocabulary for describing changes (colour, size, missing, flipped, moved).

**Core loop:** a scene pair loads → the child taps a spot on either picture → a hit circles the difference on both pictures and names it ("The bird changed colour") → a miss shows a small ✖ and costs 3 s from the timer bonus → find all differences to finish → 5 scenes per round.

**Screens:** Menu (theme + level) → Play (two canvases/SVGs side by side in landscape, stacked in portrait; found counter; Hint; timer) → Results (stars, time, difference types found).

**How scenes and differences are generated**

- A theme (Park, Kitchen, Beach, Classroom, Space) defines a background and a pool of 20–30 object templates (tree, bird, cup, cloud) drawn as SVG `<g>` groups.
- `sceneBuilder` places 12–18 objects at non-overlapping positions (seeded RNG).
- `differenceMaker` picks *k* objects and applies one mutation each: `recolor`, `remove`, `add`, `resize` (±30%), `flip`, `move` (≥40 px), or `rotate` (≥25°).
- Each difference stores its bounding box; the hit area is that box + 16 px padding (and at least 48 × 48 px).
- Mutations must be clearly visible: recolor picks a hue at least 90° away and different in lightness; tiny objects (< 30 px) are not used.

**Rules & mechanics**

- Tap either picture; hit testing uses the same coordinates on both.
- Hint (2 per round): a soft spotlight pulses over the region of one unfound difference.
- Stars per scene: found all with ≤ 1 miss and under target time = 3; ≤ 3 misses = 2; otherwise 1.
- A cooldown of 300 ms after a miss stops random spam-tapping from finding things.

**Difficulty levels**

| Level | Differences | Objects in scene | Mutations used | Target time |
| --- | --- | --- | --- | --- |
| Easy | 3 | 12 | recolor, remove, add | 60 s |
| Medium | 5 | 15 | + resize, flip | 90 s |
| Hard | 7 | 18 | + move, rotate, subtle recolor | 120 s |

**Data model**

```js
/** @typedef {{ id: string, template: string, x: number, y: number, scale: number,
 *   color: string, flip: boolean, rotation: number }} SceneObject */
/** @typedef {{ objectId: string, type: 'recolor'|'remove'|'add'|'resize'|'flip'|'move'|'rotate',
 *   box: { x: number, y: number, w: number, h: number }, label: string, found: boolean }} Difference */
/** @typedef {{ left: SceneObject[], right: SceneObject[], differences: Difference[] }} PuzzlePair */
```

**Modules**

- `data/themes/*.json` — background + object template list per theme; `assets/objects/*.svg` templates.
- `logic/sceneBuilder.js` — non-overlapping placement (rejection sampling with a max-attempts guard that throws `GameError`).
- `logic/mutations/*.js` — one file per mutation type, each `{ type, canApply(obj), apply(obj, rng) }` (Open/Closed: add mutations without touching others).
- `logic/differenceMaker.js` — chooses objects and mutations for the level; difference boxes never overlap.
- `logic/hitTest.js` — `findDifferenceAt(point, differences)`.
- `scenes/SpotScene.js` — renders both sides from data with the same renderer.

**Feedback:** hit = circle draws itself on both pictures + "ding" + label text; miss = small ✖ fades out; all found = confetti and both pictures do a little bounce.

**Edge cases**

- Both pictures scale together on resize; hit areas use scene coordinates, not screen pixels.
- A difference already found cannot be counted twice.
- If placement fails (too crowded), regenerate with a new seed; after 3 failures show the error screen and log the theme.

**Acceptance criteria**

- [ ] Generated pairs always have exactly *k* non-overlapping, visible differences (tested over 500 seeds per level)
- [ ] Each mutation type unit-tested
- [ ] Tapping either picture works; hit areas are at least 48 × 48 px
- [ ] Same seed produces the same puzzle (daily puzzle support)
- [ ] Keyboard: a movable crosshair (arrow keys) and Enter to tap

**Stretch ideas:** "Daily puzzle" with a date-based seed; let the child make a puzzle for a friend by changing objects themselves.
