/**
 * Bubble movement. Everything here returns new objects and never changes its input, so it can be tested without a
 * screen and a frame never sees a half-updated state.
 */

/** Gentle up and down bob (in pixels) drawn on top of a bubble's real position; it never changes the physics. */
export const BOB_AMPLITUDE = 4;

/**
 * Where a bubble is drawn (and where a tap must land to pop it): its real position plus the bob.
 * @param {import('./bubbleFactory.js').Bubble} bubble
 * @param {number} time Seconds.
 * @returns {{ x: number, y: number }}
 */
export function displayPosition(bubble, time) {
  return { x: bubble.x, y: bubble.y + Math.sin(time * 1.6 + bubble.id * 1.7) * BOB_AMPLITUDE };
}

/** Do two circles overlap? @returns {boolean} */
export function circleCircle(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

/**
 * Moves a bubble and bounces it off the four walls. A bubble that is already outside (after the play area shrank) is
 * pulled in and sent back towards the middle.
 */
function moveOne(b, dt, { width, height }) {
  let { x, y, vx, vy } = b;
  x += vx * dt;
  y += vy * dt;
  if (x - b.r < 0) { x = b.r; vx = Math.abs(vx); }
  if (x + b.r > width) { x = width - b.r; vx = -Math.abs(vx); }
  if (y - b.r < 0) { y = b.r; vy = Math.abs(vy); }
  if (y + b.r > height) { y = height - b.r; vy = -Math.abs(vy); }
  return { ...b, x, y, vx, vy };
}

/**
 * Elastic collision of two equal-mass circles: they swap the part of their velocity along the line between their
 * centres, and are pushed apart so they do not stay stuck together.
 * @returns {[import('./bubbleFactory.js').Bubble, import('./bubbleFactory.js').Bubble]}
 */
export function bounce(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist === 0) { dx = 1; dy = 0; dist = 1; } // exactly on top of each other: pick a direction
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = a.r + b.r - dist;
  const push = overlap / 2;
  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  // Already moving apart: only separate them, do not swap velocities again.
  const j = relative < 0 ? relative : 0;
  return [
    { ...a, x: a.x - nx * push, y: a.y - ny * push, vx: a.vx + j * nx, vy: a.vy + j * ny },
    { ...b, x: b.x + nx * push, y: b.y + ny * push, vx: b.vx - j * nx, vy: b.vy - j * ny },
  ];
}

/**
 * One physics step: every bubble moves at its own constant velocity and bounces off the walls. With `collide`
 * (Hard) bubbles also bounce off each other.
 *
 * @param {readonly import('./bubbleFactory.js').Bubble[]} bubbles
 * @param {number} dt Seconds.
 * @param {import('./bubbleFactory.js').Bounds} bounds
 * @param {{ collide?: boolean }} [options]
 * @returns {import('./bubbleFactory.js').Bubble[]}
 */
export function step(bubbles, dt, bounds, { collide = false } = {}) {
  const moved = bubbles.map((b) => moveOne(b, dt, bounds));
  if (!collide) return moved;
  for (let i = 0; i < moved.length; i++) {
    for (let j = i + 1; j < moved.length; j++) {
      if (circleCircle(moved[i], moved[j])) [moved[i], moved[j]] = bounce(moved[i], moved[j]);
    }
  }
  // A bounce can push a bubble slightly past a wall; the next step corrects it, but keep it inside now so a tap
  // can never land on a bubble drawn outside the sea.
  return moved.map((b) => moveOne(b, 0, bounds));
}

/**
 * Keeps bubbles inside a play area that has changed size (the window was resized or the tablet rotated): positions
 * scale with the area, then are clamped so every bubble is fully inside.
 * @param {readonly import('./bubbleFactory.js').Bubble[]} bubbles
 * @param {import('./bubbleFactory.js').Bounds} from The old size.
 * @param {import('./bubbleFactory.js').Bounds} to The new size.
 * @returns {import('./bubbleFactory.js').Bubble[]}
 */
export function fitToBounds(bubbles, from, to) {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return bubbles.map((b) => {
    const x = Math.min(Math.max(b.x * sx, b.r), Math.max(b.r, to.width - b.r));
    const y = Math.min(Math.max(b.y * sy, b.r), Math.max(b.r, to.height - b.r));
    return { ...b, x, y };
  });
}

/**
 * The bubble under a point, if any. If several overlap the point the one drawn last (on top) wins.
 * @param {readonly import('./bubbleFactory.js').Bubble[]} bubbles
 * @param {number} x
 * @param {number} y
 * @param {number} time For the bob.
 * @returns {import('./bubbleFactory.js').Bubble|null}
 */
export function bubbleAt(bubbles, x, y, time) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const p = displayPosition(bubbles[i], time);
    if (Math.hypot(p.x - x, p.y - y) <= bubbles[i].r) return bubbles[i];
  }
  return null;
}
