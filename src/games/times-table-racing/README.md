# Times-Table Racing (`times-table-racing`)

Each correct multiplication answer drives the child's car 1/20 of the way along a track, racing a ghost car that
replays their own best run. The race ends after 20 correct answers.

**Learning goal:** automatic recall of the 2 to 12 times tables, concentrating on the facts the child gets wrong most.

## How to play

1. Pick a level and the tables to practise ("Mixed" is all of the level's tables; tap a number to choose just some).
2. After "Ready, set, go", a question appears (`7 × 8 = ?`). Tap one of four answers, or press the key **1 to 4**.
   On **Hard** you type the answer and press Enter, and some questions hide a factor (`? × 6 = 42`).
3. Right: the car speeds forward. Wrong: the car wobbles for a second while the right fact is shown (`7 × 8 = 56`),
   and that fact comes back a few questions later.
4. Cross the finish line (20 right answers) and the time is compared with the ghost. Escape pauses the clock.

| Level | Tables | Answers | Starter ghost |
| --- | --- | --- | --- |
| Easy | 2, 5, 10 | 4 buttons | 1 answer every 5 s |
| Medium | 2 to 10 | 4 buttons | 1 answer every 4 s |
| Hard | 2 to 12, plus missing factors | Type it | 1 answer every 3 s |

## The ghost

The ghost is the child's own best run for that level and table choice, saved as the time of each of its 20 correct
answers and replayed to the millisecond (`ghostProgressAt` steps forward exactly at each saved time). Until there is a
best run it is a starter ghost at the level's pace. A slower run never replaces the saved ghost, so it only gets
harder to beat. A damaged saved ghost (wrong length, negative or backwards times) is ignored: the game logs which key
was damaged and falls back to the starter ghost.

## Stars and results

Stars by time against the ghost: **beat it = 3**, **within 5 s behind = 2**, **finished = 1**. The results show the
time, the ghost's time, how far ahead or behind, how many facts were right first time, and a strip with each table's
accuracy (`7/9`) and a word (Strong, Nearly, Practise), so it is never colour alone.

## Practice that adapts

- A fact missed the first time it is asked in a race gets **3 times the weight** (up to 27×) in future races, and is
  saved with the child's data. A fact answered right first time halves its extra weight, so facts that are learned fade
  back to normal.
- Weights change at most once per fact per race; a retry or a later lucky answer neither hides a miss nor punishes it
  twice.
- 6 × 7 and 7 × 6 are **one fact** for weights and accuracy, but the question shows either order at random.
- The picker never asks the same fact twice in a row, and a missed fact returns after three other questions.

## Answer options

The three wrong buttons are near misses: the answer plus or minus one of the two numbers (one group too many or too
few), the answer with its last two digits swapped (56 → 65), and the answer plus or minus 1. All four options are
different whole numbers above zero, shuffled. The test checks every fact from 2 × 2 to 12 × 12 in all three forms.

## Design notes

- The track is drawn on the canvas behind the screen; the question and answers are ordinary buttons and an input, so
  they work with a keyboard, a screen reader and touch. The car's position never moves backwards and glides to its spot.
- Meaning never depends on colour alone: the player's car is labelled "You", the ghost is see-through with a dashed
  outline and labelled "Ghost", and a wobbling car shows a cross. With *reduce motion* the wobble, speed lines and
  scrolling scenery are turned off.
- The "vroom" and tyre "squeak" are synthesised like the game's other sounds, so there are no audio files.
- The clock includes the second spent looking at a wrong answer: that is the cost of a mistake.

## File map

```
index.html, main.js, style.css    Page, composition root (routes), styles
scenes/                           MenuScene, RaceScene, ResultScene (+ RacingScene base with routes)
ui/                               TrackRenderer (canvas), AnswerPanel (question, 4 buttons or typing)
logic/                            Pure rules, no DOM (all unit-tested):
  facts.js, distractors.js        Facts and questions, the four answer options
  questionPicker.js, weights.js   Weighted picking, retries, saved weights
  ghost.js, saveData.js           Ghost replay, validation, and what is saved per level and table choice
  race.js                         One race: answers, progress, accuracy, summary
  levels.js, scoring.js
```

## Not yet verified

Tested in headless Chromium (desktop and a phone-sized viewport with touch): full Easy and Hard races, keys 1 to 4,
typing, pause, a wrong answer and its retry, the saved ghost being replayed and not replaced by a slower run, and
three random seeds. Not tried on a real touch device or Safari, and the engine and tyre sounds have not been listened
to on real speakers.
