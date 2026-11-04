import { line, poly, arc, join, param } from '../shapes.js';
import { defineGlyph, RULES } from './define.js';

const { cap: CAP, baseline: BASE } = RULES;
const G = (id, char, w, ...strokes) => defineGlyph({ id, char, w, strokes });
/** Stroke shorthand: pieces joined into one path. */
const S = join;
const MID = 65;
const DOT = (x, y) => arc(x, y, 4, 4, 0, 360);

/**
 * Pre-writing strokes: the lines, curves and loops every letter is made of. Each is one stroke.
 * @type {readonly import('./define.js').Glyph[]}
 */
export const STROKES = Object.freeze([
  G('down', 'Standing line', 100, line(50, CAP, 50, BASE)),
  G('across', 'Sleeping line', 100, line(10, MID, 90, MID)),
  G('slant-down-right', 'Slanting line', 100, line(22, CAP, 78, BASE)),
  G('slant-down-left', 'Slanting line the other way', 100, line(78, CAP, 22, BASE)),
  G('curve-right', 'Curve like a bracket', 100, arc(28, MID, 42, 45, 270, 450)),
  G('curve-left', 'Curve the other way', 100, arc(72, MID, 42, 45, 270, 90)),
  G('circle', 'Circle', 100, arc(50, MID, 36, 45, 270, -90)),
  G('hill', 'Hill', 100, arc(50, 100, 40, 70, 180, 360)),
  G('valley', 'Valley', 100, arc(50, 40, 40, 70, 180, 0)),
  G('zigzag', 'Zigzag', 100, poly([8, 100], [29, 30], [50, 100], [71, 30], [92, 100])),
  G('wave', 'Wave', 100, param((t) => [8 + 84 * t, MID + 26 * Math.sin(t * Math.PI * 4)], 80)),
  G('loops', 'Loops', 100, param((t) => [10 + 80 * t - 16 * Math.sin(t * Math.PI * 6), MID - 28 * Math.cos(t * Math.PI * 6) + 28], 90)),
]);

/** The digits 0 to 9. @type {readonly import('./define.js').Glyph[]} */
export const NUMBERS = Object.freeze([
  G('0', '0', 80, arc(40, MID, 28, 45, 270, -90)),
  G('1', '1', 80, poly([20, 40], [44, CAP], [44, BASE])),
  G('2', '2', 80, S(arc(40, 45, 26, 25, 200, 380), line(64, 55, 14, BASE), line(14, BASE, 68, BASE))),
  G('3', '3', 80, S(arc(38, 42, 24, 22, 200, 450), arc(38, 87, 28, 23, 270, 520))),
  G('4', '4', 80, S(poly([52, CAP], [10, 80], [68, 80])), line(52, CAP, 52, BASE)),
  G('5', '5', 80, S(line(22, CAP, 18, 62), arc(38, 85, 28, 25, 230, 490)), line(30, CAP, 64, CAP)),
  G('6', '6', 80, S(arc(70, 70, 48, 50, 235, 125), arc(40, 86, 26, 24, 90, -180))),
  G('7', '7', 80, poly([14, CAP], [66, CAP], [28, BASE])),
  G('8', '8', 80, S(arc(40, 44, 22, 24, -40, -320), arc(40, 86, 26, 24, 215, 575))),
  G('9', '9', 80, arc(38, 45, 26, 25, 270, -90), S(line(64, 45, 64, 95), arc(40, 95, 24, 15, 0, 150))),
]);

/** Capital letters A to Z. @type {readonly import('./define.js').Glyph[]} */
export const CAPITALS = Object.freeze([
  G('A', 'A', 80, line(40, CAP, 10, BASE), line(40, CAP, 70, BASE), line(24, 78, 56, 78)),
  G('B', 'B', 70, line(14, CAP, 14, BASE), S(line(14, CAP, 36, CAP), arc(36, 41, 21, 21, 270, 450), line(36, 62, 14, 62)), S(line(14, 62, 38, 62), arc(38, 86, 24, 24, 270, 450), line(38, BASE, 14, BASE))),
  G('C', 'C', 76, arc(44, MID, 32, 45, -45, -315)),
  G('D', 'D', 76, line(14, CAP, 14, BASE), S(line(14, CAP, 32, CAP), arc(32, MID, 34, 45, 270, 450), line(32, BASE, 14, BASE))),
  G('E', 'E', 70, line(14, CAP, 14, BASE), line(14, CAP, 58, CAP), line(14, MID, 50, MID), line(14, BASE, 58, BASE)),
  G('F', 'F', 66, line(14, CAP, 14, BASE), line(14, CAP, 58, CAP), line(14, MID, 50, MID)),
  G('G', 'G', 80, S(arc(44, MID, 32, 45, -45, -360), line(76, MID, 46, MID))),
  G('H', 'H', 72, line(14, CAP, 14, BASE), line(58, CAP, 58, BASE), line(14, MID, 58, MID)),
  G('I', 'I', 60, line(30, CAP, 30, BASE)),
  G('J', 'J', 66, S(line(46, CAP, 46, 86), arc(26, 86, 20, 24, 0, 170))),
  G('K', 'K', 72, line(14, CAP, 14, BASE), poly([58, CAP], [16, 70]), poly([28, 58], [60, BASE])),
  G('L', 'L', 66, poly([14, CAP], [14, BASE], [56, BASE])),
  G('M', 'M', 88, poly([12, BASE], [12, CAP], [44, 82], [76, CAP], [76, BASE])),
  G('N', 'N', 74, poly([14, BASE], [14, CAP], [58, BASE], [58, CAP])),
  G('O', 'O', 84, arc(42, MID, 36, 45, 270, -90)),
  G('P', 'P', 68, line(14, CAP, 14, BASE), S(line(14, CAP, 36, CAP), arc(36, 43, 22, 23, 270, 450), line(36, 66, 14, 66))),
  G('Q', 'Q', 88, arc(42, MID, 36, 45, 270, -90), line(42, 84, 70, 114)),
  G('R', 'R', 72, line(14, CAP, 14, BASE), S(line(14, CAP, 36, CAP), arc(36, 43, 22, 23, 270, 450), line(36, 66, 14, 66)), line(34, 66, 62, BASE)),
  G('S', 'S', 64, S(arc(32, 42, 24, 22, -30, -270), arc(32, 86, 26, 24, 270, 510))),
  G('T', 'T', 74, line(10, CAP, 64, CAP), line(37, CAP, 37, BASE)),
  G('U', 'U', 76, S(line(14, CAP, 14, 84), arc(38, 84, 24, 26, 180, 0), line(62, 84, 62, CAP))),
  G('V', 'V', 74, poly([8, CAP], [36, BASE], [64, CAP])),
  G('W', 'W', 100, poly([6, CAP], [26, BASE], [48, 40], [70, BASE], [90, CAP])),
  G('X', 'X', 72, line(10, CAP, 62, BASE), line(62, CAP, 10, BASE)),
  G('Y', 'Y', 74, poly([8, CAP], [36, 68], [36, BASE]), line(64, CAP, 36, 68)),
  G('Z', 'Z', 72, poly([10, CAP], [62, CAP], [10, BASE], [62, BASE])),
]);

/** Small letters a to z. @type {readonly import('./define.js').Glyph[]} */
export const SMALLS = Object.freeze([
  G('a', 'a', 62, arc(30, 85, 22, 25, -40, -400), line(52, 62, 52, BASE)),
  G('b', 'b', 60, line(14, CAP, 14, BASE), arc(36, 85, 22, 25, 180, 540)),
  G('c', 'c', 56, arc(34, 85, 22, 25, -40, -320)),
  G('d', 'd', 62, arc(30, 85, 22, 25, -40, -400), line(52, CAP, 52, BASE)),
  G('e', 'e', 60, S(line(10, 85, 54, 85), arc(32, 85, 22, 25, 0, -320))),
  G('f', 'f', 56, S(arc(40, 40, 16, 20, -45, -180), line(24, 40, 24, BASE)), line(8, 66, 44, 66)),
  G('g', 'g', 62, arc(30, 85, 22, 25, -40, -400), S(line(52, 62, 52, 130), arc(32, 130, 20, 20, 0, 140))),
  G('h', 'h', 60, line(14, CAP, 14, BASE), S(arc(34, 88, 20, 28, 180, 360), line(54, 88, 54, BASE))),
  G('i', 'i', 48, line(24, 62, 24, BASE), DOT(24, 40)),
  G('j', 'j', 48, S(line(24, 62, 24, 135), arc(8, 135, 16, 15, 0, 150)), DOT(24, 40)),
  G('k', 'k', 60, line(14, CAP, 14, BASE), poly([50, 62], [14, 92]), poly([28, 80], [52, BASE])),
  G('l', 'l', 48, line(24, CAP, 24, BASE)),
  G('m', 'm', 90, line(14, 62, 14, BASE), S(arc(30, 86, 16, 24, 180, 360), line(46, 86, 46, BASE)), S(arc(62, 86, 16, 24, 180, 360), line(78, 86, 78, BASE))),
  G('n', 'n', 62, line(14, 62, 14, BASE), S(arc(34, 86, 20, 24, 180, 360), line(54, 86, 54, BASE))),
  G('o', 'o', 60, arc(32, 85, 24, 25, 270, -90)),
  G('p', 'p', 60, line(14, 62, 14, 150), arc(36, 85, 22, 25, 180, 540)),
  G('q', 'q', 62, arc(30, 85, 22, 25, -40, -400), line(52, 62, 52, 150)),
  G('r', 'r', 52, line(14, 62, 14, BASE), arc(34, 86, 20, 24, 185, 300)),
  G('s', 's', 48, S(arc(26, 73, 17, 12, -30, -270), arc(26, 98, 19, 12, 270, 510))),
  G('t', 't', 52, S(line(24, 30, 24, 100), arc(34, 100, 10, 10, 180, 90)), line(10, 62, 42, 62)),
  G('u', 'u', 62, S(line(14, 62, 14, 92), arc(32, 92, 18, 18, 180, 0)), line(50, 62, 50, BASE)),
  G('v', 'v', 60, poly([10, 62], [30, BASE], [50, 62])),
  G('w', 'w', 80, poly([6, 62], [22, BASE], [38, 70], [54, BASE], [70, 62])),
  G('x', 'x', 60, line(12, 62, 48, BASE), line(48, 62, 12, BASE)),
  G('y', 'y', 60, poly([10, 62], [30, BASE]), poly([50, 62], [24, 130], [12, 150])),
  G('z', 'z', 60, poly([10, 62], [48, 62], [10, BASE], [48, BASE])),
]);

