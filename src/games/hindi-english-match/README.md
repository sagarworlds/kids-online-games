# Hindi–English Match (`hindi-english-match`)

A memory card-flip game where each pair is a Hindi word and its English meaning (सेब ↔ Apple), so children build
bilingual vocabulary while training memory.

**Learning goal:** vocabulary in both languages, reading Devanagari, and working memory.

## How to play

1. Pick a topic (or Mixed) and a level. Tick *Practice* to see every card for 5 seconds first.
2. Flip two cards. A Hindi word and its English meaning stay open (and glow, with a ✔). Anything else flips back after one second.
3. Find all the pairs. Stars come from the number of moves: at most 1.5 × pairs = 3 stars, at most 2.5 × pairs = 2, otherwise 1.
4. The results screen lists every pair so you can review them, with a 🔊 on each word.

| Level | Cards | Help |
| --- | --- | --- |
| Easy | 6 pairs (4 × 3) | A picture under each word; Hindi cards tinted orange, English blue |
| Medium | 8 pairs (4 × 4) | No pictures, plain cards |
| Hard | 10 pairs (5 × 4) | Prefers look-alike Hindi words (आम / आँख, दादा / दादी, हाथ / हाथी) |

Topics: Fruits, Animals, Colours, Body, Family, Numbers (13 to 20 pairs each, 91 in all).

## Behaviour worth knowing

- Cards match by `pairId`, never by text, so the same English word can appear in different topics.
- While two wrong cards are showing, taps are ignored (not queued); tapping the same card twice never counts.
- Read-aloud (Hindi `hi-IN`, English `en-IN`) follows the parent setting for matches. The 🔊 buttons always work when the
  browser can speak; the Hindi one is hidden on devices with no Hindi voice, and the English one stays.
- Keyboard: arrow keys move between cards, Enter or Space flips. Cards are real buttons with labels like "Hindi card: सेब".
- Colour is never the only signal: a "हिं" / "EN" tag shows the language, and matched cards show a ✔.
- With `prefers-reduced-motion` the flip and the shake are switched off.

## Fonts

Noto Sans Devanagari (weights 400 and 700, Devanagari subset, about 100 KB) is bundled in `assets/fonts/` under the SIL
Open Font License (`assets/fonts/LICENSE.txt`), so Hindi renders offline with no request to another site. A test checks
the files are genuine WOFF2.

## ⚠️ Content to verify before release

The vocabulary in `data/pairs.json` was written by an AI model. **A Hindi speaker should check every spelling and
meaning**, especially the family words (the English side uses plain descriptions such as "Maternal grandfather" for नाना),
the colour names (स्लेटी, सुनहरा) and the emoji pictures. The data is validated on load (Devanagari present, unique ids, at
least 12 pairs per topic), but nothing can check a translation automatically.

## File map

```
index.html, main.js, style.css   Page, composition root (loads and validates pairs.json, builds `routes`), styles + @font-face
data/pairs.json                  Topics and 91 word pairs (+ `similar` tags for look-alike words)
assets/fonts/                    Noto Sans Devanagari 400 and 700 (WOFF2) + licence
scenes/                          MenuScene, BoardScene, ResultScene (+ HindiScene base)
ui/CardGrid.js                   The cards: CSS 3D flip, arrow-key navigation, speaker buttons
logic/                           Pure rules, no DOM (all unit-tested)
  matchState.js                  idle -> oneUp -> twoUp -> (matched | mismatch) -> idle
  deck.js                        Two cards per pair, Fisher–Yates shuffle, look-alike preference
  pairs.js, levels.js, scoring.js
```

## Stretch ideas (not built)

English ↔ picture mode for younger siblings; Marathi or Tamil packs added through JSON only.
