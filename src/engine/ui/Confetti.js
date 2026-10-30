import { prefersReducedMotion } from '../utils/motion.js';

const COLOURS = ['#5b3df5', '#ff8a00', '#ffd23f', '#1b7f3b', '#e8467c', '#2f7de1'];

/**
 * Celebratory confetti on a temporary full-screen canvas.
 * Does nothing when the player prefers reduced motion.
 *
 * @param {{ count?: number, duration?: number, rng?: () => number }} [options]
 *   `duration` in ms.
 * @returns {() => void} Call to stop early.
 */
export function launchConfetti({ count = 90, duration = 2200, rng = Math.random } = {}) {
  if (prefersReducedMotion() || typeof document === 'undefined') return () => {};

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');

  const pieces = Array.from({ length: count }, () => ({
    x: rng() * canvas.width,
    y: -20 - rng() * canvas.height * 0.4,
    vx: (rng() - 0.5) * 200,
    vy: 120 + rng() * 220,
    size: 6 + rng() * 8,
    spin: (rng() - 0.5) * 10,
    angle: rng() * Math.PI * 2,
    colour: COLOURS[Math.floor(rng() * COLOURS.length)],
  }));

  let frame = 0;
  let last = performance.now();
  const startedAt = last;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    canvas.remove();
  };

  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (now - startedAt > duration) stop();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return stop;
}
