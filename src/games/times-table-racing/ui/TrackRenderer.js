import { clamp } from '../../../engine/utils/geometry.js';

/**
 * Draws the side-view race track on the canvas: sky, parallax hills, a two-lane road with the ghost in the top lane
 * and the player in the bottom lane, and a chequered finish line. Pure drawing: it reads a state object and keeps
 * nothing of its own, so the scene decides what moves.
 *
 * Meaning never depends on colour alone: the player's car says "You", the ghost is see-through with a dashed outline
 * and says "Ghost", and a wobbling car shows a cross above it.
 *
 * @typedef {{
 *   player: number, ghost: number, scroll: number, time: number,
 *   wobble: number, boost: number, wheel: number, reduced: boolean, count: number
 * }} TrackState  Progress values are 0 to 1; `wobble` and `boost` are 0 to 1 and fade out; `count` is the number of ticks.
 */

const INK = '#1f2544';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const CAR_WIDTH = 72;
const SIDE_MARGIN = 34;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCloud(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
  ctx.arc(x + 16 * s, y - 8 * s, 18 * s, 0, Math.PI * 2);
  ctx.arc(x + 36 * s, y, 14 * s, 0, Math.PI * 2);
  ctx.fill();
}

/** A hill line: a sine wave that scrolls with the camera at `speed` (far hills move slower than near ones). */
function drawHills(ctx, rect, horizon, { height, wavelength, speed, color }, scroll) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(rect.x, horizon);
  for (let x = 0; x <= rect.w; x += 6) {
    ctx.lineTo(rect.x + x, horizon - height * (0.55 + 0.45 * Math.sin((x + scroll * speed) / wavelength)));
  }
  ctx.lineTo(rect.x + rect.w, horizon);
  ctx.closePath();
  ctx.fill();
}

function drawWheel(ctx, x, y, r, angle) {
  ctx.fillStyle = '#2b2f45';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cfd3e6';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * (r - 2), y - Math.sin(a) * (r - 2));
    ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    ctx.stroke();
  }
}

/**
 * One car, side-on, facing right. (x, y) is the middle of the car where its wheels touch the road.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, scale: number, color: string, ghost: boolean, wheel: number, label: string, lean: number }} car
 */
function drawCar(ctx, { x, y, scale, color, ghost, wheel, label, lean }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.scale(scale, scale);
  ctx.globalAlpha = ghost ? 0.55 : 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  if (ghost) ctx.setLineDash([6, 4]);

  // body and cabin
  ctx.fillStyle = color;
  roundRect(ctx, -36, -24, 72, 20, 7);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-16, -24);
  ctx.lineTo(-8, -38);
  ctx.lineTo(14, -38);
  ctx.lineTo(24, -24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // window and headlight
  ctx.fillStyle = '#d9f4ff';
  ctx.beginPath();
  ctx.moveTo(-10, -26);
  ctx.lineTo(-5, -35);
  ctx.lineTo(12, -35);
  ctx.lineTo(19, -26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3a8';
  ctx.fillRect(32, -20, 5, 6);

  drawWheel(ctx, -20, -3, 9, wheel);
  drawWheel(ctx, 20, -3, 9, wheel);

  // label tag, drawn upright above the car
  ctx.globalAlpha = 1;
  ctx.font = `800 ${13}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillText(label, 0, -44);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} rect The part of the canvas the track may use.
 * @param {TrackState} s
 */
export function drawTrack(ctx, rect, s) {
  const { x, y, w, h } = rect;
  if (w < 40 || h < 40) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // sky
  const sky = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  sky.addColorStop(0, '#8fdcff');
  sky.addColorStop(1, '#e8f9ff');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(x + w - 56, y + 34, 20, 0, Math.PI * 2);
  ctx.fill();

  // clouds drift left as the car goes forward
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 0.31 * w - s.scroll * 0.15) % (w + 120) + (w + 120)) % (w + 120) - 60;
    drawCloud(ctx, x + cx, y + 24 + (i % 2) * 26, 0.8 + (i % 3) * 0.2);
  }

  // hills
  const horizon = y + h * 0.46;
  drawHills(ctx, rect, horizon, { height: h * 0.2, wavelength: 90, speed: 0.25, color: '#9ad48a' }, s.scroll);
  drawHills(ctx, rect, horizon + 2, { height: h * 0.12, wavelength: 55, speed: 0.5, color: '#6bb86a' }, s.scroll);

  // road, two lanes
  const roadTop = horizon;
  ctx.fillStyle = '#4a4f63';
  ctx.fillRect(x, roadTop, w, y + h - roadTop);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(x, roadTop, w, 3);
  const laneH = (y + h - roadTop) / 2;
  const ghostY = roadTop + laneH * 0.72;
  const playerY = roadTop + laneH * 1.72;

  // dashed divider scrolls with the camera
  ctx.strokeStyle = '#f2f2f2';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 14]);
  ctx.lineDashOffset = -(s.scroll % 32);
  ctx.beginPath();
  ctx.moveTo(x, roadTop + laneH);
  ctx.lineTo(x + w, roadTop + laneH);
  ctx.stroke();
  ctx.setLineDash([]);

  // start line, finish line and 1/20 ticks
  const x0 = x + SIDE_MARGIN;
  const x1 = x + w - SIDE_MARGIN;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(x0 - 2, roadTop + 4, 4, y + h - roadTop - 4);
  const squares = 6;
  const sq = (y + h - roadTop - 4) / squares;
  for (let i = 0; i < squares; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : INK;
      ctx.fillRect(x1 + j * 7, roadTop + 4 + i * sq, 7, sq);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 1; i < s.count; i++) {
    const tx = x0 + ((x1 - x0) * i) / s.count;
    ctx.fillRect(tx - 1, y + h - 8, 2, 8);
    ctx.fillRect(tx - 1, roadTop + laneH - 8, 2, 8);
  }

  const scale = clamp(h / 200, 0.6, 1.25);
  const carX = (progress) => x0 + (CAR_WIDTH * scale) / 2 + progress * (x1 - x0 - CAR_WIDTH * scale);

  drawCar(ctx, { x: carX(s.ghost), y: ghostY, scale, color: '#8d99ae', ghost: true, wheel: s.wheel, label: 'Ghost', lean: 0 });

  // speed lines behind the player after a correct answer
  if (s.boost > 0 && !s.reduced) {
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * s.boost})`;
    ctx.lineWidth = 3;
    const px = carX(s.player) - (CAR_WIDTH * scale) / 2;
    for (let i = 0; i < 4; i++) {
      const ly = playerY - 8 * scale - i * 7 * scale;
      ctx.beginPath();
      ctx.moveTo(px - 6, ly);
      ctx.lineTo(px - (28 + i * 8) * scale * s.boost - 6, ly);
      ctx.stroke();
    }
  }

  const shake = s.reduced ? 0 : Math.sin(s.time * 45) * 3 * s.wobble;
  drawCar(ctx, { x: carX(s.player), y: playerY + shake, scale, color: '#e63946', ghost: false, wheel: s.wheel, label: 'You', lean: s.reduced ? 0 : shake * 0.012 });
  if (s.wobble > 0) {
    // a cross above the car says "oops" without relying on the wobble
    ctx.fillStyle = '#b3261e';
    ctx.font = `800 ${18}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('✖', carX(s.player), playerY - 62 * scale);
  }
  ctx.restore();
}
