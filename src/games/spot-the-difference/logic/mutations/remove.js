import { objectBox } from '../geometry.js';

/** Takes the object away from the right picture. */
export const remove = {
  id: 'remove', type: 'remove', targetKind: 'object',
  canApply: () => true,
  apply(object, { templates }) {
    const template = templates.get(object.template);
    return { replace: null, box: objectBox(object, template), label: `The ${template.name} is missing` };
  },
};
