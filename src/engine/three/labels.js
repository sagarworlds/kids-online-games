import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, LinearFilter } from './three.js';

/**
 * Text inside a 3D scene (a number on a gate, a planet's name) drawn on a small canvas and shown as a
 * sprite that always faces the camera. three.js has no text of its own, and loading a font file for a
 * few words would cost more than this.
 *
 * Text that must be read by screen readers still belongs in the DOM around the stage, not in here.
 *
 * @param {string} text
 * @param {{
 *   color?: string, background?: string|null, fontSize?: number, fontFamily?: string,
 *   padding?: number, worldHeight?: number
 * }} [options] `worldHeight` is the sprite's height in scene units; its width follows the text.
 * @returns {import('./three.js').Sprite}
 */
export function makeLabel(text, options = {}) {
  const {
    color = '#1f2544',
    background = '#ffffff',
    fontSize = 64,
    // Devanagari-capable stack first, so Hindi labels render with the same fonts as the rest of the site.
    fontFamily = "'Noto Sans Devanagari', 'Mangal', system-ui, sans-serif",
    padding = 16,
    worldHeight = 1,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `700 ${fontSize}px ${fontFamily}`;
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  canvas.width = textWidth + padding * 2;
  canvas.height = Math.ceil(fontSize * 1.3) + padding * 2;

  // Setting width/height resets the context, so the font is applied again.
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (background) {
    ctx.fillStyle = background;
    const radius = Math.min(24, canvas.height / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // No mipmaps: the canvas is not a power of two and labels are seen at about their drawn size.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;

  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1);
  return sprite;
}
