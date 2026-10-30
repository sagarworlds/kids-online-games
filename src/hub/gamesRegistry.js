/**
 * The single list of games. The hub, the star totals and the "New" badges all
 * read from here, so adding a game means adding one entry (and flipping
 * `available` to true once its folder exists).
 *
 * @typedef {{
 *   slug: string, title: string, subject: SubjectId, icon: string,
 *   path: string, learningTag: string, available: boolean
 * }} GameEntry
 * @typedef {'math'|'language'|'logic'|'science'|'memory'} SubjectId
 */

/** Subject chips (`label`) and the section headings (`heading`) on the home page. */
export const SUBJECTS = Object.freeze([
  { id: 'math', label: 'Math', heading: 'Math' },
  { id: 'language', label: 'Language', heading: 'Language' },
  { id: 'logic', label: 'Logic', heading: 'Logic' },
  { id: 'science', label: 'Science', heading: 'Science & world' },
  { id: 'memory', label: 'Memory', heading: 'Memory & focus' },
]);

const game = (slug, title, subject, icon, learningTag, available = false) =>
  Object.freeze({ slug, title, subject, icon, learningTag, available, path: `src/games/${slug}/index.html` });

/** @type {readonly GameEntry[]} */
export const GAMES = Object.freeze([
  game('number-ninja', 'Number Ninja', 'math', '🌟', 'Mental maths', true),
  game('pizza-fractions', 'Pizza Fractions', 'math', '🍕', 'Fractions'),
  game('shop-keeper', 'Shop Keeper', 'math', '🛒', 'Money'),
  game('times-table-racing', 'Times-Table Racing', 'math', '🏎️', 'Times tables'),
  game('word-builder-bubbles', 'Word Builder Bubbles', 'language', '🔤', 'Spelling'),
  game('hindi-english-match', 'Hindi–English Match', 'language', '🃏', 'Vocabulary'),
  game('sentence-train', 'Sentence Train', 'language', '🚂', 'Sentences'),
  game('robot-path', 'Robot Path', 'logic', '🤖', 'Coding', true),
  game('pattern-detective', 'Pattern Detective', 'logic', '🕵️', 'Patterns'),
  game('lights-out', 'Lights Out', 'logic', '💡', 'Logic puzzles'),
  game('flag-capital-quest', 'Flag & Capital Quest', 'science', '🌍', 'Geography'),
  game('planet-hop', 'Planet Hop', 'science', '🚀', 'Space'),
  game('food-chain-builder', 'Food Chain Builder', 'science', '🐟', 'Food chains'),
  game('plant-grower', 'Plant Grower', 'science', '🌱', 'Plants'),
  game('simon-says', 'Simon Says', 'memory', '🎵', 'Memory'),
  game('spot-the-difference', 'Spot the Difference', 'memory', '🔍', 'Observation'),
]);
