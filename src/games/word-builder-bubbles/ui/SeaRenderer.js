import { displayPosition } from '../logic/physics.js';

const INK = '#0b2a5b';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

/**
 * Draws the underwater scene and the bubbles on the canvas. Pure drawing: it reads a state object and keeps nothing
 * of its own.
 *
 * A hinted bubble gets a thick dashed ring as well as a glow, so the hint is a shape and not just a colour.
 *
 * @typedef {{
 *   bubbles: readonly import('../logic/bubbleFactory.js').Bubble[], time: number, glowId: number|null,
 *   drifting: readonly { bubble: import('../logic/bubbleFactory.js').Bubble, ttl: number }[],
 *   sparkles: readonly { x: number, y: number, ttl: number }[], reduced: boolean, complete: boolean
 * }} SeaState
 */

function drawBubble(ctx, x, y, r, letter, { alpha = 1, glow = false, time = 0, wobble = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + wobble, y);
  const fill = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  fill.addColorStop(0, 'rgba(255,255,255,0.97)');
  fill.addColorStop(1, 'rgba(176,228,255,0.9)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // little highlight
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.16, r * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();

  if (glow) {
    const pulse = 1 + 0.08 * Math.sin(time * 9);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffd23f';
    ctx.setLineDash([10, 6]);
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, (r + 7) * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = INK;
  ctx.font = `800 ${Math.round(r * 1.15)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter.toUpperCase(), 0, r * 0.06);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} rect The sea's place on the canvas.
 * @param {SeaState} s
 */
export function drawSea(ctx, rect, s) {
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.beginPath();
  ctx.rect(0, 0, rect.w, rect.h);
  ctx.clip();

  const water = ctx.createLinearGradient(0, 0, 0, rect.h);
  water.addColorStop(0, '#5ec8f2');
  water.addColorStop(1, '#0f5f9e');
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, rect.w, rect.h);

  // light rays from the surface
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 4; i++) {
    const x = (rect.w * (i + 0.5)) / 4 + (s.reduced ? 0 : Math.sin(s.time * 0.4 + i) * 12);
    ctx.beginPath();
    ctx.moveTo(x - 18, 0);
    ctx.lineTo(x + 18, 0);
    ctx.lineTo(x + 60, rect.h);
    ctx.lineTo(x - 60, rect.h);
    ctx.closePath();
    ctx.fill();
  }
  // sandy floor and weed
  ctx.fillStyle = '#e8d28a';
  ctx.fillRect(0, rect.h - 10, rect.w, 10);
  ctx.strokeStyle = '#2f8f5b';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = (rect.w * (i + 0.5)) / 6;
    const sway = s.reduced ? 0 : Math.sin(s.time * 1.2 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(x, rect.h - 8);
    ctx.quadraticCurveTo(x + sway, rect.h - 24, x - sway, rect.h - 38);
    ctx.stroke();
  }

  for (const b of s.bubbles) {
    const p = s.reduced ? { x: b.x, y: b.y } : displayPosition(b, s.time);
    drawBubble(ctx, p.x, p.y, b.r, b.letter, { glow: b.id === s.glowId, time: s.time });
  }
  // wrong bubbles wobble and rise away
  for (const d of s.drifting) {
    const k = 1 - d.ttl;
    drawBubble(ctx, d.bubble.x, d.bubble.y - k * 70, d.bubble.r, d.bubble.letter, {
      alpha: Math.max(0, d.ttl), wobble: s.reduced ? 0 : Math.sin(k * 40) * 6 * d.ttl,
    });
  }
  ctx.fillStyle = '#fff7b0';
  for (const sp of s.sparkles) {
    ctx.globalAlpha = Math.max(0, sp.ttl / 0.6);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
