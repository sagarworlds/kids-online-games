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

## Stretch ideas (not built)

A "Twinkle Twinkle" song-learning mode; an animal sounds pack.
