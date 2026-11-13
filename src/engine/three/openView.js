import { logError } from '../utils/errors.js';

/**
 * Opens a screen in the child's chosen view: its 3D version when the choice (and the device) say 3D, its flat version otherwise.
 *
 * three.js is about 2 MB, so a 3D screen is loaded with `import()` only when it is needed: the 2D game and the home page never
 * download it. Anything that goes wrong on the way into 3D (the file will not load, the device has no WebGL 2, the scene fails to start) is
 * logged, this visit switches to 2D (`view.fallBack()`, which does not touch what the child chose), and the flat screen opens instead,
 * so a child never sees a blank screen or an error for a view they did not need. (If 3D stops later, inside a scene that is already open,
 * that scene switches itself to its flat view in place; see `Stage3D`.)
 *
 * @param {{
 *   view: { mode: () => '3d'|'2d', fallBack: () => void },
 *   scenes: { replace: (scene: unknown, params?: unknown) => unknown },
 *   where: string,
 *   load: () => Promise<any>,
 *   make: (module: any) => unknown,
 *   params?: unknown,
 *   open2d: () => unknown,
 *   whileLoading?: () => (() => void)
 * }} options `view` is the game's `createViewChoice`. `where` labels the log line (for example 'lights-out:3d'). `load` imports the 3D
 *   scene's module and `make` builds the scene from it; the scene is opened with `params`. `open2d` opens the flat version. `whileLoading`
 *   starts something to show while a slow load goes on (a "getting ready" screen after a short delay) and returns a function that stops it;
 *   it is stopped when the load ends, whichever way.
 * @returns {Promise<void>} Resolves once a screen has been opened, 3D or flat.
 */
export async function openScreen({ view, scenes, where, load, make, params, open2d, whileLoading }) {
  if (view.mode() === '3d') {
    const stopWaiting = whileLoading?.();
    try {
      const module = await load();
      stopWaiting?.();
      scenes.replace(make(module), params);
      return;
    } catch (error) {
      stopWaiting?.();
      logError(error, where);
      view.fallBack();
    }
  }
  open2d();
}
