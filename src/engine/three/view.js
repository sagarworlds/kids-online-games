import { readDevice } from './deviceVerdict.js';
import { hasWebGL2, isWeakDevice, resolveViewMode } from './support.js';
import { readViewPreference, saveViewPreference } from './viewPreference.js';

/**
 * One object a game's `main.js` uses to decide between its 3D and 2D scenes. It does not import
 * three.js, so asking costs nothing; the 3D scene itself is loaded with `import()` only when needed.
 *
 * @param {{
 *   storage: import('../services/StorageService.js').StorageService,
 *   slug: string,
 *   supported?: boolean,
 *   hints?: { deviceMemory?: number, hardwareConcurrency?: number }
 * }} options `supported` and `hints` are injected in tests; by default the browser is asked (`supported` once).
 * @returns {{
 *   supported: boolean,
 *   mode: () => '3d'|'2d',
 *   choose: (mode: '3d'|'2d') => void,
 *   fallBack: () => void
 * }} `choose` saves the child's pick. `fallBack` switches to 2D for this visit only (after a 3D
 *   error), without overwriting what the child chose.
 */
export function createViewChoice({
  storage, slug, supported = hasWebGL2(),
  hints = { deviceMemory: globalThis.navigator?.deviceMemory, hardwareConcurrency: globalThis.navigator?.hardwareConcurrency },
}) {
  let failed = false;
  return {
    supported,
    // With no choice yet, a device that has shown 3D is too slow for it (or is very weak) opens flat; the child's own choice always wins.
    mode: () => resolveViewMode({
      supported: supported && !failed,
      preference: readViewPreference(storage, slug),
      slowDevice: readDevice(storage).slow3d || isWeakDevice(hints),
    }),
    choose: (mode) => saveViewPreference(storage, slug, mode),
    fallBack: () => {
      failed = true;
    },
  };
}
