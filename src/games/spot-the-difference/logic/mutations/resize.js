import { shuffle } from '../../../../engine/utils/random.js';
import { objectBox, unionBox } from '../geometry.js';
import { fits } from '../placement.js';

/** The object gets 30% bigger or 30% smaller. */
export const RESIZE_FACTORS = Object.freeze([1.3, 0.7]);
/** After shrinking, an object's longer side must still be at least this big (nothing too small to spot). */
export const MIN_SHRUNK_SIZE = 36;

export const resize = {
  id: 'resize', type: 'resize', targetKind: 'object',
  canApply: () => true,
  apply(object, { rng, templates, others, bounds }) {
    const template = templates.get(object.template);
    for (const factor of shuffle(rng, RESIZE_FACTORS)) {
      const next = { ...object, scale: Math.round(object.scale * factor * 1000) / 1000 };
      if (factor < 1 && Math.max(template.w, template.h) * next.scale < MIN_SHRUNK_SIZE) continue;
      if (factor > 1 && !fits(next, others, templates, bounds)) continue;
      return {
        replace: next,
        box: unionBox(objectBox(object, template), objectBox(next, template)),
        label: `The ${template.name} got ${factor > 1 ? 'bigger' : 'smaller'}`,
      };
    }
    return null;
  },
};
