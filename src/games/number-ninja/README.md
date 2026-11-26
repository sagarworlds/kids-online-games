# Number Ninja (`number-ninja`)

Maths problems fall from the sky as stars. The child types each answer and presses Enter
(or taps the on-screen pad) before the star lands.

**Learning goal:** fluency in addition, subtraction, multiplication and simple division (grades 3–5).

## How to play

1. Pick a level and the kinds of sums to practise, then press **Start**.
2. Type the answer and press **Enter** (or **✔** on the pad). The lowest matching star is sliced.
3. A wrong answer costs nothing but resets your streak; after two wrong tries in a row you get a hint.
4. A star that reaches the ground cracks one of your 5 shields and shows its answer for 1.5 s.
5. The round ends after 20 stars, or when the shields run out. Stars (1–3) come from accuracy.

Keyboard: digits, Backspace, Enter, Esc to pause. The game also pauses when the tab is hidden.

## Levels

| Level | Operations | Numbers | Fall time (start → fastest) | On screen |
| --- | --- | --- | --- | --- |
| Easy | + − | 0–20, never negative | 12 s → 9 s | 2 |
| Medium | + − × | up to 100, × tables 2–5 | 10 s → 7 s | 3 |
| Hard | + − × ÷ | up to 500, tables 2–12, exact division | 8 s → 5 s | 3 |

Fall speed rises 5% after every 5 correct answers and never goes past the level's fastest time.
Points per correct answer are `10 + 2 × streak`, capped at 30.

## File map

```
index.html            Page that boots the game
main.js               Composition root: creates services, wires scenes via `routes`
style.css             Game styles (menu, play panel, number pad, results)
scenes/
  NinjaScene.js       Base class: a Scene that can navigate through `routes`
  MenuScene.js        Level + operation choice, best stars
  PlayScene.js        Canvas drawing, input, HUD, pause, feedback (no game rules)
  ResultScene.js      Stars, stats, "hardest problem" replay; saves progress
ui/NumberPad.js       On-screen 0–9, backspace, enter (56 px keys)
logic/                Pure rules, no DOM or timers (all unit-tested)
  levels.js           Level table (ranges, fall times, operations)
  problemGenerator.js generateProblem(level, ops, rng, recent): ranges, exact division, no repeats in 5
  round.js            NinjaRound: spawning, falling, landing, scoring, speed-up, end conditions
  scoring.js          scoreAnswer(streak), accuracyOf(), starsFor(accuracy)
  answerMatcher.js    findTarget(): the lowest star with the typed answer
  answerInput.js      Typed-answer buffer: no leading zeros, max 4 digits
  hints.js            Strategy hints, spoken and printed problem text
```

Tests live in `tests/number-ninja/`.

## Notes

- Answers are never negative on any level, and `0` is a valid answer (for example `5 − 5`).
- The canvas is hidden from assistive technology; a visually hidden list mirrors the stars on
  screen, and an `aria-live` region announces right, wrong and landed answers.
- Colour is never the only signal: urgent stars carry a "!" badge, wrong answers show ✖ text,
  right answers show ✔, and cracked shields have a different shape.
- With `prefers-reduced-motion`, slicing, sparks, shakes and twinkling are turned off.

## 3D view

On a device that can do WebGL 2 the sky is 3D. A **3D view / 2D view** button on the menu switches and remembers the choice. The sums, the lanes, the
falling and landing, the typing and the number pad, the hints, the scores, the shields, the stars and the saved progress are the same code as 2D
(`NinjaRound` and the play scene; the 3D play scene extends `PlayScene` and only replaces how the sky is drawn), so a round plays and scores the same in both views.

- **The stars** are chunky gold solids that **spin** as they fall, with the sum on a plate under each (a star in the last quarter of its fall gets a red
  frame and a "!" badge, as in 2D, so the warning is a shape and not only a colour). A right answer **splits the star in two**: the halves are cut
  from the star's own outline, fly apart, tip and fade, in a burst of sparks, with "✔ +10" floating up. A star that lands cracks a shield and its
  answer shows on a plate for a moment ("✖ 7 + 9 = 16"), with a small red burst.
- **The camera is fixed.** A falling game must not be turned away from the child, so there is no turning or zooming here (unlike the other 3D versions);
  the 3D is in the stars. The sky fills the same box the flat sky does (between the header and the answer panel) and takes no taps: the game is
  played with the keys and the number pad, as before.
- **Everything the picture shows is in the page too**: the list of stars for screen readers, the live announcements ("Correct! Plus 10 points", "A star
  landed. 7 + 9 = 16"), the answer box and the hints. "Ready…" and "Go!" are drawn in the sky.
- **If 3D cannot run**: no WebGL 2 means no 3D button; if the 3D file will not load, the flat round opens. If 3D cannot start, or the graphics are lost
  *in the middle of a round*, the round does not restart: the flat sky is drawn again on the game canvas from the same round, with the same stars
  falling, score, streak and shields, and the next rounds are flat too for the rest of the visit. That only lasts for the visit; it does not change the
  saved choice.
- **On a phone** the 3D sky is the same box as the flat sky (so on the smallest phones, where the header and the pad leave a short box, the sky is short
  in either view). With "less motion" the stars do not spin or wobble, and a right answer shows the score without slicing or sparks. three.js is loaded
  with `import()` only when the 3D round opens.

Files: `logic/look3d.js` (where a star is in the picture, the outline of a star and its two halves, the motion of the halves, sparks and floating score),
unit-tested in `tests/number-ninja/look3d.test.js`; and `three/` (`StarField3D`, `Play3DScene`).

## Stretch ideas (not built)

A "boss star" with a two-step problem; a daily challenge with a fixed seed (the round already
takes an injected RNG, so this only needs a seed source); a practise-mistakes mode.
