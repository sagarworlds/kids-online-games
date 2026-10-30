import { shuffle } from '../../../../engine/utils/random.js';
import { newObject } from '../sceneBuilder.js';
import { findFreeSpot } from '../placement.js';
import { objectBox } from '../geometry.js';
import { withArticle } from '../labels.js';

const SPOT_ATTEMPTS = 60;

/**
 * Adds a new object to the right picture. It is a kind of object that is not in the picture yet, so it cannot be mistaken
 * for one that moved, and it goes where nothing is in either picture.
 */
export const add = {
  id: 'add', type: 'add', targetKind: 'scene',
  canApply: (_target, { theme, usedTemplates }) => theme.objects.some((id) => !usedTemplates.has(id)),
  apply(_target, { rng, templates, theme, usedTemplates, others, bounds, nextId }) {
    const fresh = shuffle(rng, theme.objects.filter((id) => !usedTemplates.has(id)));
    for (const templateId of fresh.slice(0, 6)) {
      const template = templates.get(templateId);
      const placed = findFreeSpot(newObject(nextId(), template, rng), others, templates, bounds, rng, SPOT_ATTEMPTS);
      if (placed) return { add: placed, box: objectBox(placed, template), label: `${withArticle(template.name)} was added` };
    }
    return null;
  },
};
