import { hasWebGL2, resolveViewMode } from './support.js';
import { readViewPreference, saveViewPreference } from './viewPreference.js';

/**
 * One object a game's `main.js` uses to decide between its 3D and 2D scenes. It does not import
 * three.js, so asking costs nothing; the 3D scene itself is loaded with `import()` only when needed.
 *
 * @param {{
 *   storage: import('../services/StorageService.js').StorageService,
 *   slug: string,
 *   supported?: boolean
 * }} options `supported` is injected in tests; by default the browser is asked once.
 * @returns {{
 *   supported: boolean,
 *   mode: () => '3d'|'2d',
 *   choose: (mode: '3d'|'2d') => void,
 *   fallBack: () => void
 * }} `choose` saves the child's pick. `fallBack` switches to 2D for this visit only (after a 3D
 *   error), without overwriting what the child chose.
 */
export function createViewChoice({ storage, slug, supported = hasWebGL2() }) {
  let failed = false;
  return {
    supported,
    mode: () => resolveViewMode({ supported: supported && !failed, preference: readViewPreference(storage, slug) }),
    choose: (mode) => saveViewPreference(storage, slug, mode),
    fallBack: () => {
      failed = true;
    },
  };
}
