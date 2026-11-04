"""Finds the centre lines of Devanagari letters (from Noto Sans Devanagari, SIL OFL 1.1) as numbered pieces ("edges").

Usage: python3 skel.py <font.woff> <out-dir> <chars...>
It writes <out-dir>/edges.json (every letter's pieces, in drawing units) and one picture per letter showing the pieces with their
numbers, so strokes can be assembled by hand: which pieces make a stroke, in which order and which way round.
"""
import json
import math
import sys
from collections import defaultdict

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT, OUT, *CHARS = sys.argv[1:]
SIZE = 300
CANVAS = 700
# Drawing units: the headline's centre line is at HEAD_Y, the baseline at BASE_Y (see logic/glyphs/define.js).
HEAD_Y, BASE_Y = 40.0, 110.0
MARGIN = 8.0
SPUR = 14  # pieces shorter than this (pixels) that end in a free end are noise from the thinning and are dropped


def render(ch):
    font = ImageFont.truetype(FONT, SIZE)
    im = Image.new('L', (CANVAS, CANVAS), 255)
    ImageDraw.Draw(im).text((150, 150), ch, font=font, fill=0)
    return (np.array(im) < 128).astype(np.uint8)


def thin(img):
    """Zhang-Suen thinning."""
    img = img.copy()
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            n = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
            b = sum(n)
            a = sum(((n[i] == 0) & (n[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c = (n[0] * n[2] * n[4] == 0) & (n[2] * n[4] * n[6] == 0)
            else:
                c = (n[0] * n[2] * n[6] == 0) & (n[0] * n[4] * n[6] == 0)
            kill = (img == 1) & (b >= 2) & (b <= 6) & (a == 1) & c
            if kill.any():
                img[kill] = 0
                changed = True
    return img


def neighbours(skel, y, x):
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and 0 <= y + dy < skel.shape[0] and 0 <= x + dx < skel.shape[1] and skel[y + dy, x + dx]:
                out.append((y + dy, x + dx))
    return out


def find_headline(img):
    """The band of rows that is mostly ink across the letter: returns (top, bottom, x0, x1) or None."""
    ys, xs = np.nonzero(img)
    width = xs.max() - xs.min() + 1
    rows = [y for y in range(ys.min(), ys.min() + 80) if img[y].sum() > 0.6 * width]
    if not rows:
        return None
    top, bottom = rows[0], rows[0]
    for y in rows[1:]:
        if y == bottom + 1:
            bottom = y
    xs_h = np.nonzero(img[(top + bottom) // 2])[0]
    return top, bottom, xs_h.min(), xs_h.max()


def pieces(skel):
    """Turns a one-pixel-wide skeleton into a graph and returns its pieces (lists of (y, x)): the pixel chains between
    junctions and free ends, with junction clusters collapsed to one point and pass-through points merged away."""
    ys, xs = np.nonzero(skel)
    pts = set(zip(ys.tolist(), xs.tolist()))
    nb = {p: neighbours(skel, *p) for p in pts}
    special = {p for p in pts if len(nb[p]) != 2}
    # Cluster the junction / end pixels that touch each other into single nodes.
    cluster = {}
    centres = []
    for p in special:
        if p in cluster:
            continue
        cid = len(centres)
        stack = [p]
        cluster[p] = cid
        members = []
        while stack:
            c = stack.pop()
            members.append(c)
            for q in nb[c]:
                if q in special and q not in cluster:
                    cluster[q] = cid
                    stack.append(q)
        centres.append((sum(m[0] for m in members) / len(members), sum(m[1] for m in members) / len(members)))
    edges = []  # (node_a, node_b, [points])
    used = set()
    for p in special:
        for q in nb[p]:
            if q in special or q in used:
                continue
            path = [p, q]
            used.add(q)
            prev, cur = p, q
            end = None
            while True:
                nxt = [r for r in nb[cur] if r != prev]
                if not nxt:
                    break
                r = nxt[0]
                if r in special:
                    path.append(r)
                    end = cluster[r]
                    break
                path.append(r)
                used.add(r)
                prev, cur = cur, r
            if end is None:
                end = cluster[p]
            edges.append([cluster[p], end, path])
    covered = {r for _, _, e in edges for r in e}
    rest = pts - covered - special
    while rest:  # closed loops
        start = min(rest)
        path = [start]
        rest.discard(start)
        cur = start
        while True:
            nxt = [r for r in nb[cur] if r in rest]
            if not nxt:
                break
            cur = nxt[0]
            path.append(cur)
            rest.discard(cur)
        path.append(start)
        centres.append(start)
        edges.append([len(centres) - 1, len(centres) - 1, path])

    def contract(edges):
        changed = True
        while changed:
            changed = False
            inc = defaultdict(list)
            for i, (a, b, _) in enumerate(edges):
                inc[a].append(i)
                inc[b].append(i)
            for node, idxs in inc.items():
                if len(idxs) == 2 and idxs[0] != idxs[1] and edges[idxs[0]][0] != edges[idxs[0]][1] and edges[idxs[1]][0] != edges[idxs[1]][1]:
                    e1, e2 = edges[idxs[0]], edges[idxs[1]]
                    if e1[1] != node:
                        e1 = [e1[1], e1[0], e1[2][::-1]]
                    if e2[0] != node:
                        e2 = [e2[1], e2[0], e2[2][::-1]]
                    merged = [e1[0], e2[1], e1[2] + e2[2][1:]]
                    edges = [e for k, e in enumerate(edges) if k not in idxs] + [merged]
                    changed = True
                    break
        return edges

    edges = contract(edges)
    # Drop short spurs (a free end joined to a junction by a few pixels), then merge again.
    for _ in range(2):
        deg = defaultdict(int)
        for a, b, _ in edges:
            deg[a] += 1
            deg[b] += 1
        edges = [e for e in edges if not ((deg[e[0]] == 1 or deg[e[1]] == 1) and (deg[e[0]] > 1 or deg[e[1]] > 1) and len(e[2]) < SPUR)]
        edges = contract(edges)
    # Pieces end exactly at the centre of the junction they meet.
    out = []
    for a, b, path in edges:
        pts2 = [tuple(map(float, q)) for q in path]
        if len(pts2) > 2:
            deg_a = sum(1 for e in edges if a in (e[0], e[1]))
            deg_b = sum(1 for e in edges if b in (e[0], e[1]))
            if deg_a > 2:
                pts2[0] = centres[a]
            if deg_b > 2:
                pts2[-1] = centres[b]
        out.append((a, b, pts2))
    return out


def prune(edges, skel):
    return edges


def smooth(path, window=7):
    a = np.array(path, dtype=float)
    if len(a) < window + 2:
        return a
    k = window // 2
    out = a.copy()
    for i in range(1, len(a) - 1):
        lo, hi = max(0, i - k), min(len(a), i + k + 1)
        out[i] = a[lo:hi].mean(axis=0)
    return out


def length(path):
    return sum(math.dist(path[i], path[i + 1]) for i in range(len(path) - 1))


def heading(path, from_end, n=8):
    """Direction (dy, dx) leaving the end of a piece, over its first few points."""
    seq = path if not from_end else path[::-1]
    q = seq[min(n, len(seq) - 1)]
    return (q[0] - seq[0][0], q[1] - seq[0][1])


def angle_between(u, v):
    nu, nv = math.hypot(*u) or 1, math.hypot(*v) or 1
    c = max(-1, min(1, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))
    return math.degrees(math.acos(c))


def assemble(graph, k):
    """Joins pieces into strokes: starting at the free end nearest the top left, keep going straight on at junctions."""
    edges = [[a, b, path] for a, b, path in graph]
    # Throw away tiny loose bits (left over where the headline was cut off).
    comp = {}
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, _ in edges:
        parent[find(a)] = find(b)
    size = defaultdict(float)
    for a, b, path in edges:
        size[find(a)] += length(path) * k
    edges = [e for e in edges if size[find(e[0])] > 18]
    used = [False] * len(edges)
    strokes = []
    while not all(used):
        deg = defaultdict(int)
        for i, (a, b, _) in enumerate(edges):
            if not used[i]:
                deg[a] += 1
                deg[b] += 1
        ends = [n for n, d in deg.items() if d == 1]
        nodes = ends or list(deg)
        pos = {}
        for i, (a, b, path) in enumerate(edges):
            pos[a] = path[0]
            pos[b] = path[-1]
        start = min(nodes, key=lambda n: pos[n][1] + 0.3 * pos[n][0])
        stroke = []
        node = start
        while True:
            options = [i for i, (a, b, _) in enumerate(edges) if not used[i] and node in (a, b)]
            if not options:
                break
            if stroke:
                last = stroke[-1]
                incoming = (last[-1][0] - last[-4][0], last[-1][1] - last[-4][1]) if len(last) > 4 else (0, 0)

                def turn(i):
                    a, b, path = edges[i]
                    seq = path if a == node else path[::-1]
                    out = (seq[min(6, len(seq) - 1)][0] - seq[0][0], seq[min(6, len(seq) - 1)][1] - seq[0][1])
                    # Strokes go down the page: an edge that climbs steeply is not a continuation, it is written from its own top.
                    climbs = out[0] < 0 and abs(out[0]) > abs(out[1])
                    return angle_between(incoming, out) + (200 if climbs else 0)

                options.sort(key=turn)
                if turn(options[0]) > 70:
                    break
            else:
                options.sort(key=lambda i: -(edges[i][2][len(edges[i][2]) // 2][0]))
            i = options[0]
            a, b, path = edges[i]
            seq = path if a == node else path[::-1]
            node = b if a == node else a
            used[i] = True
            stroke.append(seq)
        pts = [p for seg in stroke for p in seg]
        strokes.append(pts)
    # Left parts first, the long upright stem later.
    strokes.sort(key=lambda st: min(p[1] for p in st[:max(1, len(st) // 6)]) + 0.0)
    return strokes


def main():
    ref = render('ग')
    band = find_headline(ref)
    ys, xs = np.nonzero(ref)
    stem_bottom = ys.max()
    head_center = (band[0] + band[1]) / 2
    k = (BASE_Y - HEAD_Y) / (stem_bottom - head_center)
    result = {}
    for ch in CHARS:
        img = render(ch)
        ys, xs = np.nonzero(img)
        x0 = xs.min()
        hb = find_headline(img)
        body = img.copy()
        headline = None
        if hb:
            top, bottom, hx0, hx1 = hb
            body[top - 1:bottom + 2, :] = 0
            headline = [round(MARGIN + (hx0 - x0) * k, 1), round(MARGIN + (hx1 - x0) * k, 1)]
        skel = thin(body)
        graph = pieces(skel)
        to_units = lambda y, x: (round(MARGIN + (x - x0) * k, 1), round(HEAD_Y + (y - head_center) * k, 1))
        def conv(path):
            sm = smooth(path)
            return [to_units(y, x) for y, x in sm[:: 3 if len(sm) > 30 else 1]] + ([to_units(*sm[-1])] if len(sm) > 30 else [])
        units = [conv(path) for _, _, path in graph]
        strokes_px = assemble(graph, k)
        strokes = [conv(p) for p in strokes_px]
        width = round(MARGIN * 2 + (xs.max() - x0) * k, 1)
        result[ch] = {'w': width, 'headline': headline, 'pieces': units, 'strokes': strokes, 'headY': HEAD_Y}
        # A picture with every piece numbered, with an arrow at its start.
        scale = 3.2
        pic = Image.new('RGB', (int(width * scale) + 20, int(170 * scale)), 'white')
        d = ImageDraw.Draw(pic)
        for gy in (HEAD_Y, BASE_Y):
            d.line([(0, gy * scale), (pic.width, gy * scale)], fill=(220, 120, 120))
        if headline:
            d.line([(headline[0] * scale, HEAD_Y * scale), (headline[1] * scale, HEAD_Y * scale)], fill=(200, 200, 200), width=4)
        colors = [(200, 40, 40), (30, 100, 200), (30, 140, 60), (230, 120, 0), (130, 40, 160), (0, 130, 140)]
        for i, u in enumerate(strokes):
            col = colors[i % 6]
            d.line([(x * scale, y * scale) for x, y in u], fill=col, width=3)
            x, y = u[0]
            d.ellipse([x * scale - 6, y * scale - 6, x * scale + 6, y * scale + 6], fill=col)
            d.text((x * scale + 8, y * scale - 14), str(i + 1), fill=col)
        d.text((4, 4), ch, fill=(0, 0, 0))
        pic.save(f'{OUT}/piece-{ord(ch):04x}.png')
    with open(f'{OUT}/edges.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
    print('letters', len(result), 'unit scale', round(k, 4))


main()
