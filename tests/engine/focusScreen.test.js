import { test } from 'node:test';
import assert from 'node:assert/strict';

import { focusScreenHeading } from '../../src/engine/ui/focusScreen.js';

/** A heading stand-in that records what was done to it. `hidden` puts it inside a hidden part of the screen. */
function heading(name, { hidden = false } = {}) {
  return {
    name, attributes: {}, focused: null,
    closest: (selector) => (selector === '[hidden]' && hidden ? {} : null),
    setAttribute(key, value) { this.attributes[key] = value; },
    focus(options) { this.focused = options; },
  };
}

/** A screen with the given headings, in a document whose focus is on `active` (the body unless said). */
function screenWith({ h1 = [], h2 = [], active = 'body' } = {}) {
  const body = { tag: 'body' };
  const doc = { body, documentElement: { tag: 'html' }, activeElement: active === 'body' ? body : active };
  return {
    ownerDocument: doc,
    querySelectorAll: (selector) => ({ h1, h2 }[selector] ?? []),
  };
}

test('the focus goes to the screen\'s heading, which is made focusable by a script only, without scrolling', () => {
  const title = heading('title');
  const screen = screenWith({ h1: [title] });
  assert.equal(focusScreenHeading(screen), true);
  assert.equal(title.attributes.tabindex, '-1', 'tabindex -1: focusable from a script, not part of the Tab order');
  assert.deepEqual(title.focused, { preventScroll: true });
});

test('a level-one heading wins over a level-two one, and a hidden heading is not what the screen is about', () => {
  const paused = heading('Paused', { hidden: true });
  const question = heading('question');
  const title = heading('title');
  const screen = screenWith({ h1: [heading('hidden title', { hidden: true }), title], h2: [paused, question] });
  focusScreenHeading(screen);
  assert.ok(title.focused && !question.focused && !paused.focused);

  const twoOnly = screenWith({ h2: [paused, question] });
  assert.equal(focusScreenHeading(twoOnly), true);
  assert.ok(question.focused, 'with no level-one heading the first visible level-two one is used');
  assert.equal(paused.focused, null, 'and the hidden "Paused" card is skipped');
});

/** A control that has the focus: `hiddenScreen` puts it inside a part of the page that has just been hidden. */
function control({ hiddenScreen = false } = {}) {
  return { tag: 'button', closest: (selector) => (selector === '[hidden]' && hiddenScreen ? {} : null) };
}

test('the focus is left where it is when a control or a dialog already has it', () => {
  const title = heading('title');
  assert.equal(focusScreenHeading(screenWith({ h1: [title], active: control() })), false);
  assert.equal(title.focused, null);
  assert.equal(title.attributes.tabindex, undefined, 'and the heading is not touched');
});

test('a control on a screen that has just been hidden has lost the focus, as when a scene is pushed over another', () => {
  // The browser lets a control that was hidden a moment ago stay the active element until the next frame, so it still reads as focused.
  const title = heading('title');
  assert.equal(focusScreenHeading(screenWith({ h1: [title], active: control({ hiddenScreen: true }) })), true);
  assert.deepEqual(title.focused, { preventScroll: true }, 'the new screen\'s heading takes the focus');
});

test('a screen with no visible heading is left alone', () => {
  assert.equal(focusScreenHeading(screenWith()), false);
  const onlyHidden = heading('hidden', { hidden: true });
  assert.equal(focusScreenHeading(screenWith({ h2: [onlyHidden] })), false);
  assert.equal(onlyHidden.focused, null);
});

test('a document with no focused element at all counts as lost focus', () => {
  const title = heading('title');
  const screen = screenWith({ h1: [title] });
  screen.ownerDocument.activeElement = null;
  assert.equal(focusScreenHeading(screen), true);
});
