import { objectBox, unionBox } from '../geometry.js';
import { fits } from '../placement.js';

/** The object turns by at least 25 degrees (and at most 70), either way. */
export const MIN_TURN = 25;
export const MAX_TURN = 70;
const ATTEMPTS = 20;

export const rotate = {
  id: 'rotate', type: 'rotate', targetKind: 'object',
  /** Turning something that looks the same every way (a ball, a sun) would show nothing. */
  canApply: (object, { templates }) => templates.get(object.template).noRotate !== true,
  apply(object, { rng, templates, others, bounds }) {
    const template = templates.get(object.template);
    for (let i = 0; i < ATTEMPTS; i++) {
      const turn = (MIN_TURN + 3 + rng() * (MAX_TURN - MIN_TURN - 3)) * (rng() < 0.5 ? -1 : 1);
      const next = { ...object, rotation: Math.round((object.rotation + turn) * 10) / 10 };
      if (!fits(next, others, templates, bounds)) continue;
      return { replace: next, box: unionBox(objectBox(object, template), objectBox(next, template)), label: `The ${template.name} turned` };
    }
    return null;
  },
};
