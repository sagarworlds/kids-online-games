import { starsForAccuracy } from '../../../engine/utils/stars.js';

/**
 * Stars for a Challenge or a Revision round: the share of questions answered right the first time, with the shared 90% and
 * 70% rules (questions left unanswered when the time ran out count as wrong).
 * @param {{ correct: number, total: number }} result
 * @returns {1|2|3}
 */
export const quizStars = ({ correct, total }) => starsForAccuracy(total === 0 ? 0 : correct / total);

/**
 * Stars for the ladder: no mistakes is 3, up to 2 is 2, otherwise 1.
 * @param {number} mistakes
 * @returns {1|2|3}
 */
export const ladderStars = (mistakes) => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);

/** The score of a Challenge: 10 for each right answer and a point for each whole second left. */
export const challengeScore = ({ correct, secondsLeft }) => correct * 10 + Math.max(0, Math.floor(secondsLeft));
