import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitScript } from '../../src/games/matra-mixer/logic/devanagari.js';

/** The parts as short strings, a Devanagari one in brackets, so a failure reads at a glance. */
const shown = (text) => splitScript(text).map((part) => (part.devanagari ? `[${part.text}]` : part.text));

test('text with no Devanagari is one part, and no text is no parts', () => {
  assert.deepEqual(splitScript('Pop the bubble!'), [{ text: 'Pop the bubble!', devanagari: false }]);
  assert.deepEqual(splitScript(''), []);
});

test('a quoted syllable or word is split out of the sentence around it', () => {
  assert.deepEqual(shown('That one says का. Listen again.'), ['That one says ', '[का]', '. Listen again.']);
  assert.deepEqual(shown('Yes! गमला means flower pot 🪴'), ['Yes! ', '[गमला]', ' means flower pot 🪴']);
  assert.deepEqual(shown('क'), ['[क]']);
});

test('a sum is one run, across its spaces, its signs and the dotted circle a vowel sign is drawn on', () => {
  assert.deepEqual(shown('Pop! क + अ = क'), ['Pop! ', '[क + अ = क]']);
  assert.deepEqual(shown('It was क + ◌ा = का'), ['It was ', '[क + ◌ा = का]']);
});

test('an English word between two pieces ends the run, so each piece is its own', () => {
  assert.deepEqual(shown('with ॅ and ॉ'), ['with ', '[ॅ]', ' and ', '[ॉ]']);
  assert.deepEqual(shown('Marathi बाराखडी and the longer चौदाखडी differ'), ['Marathi ', '[बाराखडी]', ' and the longer ', '[चौदाखडी]', ' differ']);
});

test('joiners that glue letters together stay inside a run, and a run never starts or ends on a separator', () => {
  assert.deepEqual(shown('क‍ष'), ['[क‍ष]']);
  assert.deepEqual(shown('Letters: क, ख'), ['Letters: ', '[क]', ', ', '[ख]'], 'a comma does not join two letters');
  assert.deepEqual(shown('· हिन्दी ·'), ['· ', '[हिन्दी]', ' ·']);
});

test('the parts always make the text again', () => {
  for (const text of ['', 'abc', 'क', 'क + ा = का', 'a क b ख c', '◌ा', 'Hindi: हिन्दी, Marathi: मराठी.']) {
    assert.equal(splitScript(text).map((part) => part.text).join(''), text);
  }
});
