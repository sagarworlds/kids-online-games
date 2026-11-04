# Matra Mixer

A consonant train pulls into the "matra station". The child adds a vowel sign (matra) to a consonant and hears the syllable it
makes: क + ा = का. This is बाराखडी / बारहखड़ी for ages 8–10, in **Hindi or Marathi**. Works with touch, mouse and keyboard, and
offline once loaded.

## How to play

1. On the menu open **⚙️ Language and vowel signs** (a grown-up choice) and pick Hindi or Marathi, and **बाराखडी** (12 vowel signs)
   or **चौदाखडी** (14: adds ॅ and ॉ). Check which one your child's school teaches. Then pick a level and an activity:
   - **Learn**: the **chart** has the consonants down the side and the vowel signs across the top; tap any box (कि, की, कु ...)
     to see it and hear it. The **matra station** has a letter on the train: drag a vowel sign onto it (or just tap the sign) to
     make the syllable. Nothing is scored.
   - **Build the sound**: a syllable is spoken ("कू"); pick the letter and the vowel sign that make it, then Check. If one part
     is wrong, only that part is marked and you pick again.
   - **Bubble pop**: a syllable is spoken and bubbles float on screen; pop the one that says it. Some of the other bubbles share
     the letter and some share the vowel sign, so you have to listen to both.
   - **Read words**: a short word is shown (कमल, मासा, घर), with a button for each syllable and one for the whole word; pick its
     picture. Only words made of syllables the level already teaches are used.
2. A round is 10 syllables (8 words). Only the **first try** counts towards the stars (90% right is 3, 70% is 2), a wrong try can
   be repeated, and after two wrong tries the answer is shown. The results list what to practise, each with a 🔊 button.

| Level | Letters | Vowel signs | Choices |
|-------|---------|-------------|---------|
| Easy | 12: क ख ग घ च ज त न प म र ल | none (अ), ा ि ी ु ू | Build 4, bubbles 4, words 3 |
| Medium | all 31 | + े ै ो ौ | Build 5, bubbles 6, words 4 |
| Hard | + the joined letters क्ष त्र ज्ञ (and ळ in Marathi) | + ं ः (and ॅ ॉ in चौदाखडी) | Build 6, bubbles 8, words 4 |

Stars are saved separately for each activity, language and level.

## Sound: recorded voices first

The spec asks for **recorded voices, not the browser's speech**, because Hindi and Marathi computer voices vary a lot between
devices and can mispronounce syllables. The game is built that way, but **no recordings are shipped yet** (they should be in a
real voice). Until they are added every syllable is spoken by the browser, which is best effort. To add recordings:

1. Record each syllable on its own, about a second, as `.mp3` (or `.ogg`, `.m4a`, `.wav`).
2. Name it `<letter>-<sign>.mp3`, for example `k-aa.mp3` for का, and put it in `assets/audio/hi/` or `assets/audio/mr/`.
   The letter names are `k kh g gh c ch j jh tt tth dd ddh nn t th d dh n p ph b bh m y r l v sh ss s h ksh tr gy ll`
   and the sign names are `a aa i ii u uu e ai o au am ah ae ao` (`a` is the sound a letter has on its own: क). The names
   come from `logic/devanagari.js`. Hindi and Marathi need separate recordings.
3. Run `node scripts/matra-audio-manifest.mjs`. It updates `data/audio-manifest.json` and says how many syllables still use the
   browser voice. The game only asks for files named in the manifest, so a missing recording never fails to download.

A word is read by playing its syllables in turn, if every one has a recording; otherwise the browser speaks the word. A recording
that fails to play is logged and the browser voice takes over. With **sound off** in the grown-ups settings nothing is spoken, and
Build and Bubble pop show the syllable as text so they still work as reading practice (they do the same where the device has
no voice).

## How it is built

- `logic/devanagari.js` has the letters. A syllable is one consonant (or one of the joined letters) and at most one vowel sign.
  `parseSyllables` splits a word, and refuses anything the game cannot show (a letter on its own, a half letter), naming the word.
- `data/words.json` has 58 Hindi and 54 Marathi words, each with a picture (an emoji) and its English meaning. They are checked on load:
  every word must read as syllables, and no two words may share a picture. The level decides which words can appear.
- `logic/rounds.js` makes the rounds for each activity from a seeded random source; `logic/session.js` counts tries and stars.
  `tests/matra-mixer/` checks, for example, that all syllables are different, that every level has enough words in both languages
  and both vowel sets, that no bubble round has two bubbles with the same syllable, and the recording plan.
- `ui/Voice.js` plays recordings or speech; `ui/LearnGrid.js` and `ui/Mixer.js` are the chart and the matra station (the station
  uses the shared drag-and-drop helper, and every sign is also a button). `scenes/RunScene.js` is the shared shape of the three
  activities.

## Notes for the reviewer: needs a human check

- **All the Devanagari content needs a Hindi / Marathi reader to check it**: the word lists, the English meanings and pictures,
  which consonants and signs are in each level, and the choices I made about the chart: ङ and ञ are left out (they are almost
  never the start of a syllable), त्र is in both languages, ळ is Marathi only, and ॅ ॉ come after ः.
- **Spoken syllables** have not been heard on a real device. The browser voice for Hindi or Marathi may be missing or wrong.
- Dragging on a real touch screen and the layout on small phones (the chart scrolls inside its own box) have not been tried on devices.
