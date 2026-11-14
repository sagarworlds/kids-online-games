/**
 * Moves the focus to the heading of a screen that has just opened in place of another one.
 *
 * The button that was pressed to get here goes with the old screen, and the focus falls back to the page. A screen reader then says nothing
 * about the new screen, and a keyboard user has to start again from the top. Putting the focus on the heading makes a screen reader read it
 * ("Pizza Fractions, heading level 1") and lets Tab carry on from there. The heading is given `tabindex="-1"` so a script can focus it
 * without it joining the Tab order.
 *
 * The focus is left alone when it is already somewhere (the screen put it on a control itself, or a dialog has it), when the screen has no
 * visible heading, and the first screen of a page is not passed here at all (a page that has just loaded starts at its top).
 *
 * @param {HTMLElement} screen The container of the screen that has just opened.
 * @returns {boolean} Whether the focus was moved.
 */
export function focusScreenHeading(screen) {
  const doc = screen.ownerDocument;
  const holder = doc.activeElement;
  if (holder && holder !== doc.body && holder !== doc.documentElement) return false;

  // The first heading that shows: a hidden one (the "Paused" card, say) is not what the screen is about. A level-one heading wins over a
  // level-two one, which is how most screens name themselves.
  const shown = (heading) => !heading.closest('[hidden]');
  const heading = [...screen.querySelectorAll('h1')].find(shown) ?? [...screen.querySelectorAll('h2')].find(shown);
  if (!heading) return false;

  heading.setAttribute('tabindex', '-1');
  // The screen is at its top already; scrolling to the heading would only jerk a screen that is taller than the window.
  heading.focus({ preventScroll: true });
  return true;
}
