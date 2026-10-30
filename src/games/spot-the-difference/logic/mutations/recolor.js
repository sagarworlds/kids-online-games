import { differentColor } from '../color.js';
import { objectBox } from '../geometry.js';

/** How different a changed colour must be. Normal: a hue at least 90 degrees away and a different lightness. */
export const RECOLOR_LIMITS = Object.freeze({ minHue: 90, maxHue: 180, minLight: 12, minRgb: 110 });
/** Subtle (Hard only): closer in hue, but still clearly different when looked at. */
export const SUBTLE_LIMITS = Object.freeze({ minHue: 40, maxHue: 70, minLight: 10, minRgb: 70 });

function make(id, limits) {
  return {
    id, type: 'recolor', targetKind: 'object',
    /** Every template has a part in the object's own colour, so any object can change colour. */
    canApply: () => true,
    apply(object, { rng, templates }) {
      const template = templates.get(object.template);
      return {
        replace: { ...object, color: differentColor(object.color, rng, limits) },
        box: objectBox(object, template),
        label: `The ${template.name} changed colour`,
      };
    },
  };
}

/** Changes the colour: the hue is turned at least 90 degrees and the lightness changes too. */
export const recolor = make('recolor', RECOLOR_LIMITS);
/** A subtler colour change for the Hard level. */
export const subtleRecolor = make('subtle-recolor', SUBTLE_LIMITS);
