/**
 * The single door to three.js. Games import the library from here and never from `src/vendor/`, so an
 * upgrade (or a slimmer custom build) changes one line instead of every 3D scene.
 *
 * Only 3D scenes may import this file. It pulls in about 2 MB of JavaScript, so a game must load its 3D
 * scene with a dynamic `import()` after `canUse3D()` says yes; the 2D version never pays for it.
 */
export * from '../../vendor/three/three.module.js';
