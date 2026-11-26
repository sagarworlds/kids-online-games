# Simon Says: Colours & Sounds (`simon-says`)

Coloured pads light up and play notes in a growing sequence. The child repeats it, and each success adds one more step.

**Learning goal:** working memory, attention, auditory and visual sequencing, and a little music (the pads are notes
of a C major chord, so any sequence sounds pleasant).

## How to play

1. Pick a level and a mode, then press **Start**.
2. Watch and listen while the pads play. Input is blocked until the sequence ends.
3. Play it back (tap the pads, or press keys 1-4; 1-6 on Hard). Get it all right and the next round adds a step.
4. A wrong tap, or running out of time, replays the same sequence once ("Listen again!"). A second wrong answer on the
   same sequence ends the game. Your score is the longest sequence you completed.
5. **Replay** plays the sequence again for free, once per sequence.

| Level | Start length | Pads | Note | Time to answer | Stars (3 / 2) |
| --- | --- | --- | --- | --- | --- |
| Easy | 3 | 4 | 500 ms | 5 s | 8+ / 5+ |
| Medium | 4 | 4 | 400 ms | 5 s | 10+ / 7+ |
| Hard | 4 | 6 (adds Purple A4, Orange D5) | 350 ms | 3 s | 12+ / 9+ |

Playback gets 5% faster every 3 completed sequences, never below a 250 ms note.

## Modes

- **Classic**: repeat the sequence.
- **Reverse** (Hard only): repeat it backwards. Its best result is saved separately.
- **Music Maker** (any level): free play. Tap pads to compose, up to 16 notes, then play them back. No score.

## Accessibility

Every pad has a colour, a unique shape and a number, and announces all three. Keys 1-6 play the pads. Muted mode
still works with visuals alone. With `prefers-reduced-motion` the pad scale and glow animations are switched off.

## File map

```
index.html, main.js, style.css   Page, composition root (registers this game's sounds, builds `routes`), styles
scenes/                          MenuScene, PlayScene, MusicScene, ResultScene (+ SimonScene base with routes)
ui/PadBoard.js                   The pads: DOM buttons with shape, number, colour
logic/                           Pure rules, no DOM or timers (all unit-tested)
  simonGame.js                   State machine: start / addStep / press / timeout / replay
  sequencePlayer.js              Plays a sequence through injected light / tone / sleep; cancellable
  timings.js, scoring.js, levels.js, pads.js, recorder.js
```

## Design notes

- `sequencePlayer.js` has no timers of its own: `sleep` is injected and takes an `AbortSignal`, so leaving the scene
  cancels the sequence, every pause and the sounds, and a cancelled sequence never leaves a pad glowing.
- The retry is per sequence: each new, longer sequence gets a fresh retry. The spec says "a second wrong tap ends the
  round" without saying whether the retry resets; per sequence felt kinder for an 8-year-old.
- Hidden tab: the sequence stops and is replayed (free) when the child comes back.

## 3D view

On a device that can do WebGL 2 the pads are 3D, in the game and in Music Maker. A **3D view / 2D view** button on the menu switches and remembers the
choice. The sequences, the sound and light show, the answer clock, the retry, Replay, the scores, the stars and the saved progress are the same code as
2D (the 3D scenes extend `PlayScene` and `MusicScene` through two small hooks: how the pads are made and how the screen is laid out), so the same seed
and the same play give the same sequences and the same results in both views.

- **The pads** are big buttons on a console, which you can turn and zoom (drag, pinch, scroll or the arrow keys on the picture). A pad that lights
  **goes down like a pressed button and glows** in its colour, with a pool of light on the console round it; when it goes out it comes back up. Each pad
  has its **shape raised on its top and its number beside it**, so the pads differ by more than colour, as on the flat pads. A pad that cannot be played
  at the moment (the sequence is playing) is a little dimmer.
- **Tap a pad** in the picture to play it, or press the keys 1 to 6 as before. A tap while the sequence is playing is ignored, as in 2D.
- **The flat pads are still there.** They are laid over the picture, one button on each pad, invisible except for the focus ring. So the keyboard (keys, or
  Tab and Space) and screen readers work as before, every pad is still named by its colour, shape and key ("Red pad, circle, key 1"), and the buttons are
  never smaller than 48 pixels. A tap on the picture is worked out from the picture itself.
- **If 3D cannot run**: no WebGL 2 means no 3D button; if a 3D file will not load, the flat screen opens. If 3D cannot start, or the graphics are lost
  *in the middle of a game*, the picture goes and the flat pads become the board again, in the same place and on the same turn (the sequence in progress
  can be finished, and the next ones are shown on the flat pads), and the next screens are flat too for the rest of the visit. That only lasts for the
  visit; it does not change the saved choice.
- **On a phone** the picture takes at least 45% of the screen's height, with the length, the status, the answer clock and Replay under it. With "less
  motion" a pad goes down and glows at once, with no easing. three.js is loaded with `import()` only when a 3D screen opens.

Files: `logic/look3d.js` (where each pad stands, the outline of each shape, the resting colour, how far a pad goes down as it lights, the camera),
unit-tested in `tests/simon-says/look3d.test.js`; and `three/` (`PadBoard3D`, `pads3d`, `Play3DScene`, `Music3DScene`). The sound is not changed: it is the
flat game's tones, played by the same scene code.

## Stretch ideas (not built)

A "Twinkle Twinkle" song-learning mode; an animal sounds pack.
