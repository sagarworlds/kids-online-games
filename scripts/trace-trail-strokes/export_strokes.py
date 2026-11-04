"""Turns edges.json (from skel.py) into the game's Devanagari stroke data, as a JS module."""
import json, math, sys
# usage: python3 export_strokes.py <edges.json from centre_lines.py> <output devanagari-data.js>
EDGES, OUTPUT = sys.argv[1:3]
D = json.load(open(EDGES, encoding='utf-8'))
IDS = {
    'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'च': 'ca', 'छ': 'cha', 'ज': 'ja', 'झ': 'jha', 'ट': 'tta', 'ठ': 'ttha', 'ड': 'dda', 'ढ': 'ddha', 'ण': 'nna',
    'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na', 'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma', 'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va',
    'श': 'sha', 'ष': 'ssa', 'स': 'sa', 'ह': 'ha', 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'उ': 'u',
}
HEAD = 40.0
def plen(p): return sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))
out = []
for ch, ident in IDS.items():
    g = D[ch]
    strokes = []
    for st in g['strokes']:
        if plen(st) < 18: continue
        # Bits that lie along the headline are what is left of it after it was cut away: the headline is added again by the code.
        if all(p[1] < HEAD + 12 for p in st) and plen(st) < 60: continue
        pts = [list(p) for p in st]
        if g['headline'] and pts[0][1] < HEAD + 16 and pts[0][1] > HEAD:
            pts.insert(0, [pts[0][0], HEAD])
        # The thinning shortens free ends a little: a stem that ends just above the baseline goes down to it.
        if len(pts) > 2 and 98 < pts[-1][1] < 110 and abs(pts[-1][0] - pts[-2][0]) < abs(pts[-1][1] - pts[-2][1]):
            pts.append([pts[-1][0], 110.0])
        # thin the points: keep roughly one in every ~3 units
        thin = [pts[0]]
        for p in pts[1:-1]:
            if math.dist(p, thin[-1]) >= 2.6: thin.append(p)
        thin.append(pts[-1])
        strokes.append([[round(x, 1), round(y, 1)] for x, y in thin])
    out.append({'id': ident, 'char': ch, 'w': math.ceil(g['w']), 'headline': g['headline'], 'strokes': strokes})
js = """// Devanagari stroke data: the centre lines of each letter, split into strokes and put in writing order (left parts first, the
// upright stem later; the headline is added last by the code). Generated, not written by hand, so do not edit the numbers: see
// "How the Devanagari strokes were made" in README.md. The centre lines were found from the letter shapes of Noto Sans
// Devanagari (Copyright 2022 The Noto Project Authors, SIL Open Font License 1.1; the licence text is at openfontlicense.org), and the stroke
// order was set by a simple rule, so a teacher should check both.
/* eslint-disable */
export const DEVANAGARI_DATA = """ + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('},{"id"', '},\n{"id"') + ";\n"
open(OUTPUT, 'w', encoding='utf-8').write(js)
print(len(out), 'letters', len(js) // 1024, 'KB')
