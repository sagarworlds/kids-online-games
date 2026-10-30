/**
 * @typedef {'lineup'|'weigh'|'quiz'} ModeId
 * @typedef {{ id: ModeId, label: string, icon: string, blurb: string }} ModeConfig
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string,
 *   lineup: { showNames: boolean, showNumbers: boolean },
 *   weigh: { ownWeight: boolean, options: number },
 *   quiz: { options: number }
 * }} LevelConfig
 *
 * `lineup.showNames` / `showNumbers`: Easy labels each planet and each orbit slot (1-8); Medium keeps the names but
 * the slots are blank; Hard shows only the pictures, so the child has to know what each planet looks like.
 * `weigh.ownWeight`: Easy picks a weight from the toys; Medium and Hard type their own. `options` is how many planets
 * the "mystery planet" questions offer, and `quiz.options` how many answers a quiz question offers.
 */

/** @type {Readonly<Record<ModeId, Readonly<ModeConfig>>>} */
export const MODES = Object.freeze({
  lineup: Object.freeze({ id: 'lineup', label: 'Line them up', icon: '🪐', blurb: 'Drag the planets into order, starting next to the Sun' }),
  weigh: Object.freeze({ id: 'weigh', label: 'Weigh-in', icon: '⚖️', blurb: 'Hop from planet to planet and see how heavy you would feel' }),
  quiz: Object.freeze({ id: 'quiz', label: 'Planet quiz', icon: '❓', blurb: '10 questions about the planets' }),
});
export const MODE_IDS = Object.freeze(Object.keys(MODES));

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({
    id: 'easy', label: 'Easy', blurb: 'Names and numbers to help you',
    lineup: Object.freeze({ showNames: true, showNumbers: true }),
    weigh: Object.freeze({ ownWeight: false, options: 3 }),
    quiz: Object.freeze({ options: 3 }),
  }),
  medium: Object.freeze({
    id: 'medium', label: 'Medium', blurb: 'Names, but no numbers',
    lineup: Object.freeze({ showNames: true, showNumbers: false }),
    weigh: Object.freeze({ ownWeight: true, options: 4 }),
    quiz: Object.freeze({ options: 4 }),
  }),
  hard: Object.freeze({
    id: 'hard', label: 'Hard', blurb: 'Pictures only, tricky questions',
    lineup: Object.freeze({ showNames: false, showNumbers: false }),
    weigh: Object.freeze({ ownWeight: true, options: 5 }),
    quiz: Object.freeze({ options: 4 }),
  }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

export const QUIZ_QUESTIONS = 10;
/** The weigh-in ends with this many "which planet is it?" questions. 5 makes one slip worth 2 stars, as in the quiz. */
export const MYSTERY_QUESTIONS = 5;
/** The child must have hopped to this many places before the mystery questions open, so there is something to go on. */
export const MIN_STOPS_BEFORE_MYSTERY = 3;

/**
 * Stars are saved per mode and level, so Easy line-up and Hard quiz keep separate bests.
 * @param {ModeId} mode
 * @param {'easy'|'medium'|'hard'} levelId
 * @returns {string}
 */
export const levelKey = (mode, levelId) => `${mode}-${levelId}`;
