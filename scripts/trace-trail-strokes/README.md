# How the Devanagari strokes were made

`src/games/trace-trail/logic/glyphs/devanagari-data.js` is generated, not written by hand. To make it again:

```bash
# 1. Find the centre line of each letter (needs Python with numpy and Pillow, and the Noto Sans Devanagari font file).
python3 scripts/trace-trail-strokes/centre_lines.py NotoSansDevanagari-Regular.woff /tmp/out क ख ग ...   # every letter to trace
# 2. Split them into strokes, put them in order and write the JavaScript data.
python3 scripts/trace-trail-strokes/export_strokes.py /tmp/out/edges.json src/games/trace-trail/logic/glyphs/devanagari-data.js
```

What the first step does: it draws each letter, cuts away the headline (the शिरोरेखा, which the game draws itself, last),
thins the rest to a one-pixel line, turns that line into pieces between junctions and free ends, and joins pieces into
strokes: it starts at the free end nearest the top left, goes straight on at junctions, never writes upwards, and puts the
left parts first and the long upright stem later. The second step drops bits too short to trace, makes stems start at the
headline and end on the baseline, and writes the points out.

The font is Noto Sans Devanagari (Copyright The Noto Project Authors, SIL Open Font License 1.1,
https://openfontlicense.org). Only the shape of each letter was used to find its centre line; no font is shipped.

**The stroke order comes from a simple rule, not from a school book. A teacher should check it** and, where a letter is written
differently, correct that letter's strokes.
