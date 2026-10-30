/** "a" or "an" for a word, by its first letter (all the object names here follow the simple vowel rule). @param {string} word */
export const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** "A cup" or "An apple", for the start of a sentence. @param {string} word */
export const withArticle = (word) => `${article(word).replace(/^./, (c) => c.toUpperCase())} ${word}`;
