# Pattern Detective (`pattern-detective`)

The child is a detective. Each case is a sequence of shapes, colours or numbers with one item missing, and they pick what
comes next from four answer cards.

**Learning goal:** pattern recognition, number sequences (skip counting, doubling) and logical reasoning.

## How to play

1. Pick a level. A round is 10 cases.
2. Look at the case file, work out the rule, and pick a card: tap it, or press the key **1 to 4**.
3. Right: the answer drops into the gap, a **SOLVED!** stamp lands on the file, and the rule is written out ("Add 4 each
   time"). Wrong: the card is crossed out, the magnifying glass wiggles, and a hint for *that kind of pattern* appears.
   You can keep picking until you find the right one; only a right pick on the **first** try counts for stars.

Stars: cases solved with the first pick — 9 or more = 3, 6 or more = 2, otherwise 1. The detective **rank** on the results
screen follows the stars: 1 = **Rookie**, 2 = **Sleuth**, 3 = **Master**.

## The cases

Every case is made by a generator in `logic/generators/`, each one a small file that exports `{ id, levels, generate }`.

| Type | Example | Levels |
| --- | --- | --- |
| Repeating colour or shape (AB, AAB, ABC, ABB) | 🔴🔵🔴🔵 → 🔴 | Easy, Medium, Hard |
| Growing groups | ⭐, ⭐⭐, ⭐⭐⭐ → four stars | Easy, Medium, Hard |
| Add a constant | 4, 8, 12, 16 → 20 | Easy, Medium, Hard |
| Subtract a constant | 50, 45, 40 → 35 | Medium, Hard |
| Double or triple | 2, 4, 8, 16 → 32 | Medium, Hard |
| Two things change (shape and colour) | red ▲, blue ■, red ▲ → blue ■ | Medium, Hard |
| Jumps that take turns | +2, +3, +2, +3 | Hard |
| Gap in the middle | 5, 10, ?, 20, 25 | Hard |
| Turning arrow | arrow turning a quarter turn each time | Hard |

Each case shows 5 or 6 items. The missing one is the last on Easy and Medium and can be anywhere (with enough of the
pattern still visible) on Hard.

**To add a new kind of case:** write a generator file and add it to the list in `logic/generatorRegistry.js`. Nothing else
changes; the registry picks a type allowed at the level and never the same type twice in a row, and a test shows it takes
any list of generators.

## Rules worth knowing

- **Fair puzzles.** A test checks that for every number case, the right answer is the *only* number that makes the whole
  sequence follow a simple rule (same jump, jumps taking turns, same ratio), so no case has two defensible answers.
  Repeating patterns always show one full unit before the gap, and each attribute of a two-attribute case can be worked
  out from items before it.
- **Plausible wrong cards.** Each case offers one of each kind of natural mistake: a whole step too many or too few, being
  one out, adding the last jump instead of multiplying, the wrong next item in the cycle, the right shape in the wrong
  colour, and so on. The four cards are always different, include the answer once, and stay between 0 and 200.
- **Hints differ by type.** Repeating: the unit is circled. Numbers: the jump between neighbours is written (+4 +4 +4).
  Doubling: the ratio (×2). Growing: the size of each group. Arrow: its angle each time. Two attributes: look at shape and
  colour separately. The hint never writes anything for the hidden item.
- **Colour-blind safe.** Token colours are the Okabe–Ito palette, and every colour also has its own pattern drawn on the
  shape (dots, stripes, hatching), so two shapes of the same outline always differ by more than colour. Screen readers are
  told each item in words ("orange circle", "3 sky stars", "red arrow pointing right").

## File map

```
index.html, main.js, style.css    Page, composition root (routes), styles
scenes/                           MenuScene, CaseScene, ResultScene (+ DetectiveScene base with routes)
ui/                               TokenView (SVG shapes with patterns), ItemView, typeNames
logic/                            Pure rules, no DOM (all unit-tested):
  generators/                     One file per kind of case, plus helpers (palette, option builders)
  generatorRegistry.js            Which types each level allows, picking, rounds
  equality.js, puzzle.js          Comparing items, the Puzzle and Hint shapes
  levels.js, scoring.js           Levels, stars, ranks
```

## Not yet verified

Tested in headless Chromium (desktop and a phone-sized viewport with touch) with a small solver that reads each case the
way a child would: wrong picks and hints, keys 1 to 4, a whole round on every level, and several random seeds. The
patterns have been checked for clarity by tests, not by a child: it is worth watching a real 8 to 10 year old try Hard.
Not tried on a real touch device or Safari.
