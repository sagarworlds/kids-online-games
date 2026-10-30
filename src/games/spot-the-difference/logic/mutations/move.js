import { objectBox, unionBox } from '../geometry.js';
import { fits } from '../placement.js';

/** The object moves at least this far (scene units) and at most MAX_MOVE. */
export const MIN_MOVE = 48;
export const MAX_MOVE = 100;
const ATTEMPTS = 40;

export const move = {
  id: 'move', type: 'move', targetKind: 'object',
  canApply: () => true,
  apply(object, { rng, templates, others, bounds }) {
    const template = templates.get(object.template);
    for (let i = 0; i < ATTEMPTS; i++) {
      const distance = MIN_MOVE + rng() * (MAX_MOVE - MIN_MOVE);
      const angle = rng() * Math.PI * 2;
      const next = { ...object, x: object.x + Math.cos(angle) * distance, y: object.y + Math.sin(angle) * distance };
      if (!fits(next, others, templates, bounds)) continue;
      return { replace: next, box: unionBox(objectBox(object, template), objectBox(next, template)), label: `The ${template.name} moved` };
    }
    return null;
  },
};
