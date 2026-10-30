/** @typedef {import('./interpreter.js').Outcome} Outcome */

/**
 * The line shown under the board after a run. Wording is kid-friendly and
 * always says what went wrong and where ("at step 4").
 * @param {Outcome} outcome
 * @returns {{ tone: 'good'|'bad'|'info', text: string }}
 */
export function describeOutcome(outcome) {
  switch (outcome.status) {
    case 'empty':
      return { tone: 'info', text: 'Add some blocks first' };
    case 'crashed':
      return {
        tone: 'bad',
        text: outcome.crash.kind === 'edge'
          ? `Robot drove off the edge at step ${outcome.crash.step}`
          : `Robot hit a wall at step ${outcome.crash.step}`,
      };
    case 'too-many-steps':
      return { tone: 'bad', text: 'Too many steps!' };
    case 'missed-goal':
      return { tone: 'bad', text: 'The robot stopped before the battery. Try again!' };
    default:
      return { tone: 'good', text: 'The battery is charged!' };
  }
}

/**
 * A hint shown after two failed runs on the same level: the level's own tip
 * first, then advice that fits what actually went wrong.
 * @param {{ tip: string }} level
 * @param {Outcome} outcome
 * @returns {string}
 */
export function hintAfterFailures(level, outcome) {
  const byOutcome = {
    crashed: 'Use Step to watch the robot one block at a time. Which way is it facing when it bumps?',
    'too-many-steps': 'Your program goes on and on. Check what is inside your Repeat blocks.',
    'missed-goal': 'Count the squares between the robot and the battery.',
  };
  return [level.tip, byOutcome[outcome.status]].filter(Boolean).join(' ');
}
