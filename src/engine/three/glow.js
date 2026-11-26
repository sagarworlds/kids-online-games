import { Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending } from './three.js';

/**
 * A soft round glow, for a sun or a firefly. It is a flat picture that always faces the camera, drawn on a small canvas once and added to
 * whatever is behind it (so it can only make things brighter, which is what light does). Add it as a child of the thing that glows.
 */

/** The colour stops of a glow, from the middle outwards: [position 0..1, a CSS colour]. The last one should be fully transparent. */
export const SUN_GLOW = Object.freeze([[0.2, 'rgba(255, 230, 120, 0.95)'], [0.55, 'rgba(255, 190, 60, 0.35)'], [1, 'rgba(255, 160, 0, 0)']]);
export const FIREFLY_GLOW = Object.freeze([[0.15, 'rgba(255, 255, 190, 0.95)'], [0.5, 'rgba(200, 255, 90, 0.4)'], [1, 'rgba(160, 255, 40, 0)']]);

/**
 * The glow's picture. Make it once and give it to every sprite that shares it (a board of twenty-five fireflies needs one picture, not
 * twenty-five).
 * @param {readonly (readonly [number, string])[]} [stops] A colour ramp such as `SUN_GLOW` (the default) or `FIREFLY_GLOW`.
 * @returns {CanvasTexture}
 */
export function createGlowTexture(stops = SUN_GLOW) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) fade.addColorStop(at, color);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

/**
 * @param {readonly (readonly [number, string])[]|CanvasTexture} [source] A colour ramp (a picture is made for this sprite alone) or a texture from
 *   `createGlowTexture` to share.
 * @returns {Sprite} One unit wide; scale it to the size wanted. It frees with the rest of its scene (`disposeObject` frees its texture).
 */
export function createGlowSprite(source = SUN_GLOW) {
  const map = Array.isArray(source) ? createGlowTexture(source) : source;
  return new Sprite(new SpriteMaterial({ map, blending: AdditiveBlending, transparent: true, depthWrite: false }));
}
