import { AmbientLight, DirectionalLight, Fog, Mesh, BoxGeometry, MeshBasicMaterial } from '../../../engine/three/three.js';
import { Stage3D } from '../../../engine/three/Stage3D.js';
import { makeLabel } from '../../../engine/three/labels.js';
import {
  GHOST_LANE_X, PLAYER_LANE_X, carZ, cameraFor, wobbleSway,
} from '../logic/track3d.js';
import { createCar, createFlame, createTrack } from './trackModels.js';

/**
 * The race track in 3D: the road seen from behind the player's car, the ghost in the next lane drawn see-through, a rush of
 * speed (a wider view, a flame and streaks) after a right answer, and a sway and a cross after a wrong one.
 *
 * It does what the 2D `drawTrack` does: it is handed the same state each frame and keeps nothing of its own that matters, so the
 * race scene decides what moves and the picture only shows it. Everything the picture says is also in the page (the question,
 * how many are done, the time), so a child who cannot see it loses nothing.
 *
 * @typedef {{
 *   player: number, ghost: number, scroll: number, time: number,
 *   wobble: number, boost: number, wheel: number, reduced: boolean, count: number
 * }} TrackState  The same numbers the 2D track draws from (progress 0 to 1; `wobble` and `boost` fade from 1 to 0).
 * @typedef {{ paint: (state: TrackState) => void, dispose: () => void }} TrackView3D
 */

const STREAKS = 6;

/**
 * @param {{ container: HTMLElement, count: number, onContextLost: () => void }} options `container` is the empty box the
 *   canvas fills; it keeps whatever else is inside it (the Ready, Set, Go banner).
 * @returns {TrackView3D}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' when the device cannot do 3D; the scene
 *   then keeps the 2D track.
 */
export function createTrackView3D({ container, count, onContextLost }) {
  const stage = new Stage3D({ container, background: '#8fdcff', fov: 55, near: 0.2, far: 260, label: 'Race track seen from behind your car. Your car is red; the see-through grey car is the ghost.', onContextLost });
  const { scene, camera, quality } = stage;
  const { detail } = quality;
  scene.fog = new Fog('#cdeeff', 60, 170);
  scene.add(new AmbientLight('#ffffff', Math.PI * 0.65));
  const sun = new DirectionalLight('#ffffff', Math.PI * 0.8);
  sun.position.set(6, 12, 8);
  scene.add(sun);
  scene.add(createTrack({ count, detail }));

  const player = createCar({ color: '#e63946', ghost: false, detail });
  const ghost = createCar({ color: '#8d99ae', ghost: true, detail });
  const flame = createFlame();
  player.root.add(flame);
  scene.add(player.root, ghost.root);

  // Names above the cars (so they are told apart by more than colour), and a cross above the player after a mistake.
  const youLabel = makeLabel('You', { worldHeight: 0.8, fontSize: 56 });
  const ghostLabel = makeLabel('Ghost', { worldHeight: 0.8, fontSize: 56, background: 'rgba(255,255,255,0.8)' });
  const crossLabel = makeLabel('✖', { worldHeight: 0.9, fontSize: 64, color: '#b3261e' });
  youLabel.position.set(0, 2.6, 0);
  ghostLabel.position.set(0, 2.6, 0);
  crossLabel.position.set(0, 3.7, 0);
  crossLabel.visible = false;
  player.root.add(youLabel, crossLabel);
  ghost.root.add(ghostLabel);

  // Thin white streaks that rush past the player's car after a right answer (the world seems to move faster).
  const streakMaterial = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const streakShape = new BoxGeometry(0.06, 0.06, 2.4);
  const streaks = Array.from({ length: STREAKS }, (_, i) => {
    const streak = new Mesh(streakShape, streakMaterial);
    streak.position.set(PLAYER_LANE_X + (i - (STREAKS - 1) / 2) * 0.45, 0.5 + (i % 3) * 0.55, 0);
    streak.visible = false;
    scene.add(streak);
    return streak;
  });

  let lastFov = 55;
  return {
    paint(state) {
      const { width, height } = stage.size;
      const sway = wobbleSway({ time: state.time, wobble: state.wobble, reduced: state.reduced });
      player.root.position.set(PLAYER_LANE_X + sway.x, 0, carZ(state.player));
      player.root.rotation.z = sway.roll;
      ghost.root.position.set(GHOST_LANE_X, 0, carZ(state.ghost));
      for (const wheel of player.wheels) wheel.rotation.x = -state.wheel;
      for (const wheel of ghost.wheels) wheel.rotation.x = -state.wheel;
      flame.visible = !state.reduced && state.boost > 0.02;
      flame.scale.y = Math.max(0.001, state.boost);
      crossLabel.visible = state.wobble > 0;
      const rush = state.reduced ? 0 : state.boost;
      streakMaterial.opacity = 0.7 * rush;
      streaks.forEach((streak, i) => {
        streak.visible = rush > 0;
        // They slide towards the camera as the car goes forward, wrapping round so there is always a stream of them.
        streak.position.z = carZ(state.player) - 9 + ((i * 4.7 + state.scroll * 0.05) % 16);
      });

      const view = cameraFor({ player: state.player, ghost: state.ghost, boost: state.reduced ? 0 : state.boost, aspect: width / height });
      camera.position.set(view.position.x, view.position.y, view.position.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      if (view.fov !== lastFov) {
        camera.fov = view.fov;
        camera.updateProjectionMatrix();
        lastFov = view.fov;
      }
      stage.render();
    },
    dispose: () => stage.dispose(),
  };
}
