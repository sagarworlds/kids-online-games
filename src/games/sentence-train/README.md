# Sentence Train (`sentence-train`)

Word carriages arrive scrambled on a siding. The child drags them behind the engine in the right order, then blows
the whistle to send the train out of the station.

**Learning goal:** sentence structure and word order, capital letters and punctuation, word order in questions.

## How to play

1. Pick a level. A round is 8 sentences and 2 hints. The first word of a sentence keeps its capital letter and the last
   one carries the full stop, question mark or exclamation mark: those are the clues.
2. Move carriages from the **siding** onto the **track**: drag them, or tap them (or press Enter) to put one in the first
   empty slot.
3. On the track a carriage can be dragged to another slot, dropped on another carriage to **swap**, dragged back to the
   siding, or tapped (Enter) to send it back. With the keyboard, the left and right arrows move a focused carriage one
   slot along.
4. The **whistle** only works once every slot is full. A wrong sentence marks the first misplaced carriage with a red
   outline **and** a cross, and says what to look at. The child can try again twice; a third wrong whistle lays out the
   answer and moves on.
5. **Hint** (2 per round, shared by all sentences) locks the next correct carriage into place with a padlock.
6. A correct sentence: whistle, the train chugs out of the station, and the sentence is read aloud (if read-aloud is on).

| Level | Words | Sentences | Extra carriage |
| --- | --- | --- | --- |
| Easy | 3–5 | Simple statements | None |
| Medium | 5–7 | Adds questions, exclamations and adjectives | None |
| Hard | 7–10 | Adds clauses with because / and / but | One word that does not belong, which must stay on the siding |

Stars: sentences right on the **first whistle** — 7 or more = 3 stars, 5 or more = 2, otherwise 1.

## Rules worth knowing

- **More than one correct order.** A sentence can list `alternatives`; the checker accepts the main order or any
  alternative, and compares a wrong track with the order it is *closest* to, so the cross is never put on a carriage that
  is right for an accepted order. Alternatives use exactly the same carriages (checked when the data loads), so they are
  limited to sentences such as "Mia and Ben ride bikes." / "Ben and Mia ride bikes." (a capital letter and a full stop
  stay on the same carriages).
- **The scramble is never the answer**, for any accepted order, and on Hard the real words are never already in order
  with the extra carriage merely sitting among them. The check is on the *words*, so two carriages that look the same
  (the same word twice) can swap freely and are still correct.
- **Mistakes are typed:** *punctuation* when the capital letter or the end mark was ignored (the first carriage is not
  capitalised, or the last carries no full stop or question mark), *extra* when the extra Hard carriage is on the track,
  otherwise *order*. Results show the totals by type.
- **Long words** shrink a little (never below 18 px) and past that the carriage gets wider.
- A locked (hinted) carriage cannot be moved, and nothing can be dropped on a locked slot.

## Sentence data (`data/sentences.json`)

103 sentences: 34 easy, 34 medium (with questions) and 35 hard (each with an extra word). Checked when the game loads: the
first word is capitalised, the last ends the sentence and no other word does, the word count fits the level, alternatives
are the same carriages reordered, a Hard sentence has one lowercase extra word that is not in it, ids are unique, and
there are at least 30 sentences per level. Pictures are emoji where one fits.

**Needs a human before release:** that each sentence reads naturally and suits 8 to 10 year olds, that each Hard extra
word really does not fit (it was chosen to be an unrelated word so no second valid sentence exists), and that the emoji
suit their sentences.

## Reused engine code

Dragging uses the shared `src/engine/ui/DragDrop.js` (also used by Shop Keeper): a pointer drag with snap-back, plus
tap and Enter as the keyboard alternative. This game adds only the track and siding rules (`logic/board.js`).

## File map

```
index.html, main.js, style.css    Page, composition root (routes + data loading), styles
scenes/                           MenuScene, StationScene, ResultScene (+ TrainScene base with routes and data)
ui/Carriage.js                    A carriage as a button (cross for wrong, padlock for hinted)
logic/                            Pure rules, no DOM (all unit-tested):
  board.js                        Track and siding: place, swap, remove, nudge, hint, show the answer
  checker.js                      check(slots, entry) -> { ok, firstWrongIndex, type }
  scrambler.js, sentences.js      Never-correct scramble, data validation and picking
  levels.js, scoring.js
```

## Not yet verified

Tested in headless Chromium (desktop and a phone-sized viewport with touch): full Easy round with mouse drags, Enter,
taps, swap, drag-back, arrow keys, hints, a wrong whistle, retries and the answer being shown, and a Hard sentence with
the extra carriage, across several random seeds. Not tried on a real touch device or Safari, and read-aloud has not been
heard with a real voice.
