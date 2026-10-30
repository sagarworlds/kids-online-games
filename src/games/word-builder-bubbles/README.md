# Word Builder Bubbles (`word-builder-bubbles`)

Letters float in bubbles in an underwater scene. The child looks at a picture and a clue and pops the bubbles in the
right order to spell the word.

**Learning goal:** spelling, letter order, phonics, and linking a picture to its word.

## How to play

1. Pick a word pack (Animals, Food, Home, School, Nature) and a level. A round is 10 words and 3 hints.
2. Read the clue, look at the picture, and watch the row of empty slots: the next one is outlined with a dashed border
   and pulses.
3. Pop the bubble with the next letter: tap it, or type the letter. It flies up into its slot. A wrong letter (a decoy,
   or a letter that comes later in the word) wobbles and floats away, and a new bubble with that letter drifts back
   after a moment, so the word can always be finished.
4. 🔊 reads the word aloud (where the browser can speak; silent otherwise). 💡 **Hint** makes the next correct bubble
   glow with a dashed gold ring for 2 seconds (3 per round, shared across the words).
5. When the word is complete the picture bounces, the word is read aloud (if read-aloud is on), and **Next word**
   appears.

| Level | Words | Decoys | Bubble speed | Help |
| --- | --- | --- | --- | --- |
| Easy | 3–4 letters (cat, frog) | 2 | 40 px/s | Picture and clue, first letter filled in |
| Medium | 5–6 letters (plant, rabbit) | 3 | 70 px/s | Picture only; **Show clue** reveals the clue |
| Hard | 7–9 letters (elephant) | 4, look-alike letters (b/d, m/n) | 100 px/s | Clue words only (the picture appears when the word is done); bubbles bounce off each other |

## Rules worth knowing

- **Only the next letter counts.** Any other bubble is a mistake, including a letter that is in the word but not next.
  Repeated letters (apple) each get their own bubble and any matching one counts.
- **Decoys are never letters of the word**, so a decoy is always really wrong. On Hard they are chosen first from
  letters that look like letters in the word.
- **Bubbles never spawn overlapping** and always start fully inside the sea; if the area is too tight for random
  placement a grid is used, and if even that cannot fit the game says so with an error instead of overlapping them.
- **Keyboard:** typing a letter pops the nearest bubble with that letter (nearest to the slot being filled). A letter
  with no bubble does nothing and costs nothing. Escape pauses.
- **Resize / rotate:** bubbles are scaled and clamped into the new sea, so none is ever outside it.
- **Stars:** the average mistakes per word: 1 or fewer = 3 stars, 2 or fewer = 2, otherwise 1.
- **Tricky words** are those with 2 or more mistakes. The results list them, and **Practise tricky words** starts a round
  of just those.

## Word data (`data/words.json`)

Five packs of 34 words (170 in all), 12 easy, 12 medium and 10 hard per pack. The file is checked when the game loads:
lowercase letters only, 3–9 long, no word twice anywhere, a clue and a picture for each, at least 25 words per pack and
at least 10 per level in each pack (so every pack and level can fill a round). A level comes from the word's length, so
it is stored nowhere else.

The pictures are emoji, so there are no image files to download or license. Only older, widely supported emoji are
used. **Needs a human check before release:** that each emoji is a good picture for its word on the devices the
children use (for example the picture for "torch" is a flashlight, and "garden" is a house with a garden), and that the
clues read well for 8 to 10 year olds.

## Design notes

- The sea and bubbles are drawn on the canvas. Because a canvas is invisible to screen readers, there is a hidden list
  of buttons, one per bubble, that pops it, plus live announcements; typing letters is the keyboard route.
- Meaning never depends on colour alone: the next slot is dashed, the hint is a dashed ring, a wrong bubble also shakes
  the slots and shows a message. With *reduce motion* the bobbing, sparkles and flying letters are turned off and the
  bubbles move at half speed.

## File map

```
index.html, main.js, style.css    Page, composition root (routes + data loading), styles
scenes/                           MenuScene, PlayScene, ResultScene (+ BubblesScene base with routes and data)
ui/SeaRenderer.js                 Canvas drawing of the sea, bubbles, hint ring, sparkles
logic/                            Pure rules, no DOM (all unit-tested):
  bubbleFactory.js, physics.js    Non-overlapping spawn, respawn, movement, collisions, hit test
  spellingState.js, keyboard.js   Next-letter rule and mistakes, nearest-bubble choice for typing
  decoys.js, words.js             Decoy letters, word list validation and picking
  levels.js, scoring.js
```

## Not yet verified

Tested in headless Chromium (desktop and a phone-sized viewport with touch): rounds on all three levels with keyboard
and mouse taps (found by reading the canvas), hints, wrong letters and respawn, the tricky-word round, pause, resize,
and several random seeds. Not tried on a real touch device or Safari, and read-aloud has not been heard with a real
voice.
