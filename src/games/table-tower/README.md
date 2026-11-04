# Table Tower

Climb a tower where every floor is one times table, from 1 to 30. Clearing a floor opens the next. For ages 8–10. Works
with touch, mouse and keyboard, and offline once loaded.

Nobody remembers 17 × 6 by rote, so the game teaches the **mental split** that makes big tables easy: 17 × 6 is
(10 × 6) + (7 × 6) = 60 + 42 = 102.

## How to play

1. Pick a level. Each level is ten floors: **Easy** floors 1–10, **Medium** 11–20, **Hard** 21–30. The first floor of every
   level is open; the others open one at a time.
2. Tap a floor. Each floor has three things to do:
   - **Learn**: cards for the table. *Count in jumps* is a number line where a frog hops 17, 34, 51 ... with an arc for each jump.
     *Split the sum* is a grid picture, with a number of rows you choose, cut into tens and ones, with the working written
     under it. Floors **11, 19 and 25** also have a **trick card**: ×11 (write the digit twice: 11 × 7 = 77), ×19
     (19 × n = 20n − n) and ×25 (n hundreds, shared into 4).
   - **Practice**: *fill the ladder*. Each rung is the next multiple (17, 34, 51 ...). Easy shows the "+17" jump between
     rungs. A wrong number gets a nudge ("Jump 17 more: 34 + 17 = ?"), and after three misses on one rung it is filled in
     and shown so nobody is stuck. Stars: no mistakes 3, up to 2 mistakes 2, otherwise 1.
   - **Challenge**: 12 questions against the clock, mixing all ten facts of the floor with two from floors you cleared
     before (the ones you find hardest come up more). **Easy** is four answers to choose from (keys 1–4), **Medium and Hard**
     are typed, and on **Hard** a quarter of the questions hide a factor (`17 × ? = 102`). The clock stops while you read the
     working after a miss. 90% right is 3 stars and 70% is 2 (at least **9 of 12** to clear the floor).
3. **Revision** (above the tower) brings back facts you have met: the ones that are due first, weakest first. A fact you miss
   comes back a few questions later in the same round. It opens after your first Challenge.

| Level | Floors | Challenge answers | Time for 12 questions |
|-------|--------|-------------------|-----------------------|
| Easy | 1–10 | choose from 4 | 96 s (8 s each) |
| Medium | 11–20 | type it | 120 s |
| Hard | 21–30 | type it, some with a hidden factor | 168 s |

## How revision remembers

Every fact has a **box** from 0 to 5, saved with the child's progress. 6 × 7 and 7 × 6 are one fact, so there are 255
different facts in the tower, not 300. The **first** answer to a fact in a round counts: right moves it up a box, wrong drops it
to box 0 and it is due straight away. A fact in box 1, 2, 3, 4 or 5 is due again after 1, 3, 7, 14 or 30 days. A fact that
was never asked is not included in Revision, and in a Challenge it is a little more likely than a fact in box 5 to be picked
for review, and much less than one just missed (11 against 4 against 1). Days are the player's own calendar days.

Damaged saved data never stops the game: a bad entry is dropped by itself and named in the console.

## How it is built

- `logic/` is pure (no DOM, storage, timers or `Math.random`; a seeded `rng` and today's day number are passed in):
  `facts` (the 255 facts), `splits` (the split, the working text and the trick cards), `questions` (the question, the four
  choices that are near misses, reading a typed answer), `ladder`, `memory` (the boxes), `session` (the question lists and
  `QuizSession`, which is fed time by the scene), `scoring` and `levels`.
- `tests/table-tower/` checks, for example, that every fact of every floor works in all question forms, that the split parts
  always add up, that each trick ends on the right answer for every multiplier, and the revision rules.
- `ui/NumberLine.js` and `ui/SplitGrid.js` draw the Learn pictures with SVG and CSS (no image files). `scenes/` has the
  tower, a floor, Learn, the ladder, the Challenge / Revision and the results (with the working for every missed fact).
- There is no data file: the tables are calculated.

## Notes for the reviewer: needs a human check

- The **wording of the tricks and the split explanations** should be read by a teacher: is "write the digit twice" the way
  your child's school teaches ×11, and is splitting 25 as 20 + 5 the way you would?
- The **revision intervals** (1, 3, 7, 14 and 30 days) and the Challenge pass mark (9 of 12) are sensible starting values,
  but they are guesses until a child has played for some weeks.
- Typing on a real phone keyboard (numeric keypad), touch on real devices, and the spoken questions (browser voices, only when
  "read aloud" is on in the grown-ups settings) have not been tried on devices.
