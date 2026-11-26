# Hindi–English Match (`hindi-english-match`)

A memory card-flip game where each pair is a Hindi word and its English meaning (सेब ↔ Apple), or a Marathi word and its
English meaning (सफरचंद ↔ Apple), so children build bilingual vocabulary while training memory.

**Learning goal:** vocabulary in both languages, reading Devanagari, and working memory.

## How to play

1. Pick a language (Hindi or Marathi: the game remembers the last one), a topic (or Mixed) and a level. Tick *Practice* to see every card for 5 seconds first.
2. Flip two cards. A Hindi (or Marathi) word and its English meaning stay open (and glow, with a ✔). Anything else flips back after one second.
3. Find all the pairs. Stars come from the number of moves: at most 1.5 × pairs = 3 stars, at most 2.5 × pairs = 2, otherwise 1.
4. The results screen lists every pair so you can review them, with a 🔊 on each word.

| Level | Cards | Help |
| --- | --- | --- |
| Easy | 6 pairs (4 × 3) | A picture under each word; Hindi cards tinted orange, English blue |
| Medium | 8 pairs (4 × 4) | No pictures, plain cards |
| Hard | 10 pairs (5 × 4) | Prefers look-alike words: in Hindi आम / आँख, दादा / दादी, हाथ / हाथी; in Marathi हात / हत्ती, आजोबा / आजी, काका / काकू |

Topics: Fruits, Animals, Colours, Body, Family, Numbers (13 to 20 pairs each, 91 in all; 89 in Marathi, see below).

## Behaviour worth knowing

- Cards match by `pairId`, never by text, so the same English word can appear in different topics.
- While two wrong cards are showing, taps are ignored (not queued); tapping the same card twice never counts.
- Read-aloud (Hindi `hi-IN`, Marathi `mr-IN`, English `en-IN`) follows the parent setting for matches. A face-up card is tapped (or pressed)
  to hear its word whatever that setting says, when the browser can speak. There is no button for it on a card: on a phone a card is as small
  as 76px, and a button of at least 48px would cover the word. A 🔊 in the corner of a face-up card says it can be tapped (✔ once matched);
  on a device with no voice for Hindi or Marathi those cards show no 🔊 and say nothing, and the English ones stay.
- The language is a choice on the menu and is kept in the game's save (`extra.language`). Stars are kept per language: Hindi under
  the plain level ids (`easy`, `medium`, `hard`), as every save made before Marathi has them, and Marathi under `mr-easy`,
  `mr-medium` and `mr-hard`. What the menu suggests and shows follows the language.
- Two pairs have no Marathi word and are left out of Marathi games: Marathi says आजोबा and आजी for both grandfathers and both
  grandmothers, so "Maternal grandfather" and "Maternal grandmother" would be two cards that read the same. The data check refuses
  two cards with the same word in a language.
- Keyboard: arrow keys move between cards, Enter or Space flips a face-down card and says the word of a face-up one. Cards are real buttons
  with labels like "Hindi card: सेब" or "Marathi card: सफरचंद". The only text on a card is its word: the tag, the picture, the "?" on the back
  and the ✔ and 🔊 are drawn by the stylesheet (`content: attr(data-text)`), so the button's name holds all the text it shows (WCAG 2.5.3).
- A word is shrunk to fit its card, by the engine's `fitTexts` (measured in the browser, as the card draws it: its font, its size at that
  screen and its language, because the same Devanagari word is wider in Marathi than in Hindi), down to 45% of the size the stylesheet gives
  it (`LEAST_WORD_SCALE`; on the narrowest phone card the longest English word, "Pomegranate", is 10.5px). A phrase of two lines beside a
  picture is shrunk until the card is tall enough. A word that would need less than that is let break at a hyphen, or in the middle as the last thing.
- Every word of Hindi or Marathi on a card, the menu and the results carries its language (`lang="hi"` or `lang="mr"`), so a screen reader says it in the right voice.
- Colour is never the only signal: a "हिं" / "मरा" / "EN" tag shows the language, and matched cards show a ✔.
- With `prefers-reduced-motion` the flip and the shake are switched off.

## Fonts

Noto Sans Devanagari (weights 400 and 700, Devanagari subset, about 100 KB) is bundled in `assets/fonts/` under the SIL
Open Font License (`assets/fonts/LICENSE.txt`), so Hindi renders offline with no request to another site. A test checks
the files are genuine WOFF2.

## ⚠️ Content to verify before release

The vocabulary in `data/pairs.json` was written by an AI model. **A Hindi speaker should check every spelling and
meaning**, especially the family words (the English side uses plain descriptions such as "Maternal grandfather" for नाना),
the colour names (स्लेटी, सुनहरा) and the emoji pictures. **A Marathi speaker should check the 89 Marathi words**, which
are the newest: the colour names (केशरी for orange, तपकिरी, राखाडी, सोनेरी), the fruits (नासपती, पीच, खरबूज), शेळी for goat and
वडील for father, and the two look-alike groups. The data is validated on load (Devanagari present, unique ids, no word twice in a
language, at least 12 pairs per topic in each language), but nothing can check a translation automatically.

## File map

```
index.html, main.js, style.css   Page, composition root (loads and validates pairs.json, builds `routes`), styles + @font-face
data/pairs.json                  Topics and 91 word pairs: `hi`, `mr` (89 of them) and `en`, + `similar` / `similarMr` tags for look-alike words
assets/fonts/                    Noto Sans Devanagari 400 and 700 (WOFF2) + licence
scenes/                          MenuScene, BoardScene, ResultScene (+ HindiScene base)
ui/CardGrid.js                   The cards: CSS 3D flip, arrow-key navigation, a face-up card is tapped to hear it, words shrunk to fit
logic/                           Pure rules, no DOM (all unit-tested)
  matchState.js                  idle -> oneUp -> twoUp -> (matched | mismatch) -> idle
  deck.js                        Two cards per pair, Fisher–Yates shuffle, look-alike preference
  languages.js                   Hindi and Marathi: name, voice, card tag, the word of a pair, the stars key, the saved choice
  pairs.js, levels.js, scoring.js
```

## Stretch ideas (not built)

English ↔ picture mode for younger siblings; a Tamil option (a language is a row in `logic/languages.js` and a field in
`data/pairs.json`).
