import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the rocket and astronaut are doing on the 3D weigh-in (see `three/Weigh3DScene.js`).
 *
 * - `resting`: the rocket stands on a body and nothing moves; "Jump again" is allowed.
 * - `flying`: the rocket is on its way to a body. A new hop is accepted at once and sends it to the new place from
 *   where it is, so a quick child is never told to wait.
 * - `jumping`: the astronaut has stepped out and is jumping to show the gravity. Hopping away ends it.
 *
 * Only the `flying` state hides the astronaut (they are inside the rocket), which the scene asks with the `inside` tag.
 */
export const ROCKET_TRIP_MACHINE = defineMachine({
  id: 'planet-hop/rocket-trip',
  initial: 'resting',
  states: {
    resting: { on: { HOP: 'flying', JUMP: 'jumping' } },
    flying: { tags: ['inside'], on: { HOP: 'flying', LAND: 'jumping' } },
    jumping: { on: { HOP: 'flying', JUMP: 'jumping', SETTLE: 'resting' } },
  },
});
