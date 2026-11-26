import {
  Group, Mesh, SphereGeometry, BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Shape, TorusGeometry, MeshLambertMaterial,
  CanvasTexture, RepeatWrapping, SRGBColorSpace,
} from '../../../engine/three/three.js';
import { COLORS } from '../logic/generators/helpers.js';
import { groupLayout, arrowYaw, PEDESTAL_HALF } from '../logic/look3d.js';

/**
 * The solids of the case file, built from simple shapes (no model files): a sphere, a cube, a cone, a star and an arrow, each in the colours
 * of the cases, and a block that carries a number. The geometry and materials are made once (`createSolidKit`) and shared.
 *
 * Every colour also has its own pattern marked on it (dots, stripes, hatching), as on the flat shapes, so colour is never the only clue:
 * the pattern is drawn on a small canvas and wrapped round the solid.
 *
 * @typedef {ReturnType<typeof createSolidKit>} SolidKit
 * @typedef {{ group: Group, spinners: Mesh[], pickable: Mesh[] }} ItemModel `spinners` are the pieces that turn on the spot while idle
 *   (an arrow never does: its angle is what the case is about).
 */

const INK = '#1f2544';
const TILE = 64;

/** The marks of each colour's pattern, in the same spirit as the flat shapes' (`ui/TokenView.js`). Yellow is plain. */
const MARKS = {
  orange: (ctx) => { ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 6, 0, Math.PI * 2); ctx.fill(); },
  sky: (ctx) => { ctx.fillRect(0, TILE / 2 - 3, TILE, 6); },
  green: (ctx) => { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-8, TILE + 8); ctx.lineTo(TILE + 8, -8); ctx.stroke(); },
  yellow: () => {},
  blue: (ctx) => { ctx.fillRect(TILE / 2 - 2.5, 0, 5, TILE); ctx.fillRect(0, TILE / 2 - 2.5, TILE, 5); },
  red: (ctx) => { ctx.fillRect(TILE / 2 - 3.5, 0, 7, TILE); },
  purple: (ctx) => { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(TILE + 8, TILE + 8); ctx.stroke(); },
};

function patternTexture(colorId) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS[colorId] ?? '#cccccc';
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  (MARKS[colorId] ?? MARKS.yellow)(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

function numberTexture(n) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffdf3';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = String(n);
  ctx.font = `800 ${text.length > 2 ? 62 : text.length > 1 ? 78 : 92}px system-ui, sans-serif`;
  ctx.fillText(text, 64, 68);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function starGeometry() {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.66 : 0.29;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  geometry.center();
  return geometry;
}

function arrowGeometry() {
  const k = 0.0165; // the flat arrow's outline (see `ui/TokenView.js`), scaled to this scene
  const points = [[0, 40], [30, 6], [12, 6], [12, -38], [-12, -38], [-12, 6], [-30, 6]];
  const shape = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * k, y * k) : shape.lineTo(x * k, y * k)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false });
  geometry.center();
  return geometry;
}

/** How high each solid's middle is above the pedestal's top, so that it stands on it (an arrow lies flat on it). */
const LIFT = { circle: 0.5, square: 0.425, triangle: 0.5, star: 0.54, arrow: 0.14 };

/** @param {{ detail: 'high'|'medium'|'low' }} quality */
export function createSolidKit(quality = { detail: 'high' }) {
  const seg = quality.detail === 'low' ? 14 : 28;
  const materials = new Map();
  const numbers = new Map();
  return {
    geometries: {
      circle: new SphereGeometry(0.5, seg, Math.max(8, seg / 2)),
      square: new BoxGeometry(0.85, 0.85, 0.85),
      triangle: new ConeGeometry(0.55, 1.0, seg),
      star: starGeometry(),
      arrow: arrowGeometry(),
      pedestal: new CylinderGeometry(PEDESTAL_HALF + 0.2, PEDESTAL_HALF + 0.3, 0.28, seg),
      ring: new TorusGeometry(PEDESTAL_HALF + 0.38, 0.06, 8, 48),
      number: new BoxGeometry(1.3, 1.3, 0.55),
    },
    /** The material of a colour, with its pattern (made the first time it is asked for). @param {string} colorId */
    material(colorId) {
      if (!materials.has(colorId)) materials.set(colorId, new MeshLambertMaterial({ map: patternTexture(colorId) }));
      return materials.get(colorId);
    },
    /** The materials of a number block: plain sides and the number on its front and back. @param {number} n */
    numberMaterials(n) {
      if (!numbers.has(n)) {
        const face = new MeshLambertMaterial({ map: numberTexture(n) });
        const side = new MeshLambertMaterial({ color: '#e9dcb4' });
        numbers.set(n, [side, side, side, side, face, face]); // +x, -x, +y, -y, +z, -z
      }
      return numbers.get(n);
    },
    plain: {
      pedestal: new MeshLambertMaterial({ color: '#f1e6c6' }),
      slot: new MeshLambertMaterial({ color: '#ffe08a' }),
      solved: new MeshLambertMaterial({ color: '#b7e4c7' }),
      ring: new MeshLambertMaterial({ color: '#7a5cff', emissive: '#3a2a99' }),
      slotRing: new MeshLambertMaterial({ color: '#ffffff', emissive: '#555555' }),
      felt: new MeshLambertMaterial({ color: '#2f5d50' }),
    },
  };
}

/**
 * The picture of one item standing on a pedestal: a number block, or the solid (or solids, for a group) of a token.
 * @param {SolidKit} kit
 * @param {import('../logic/equality.js').Item} item
 * @param {number} index Which item of the sequence (marked on each piece so a tap on it finds it).
 * @returns {ItemModel} Its parts stand on the pedestal's top, which is at height 0.
 */
export function buildItem(kit, item, index) {
  const group = new Group();
  const spinners = [];
  const pickable = [];
  if (typeof item === 'number') {
    const block = new Mesh(kit.geometries.number, kit.numberMaterials(item));
    block.position.y = 0.65;
    block.userData.index = index;
    group.add(block);
    pickable.push(block);
    return { group, spinners, pickable };
  }
  const geometry = kit.geometries[item.shape] ?? kit.geometries.circle;
  const spots = groupLayout(item.count ?? 1);
  for (const spot of spots) {
    const holder = new Group();
    holder.position.set(spot.x, 0, spot.z);
    const piece = new Mesh(geometry, kit.material(item.color));
    piece.position.y = (LIFT[item.shape] ?? 0.5) * spot.scale;
    piece.scale.setScalar(spot.scale);
    piece.userData.index = index;
    if (item.shape === 'arrow') {
      piece.rotation.x = -Math.PI / 2; // lay it flat, pointing away from the camera
      holder.rotation.y = arrowYaw(item.rotation ?? 0);
    } else spinners.push(piece);
    holder.add(piece);
    group.add(holder);
    pickable.push(piece);
  }
  return { group, spinners, pickable };
}
