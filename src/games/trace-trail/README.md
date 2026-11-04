# Trace Trail

The child traces letters, numbers and words with a finger or a stylus along a guided path. An animated pencil first shows each
one being written, stroke by stroke. For ages 8–10. It works best on a **tablet with a stylus**: tracing with a mouse is hard, and
it cannot be done with a keyboard or a screen reader (it is a hand skill). For real pencil practice there are printable worksheets.

## How to play

1. Pick a level and a set. **Easy** is *lines, curves and loops* (12 pre-writing strokes) and *numbers* (0 to 9). **Medium** is
   *capital letters* (A–Z), *small letters* (a–z) and *देवनागरी letters* (31 consonants and 4 vowels). **Hard** is *words*: English
   words (cat, fish...) and Hindi / Marathi syllables and short words (का, कमल, माला...).
2. A round is 5 letters (3 words at Hard). For each, a **pencil shows how to write it first**: each stroke in order, from its numbered
   dot, in the right direction. Press **Watch** to see it again.
3. Then it is your turn. Put the pencil on **dot 1** and follow the dots. A **snail** 🐌 sits at the end of what you have traced and
   **moves only while you are on the path**, so going slowly and carefully is what works. Going off the path turns the ink red and
   stops the snail; come back and carry on. Lifting the pencil before the end of a stroke makes you start that stroke again.
4. Each stroke is checked for **staying close to the path**, **going the right way** and **being in the right order**. Starting a
   later stroke first, or a stroke from its end, is counted as a mistake and the game says what to do.
5. Stars for each one (90% on the path is 3, 70% is 2) and for the round (the average). **Skip** moves on with one star.

Writing guides: English is written on **four lines** (top, middle dashed, base, and a dashed line for letters that hang, like g and y).
Devanagari hangs from a **headline** (शिरोरेखा), which is drawn **last**: for one letter it is its last stroke, and in a word it is
one line across the whole word after the last letter.

## Printable worksheets

Every set has a **Worksheet** button. It shows a sheet with, for each letter, a model with numbered start dots, dotted copies to
trace and empty boxes to write it alone, and a **Print** button. Printing hides everything else and fits the rows to A4 pages.
Tracing on a screen helps with letter shapes and stroke order, but the grip of a real pencil needs paper.

## How it is built

- `logic/shapes.js` describes paths (lines, arcs, joins) and evens them out to points 3 units apart; the same points are drawn and checked.
- `logic/trace.js` has the rules. A `StrokeTracker` only lets the pencil move **forward**: progress is the furthest point reached while
  within the tolerance of the path, looking only a short way ahead, so cutting across a loop or jumping to the end earns nothing.
  A move is checked in small steps, so a fast stroke counts all the way along, and progress cannot run ahead of the pencil's own
  travel (so sweeping straight across a wave does not carry the snail along it). A `GlyphTracer` runs a letter's strokes in order and
  counts wrong starts. `demoTimeline` / `demoState` time the demonstration pencil.
- `logic/glyphs/` holds the shapes: `english.js` (strokes, numbers, capitals, small letters, written by hand with lines and arcs),
  `devanagari.js` with `devanagari-data.js` (generated), and `words.js`, which sets letters side by side into words.
- `tests/trace-trail/` checks the rules, and **writes every glyph by following its strokes in order**, exactly and with the pencil a
  little off the path, so a shape that cannot be traced is found by a test and not by a child.
- `ui/TraceBoard.js` draws the page as SVG and turns the pointer into points (one pointer at a time, so a resting palm is ignored,
  and the pieces of a fast move are all used). `scenes/` has the menu, the tracing, the results and the worksheet.

## How the Devanagari strokes were made

The English shapes were written by hand. The 35 Devanagari letters were **not**: their centre lines were found by program from the
letter shapes of Noto Sans Devanagari (SIL Open Font License 1.1) and split into strokes by a simple rule (left parts first, the
upright stem later, never writing upwards, headline last). See `scripts/trace-trail-strokes/README.md` to make them again. No font
is shipped.

## Notes for the reviewer: needs a human check

- **Stroke order and the shapes of the Devanagari letters** (and of the English letters and numbers) should be checked by a teacher or
  parent. The order for Devanagari comes from the simple rule above, not from a school book; for English it follows the usual
  "start at the top" teaching, but schools differ (and some teach joined writing). Letters not included: the vowels ई ऊ ए ऐ ओ औ and
  the vowel signs other than ा, which need strokes above and below the headline. Other signs and letters can be added as data.
- **Tracing with a finger, a stylus and a mouse on real devices** (including palm rejection and how forgiving the path feels) has not
  been tried. The width of the path is a starting value: 14, 11 and 9 drawing units each side of the path (a letter is about 90 units tall) at Easy, Medium
  and Hard, and never narrower than 16 screen pixels.
- **Printing** was checked in the browser's print view, not on paper.
