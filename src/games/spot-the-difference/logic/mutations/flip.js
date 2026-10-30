import { objectBox } from '../geometry.js';

/** Turns the object round to face the other way. Only for objects that look different when mirrored. */
export const flip = {
  id: 'flip', type: 'flip', targetKind: 'object',
  canApply: (object, { templates }) => templates.get(object.template).asymmetric === true,
  apply(object, { templates }) {
    const template = templates.get(object.template);
    return { replace: { ...object, flip: !object.flip }, box: objectBox(object, template), label: `The ${template.name} faces the other way` };
  },
};
