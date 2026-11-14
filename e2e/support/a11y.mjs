// Ways to look at a screen the way assistive technology, a keyboard or a finger would. Used by specs/a11y.e2e.mjs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * What every screen is held to: WCAG 2.0 and 2.1 at levels A and AA, the WCAG 2.2 AA rule about the size of what you tap, and axe's own
 * best practices (landmarks, headings, names). It is the set the rest of the site is built to, so a failure is a real problem, not a taste.
 */
export const AXE_TAGS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);

/** The smallest a control may be, in CSS pixels, on each side. The site's own rule for small fingers (docs/SPEC.md), above WCAG's 24. */
export const MIN_TARGET = 48;

/**
 * How tall the window is made while axe and the size check look at a screen. axe only judges what is inside the part of a scrolling area
 * that shows (text below the fold is "not visible" to it, so a mistake down there passes), and a tall window shows everything. Anything
 * taller than this is not checked, which no screen of these games comes close to.
 */
const WHOLE_SCREEN_HEIGHT = 3600;

let axeSource;

/** axe's source, read once. It is run inside the page with `page.evaluate`, which the site's strict CSP does not block. */
function axeText() {
  if (axeSource === undefined) {
    try {
      axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    } catch (cause) {
      throw new Error('axe-core is not installed. Run "npm ci" in e2e/ first.', { cause });
    }
  }
  return axeSource;
}

/**
 * Makes the window tall enough to show the whole screen without scrolling, and waits for the page to lay itself out again.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<() => Promise<void>>} Puts the window back as it was.
 */
export async function showWholeScreen(page) {
  const original = page.viewportSize();
  if (!original) throw new Error('showWholeScreen needs a page with a fixed viewport');
  await page.setViewportSize({ width: original.width, height: WHOLE_SCREEN_HEIGHT });
  // Two frames: the page's resize handlers run in the first and what they change is drawn in the second.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return () => page.setViewportSize(original);
}

/**
 * Runs axe on the whole page as it is now (see `showWholeScreen` for why the window should be tall).
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ id: string, impact: string, help: string, nodes: { target: string, html: string, why: string }[] }[]>} Empty when nothing is wrong.
 */
export async function axeViolations(page) {
  if (!(await page.evaluate(() => typeof window.axe !== 'undefined'))) await page.evaluate(axeText());
  const result = await page.evaluate(
    (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }),
    [...AXE_TAGS],
  );
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(' '),
      html: node.html.replace(/\s+/g, ' ').slice(0, 170),
      // axe's failure summary starts with a heading line ("Fix any of the following:"); the lines after it say what is wrong.
      why: String(node.failureSummary ?? '').split('\n').slice(1).map((line) => line.trim()).filter(Boolean).join(' / ').slice(0, 220),
    })),
  }));
}

/** A readable list of axe's findings for a failure message. */
export function describeViolations(violations) {
  return violations
    .map((violation) => [
      `${violation.id} (${violation.impact}): ${violation.help}`,
      ...violation.nodes.slice(0, 3).map((node) => `    ${node.target}\n      ${node.html}\n      ${node.why}`),
      violation.nodes.length > 3 ? `    ... and ${violation.nodes.length - 3} more` : null,
    ].filter(Boolean).join('\n'))
    .join('\n');
}

/**
 * Presses Tab through the screen and reports each stop: what it is, whether the focus can be seen, and whether the control is hidden under
 * something else. It starts from the top of the document and stops when the focus leaves the page or comes round again, or after `limit`
 * presses. Run it in the window as it really is: the browser scrolls a focused control into view, and a bar fixed to the edge can still cover it.
 *
 * Whether the focus can be seen is judged by comparing the control's look while it has the focus with its look right after the focus moves
 * on (outline, shadow, colours, size). If nothing differs there is no focus indicator. Motion is switched to "reduce" while this runs so a
 * slow transition does not hide the change.
 *
 * "Hidden" is judged with taps let through: controls laid over a 3D picture ignore the pointer on purpose (the picture picks what was
 * tapped) but are painted above it, so they are tested as if they took the pointer. One that is still not the top thing at its centre
 * is under the picture or a bar, and a keyboard user cannot see where they are.
 *
 * @param {import('playwright').Page} page
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ name: string, tag: string, width: number, height: number, indicator: boolean, hidden: boolean }[]>} `indicator` is
 *   false only where the control looked exactly the same with and without the focus.
 */
export async function tabStops(page, { limit = 60 } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.evaluate(() => {
      // Start from the top of the page, not from where a control that has just been removed used to be (the button that began the round).
      document.activeElement?.blur?.();
      document.body.setAttribute('tabindex', '-1');
      document.body.focus({ preventScroll: true });
      document.body.removeAttribute('tabindex');
      window.__tab = {
        ids: new WeakMap(),
        elements: new Map(),
        /** Everything about a control's look that a focus style could change. */
        look(element) {
          const style = getComputedStyle(element);
          // An outline with no style is not drawn, whatever width, colour and offset it carries (the width and offset still read "3px"/"2px").
          const outline = style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0
            ? 'none'
            : [style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset].join(' ');
          return [outline, style.boxShadow, style.borderTopColor, style.backgroundColor, style.color, style.transform, style.filter, style.textDecorationLine].join('|');
        },
        /** Is the control the top thing at its centre, counting taps as let through? */
        isOnTop(element) {
          const box = element.getBoundingClientRect();
          if (box.width <= 0 || box.height <= 0) return false;
          const restore = [];
          for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
            if (getComputedStyle(node).pointerEvents === 'none') {
              restore.push([node, node.style.getPropertyValue('pointer-events'), node.style.getPropertyPriority('pointer-events')]);
              node.style.setProperty('pointer-events', 'auto', 'important');
            }
          }
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          for (const [node, value, priority] of restore) {
            if (value === '') node.style.removeProperty('pointer-events');
            else node.style.setProperty('pointer-events', value, priority);
          }
          return top !== null && (top === element || element.contains(top));
        },
      };
    });

    const stops = [];
    let previous = null;
    for (let press = 0; press < limit; press++) {
      await page.keyboard.press('Tab');
      // The browser scrolls a control into view a moment after it takes the focus; look once that has happened, as a person would.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const step = await page.evaluate((previousId) => {
        const tab = window.__tab;
        const left = previousId === null ? null : tab.elements.get(previousId);
        // How the control that just lost the focus looks now, to compare with how it looked while it had the focus.
        const lookAfter = left?.isConnected ? tab.look(left) : null;
        const element = document.activeElement;
        // The focus left the page (the end of the page, then the browser's own bar) or is on nothing: the walk is over.
        if (!element || element === document.body || element === document.documentElement) return { lookAfter, stop: null };
        const known = tab.ids.has(element);
        const id = known ? tab.ids.get(element) : tab.elements.size + 1;
        if (!known) { tab.ids.set(element, id); tab.elements.set(id, element); }
        const box = element.getBoundingClientRect();
        return {
          lookAfter,
          stop: {
            id, known,
            name: (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50),
            tag: element.tagName.toLowerCase() + (typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''),
            width: Math.round(box.width), height: Math.round(box.height),
            look: tab.look(element),
            hidden: !tab.isOnTop(element),
          },
        };
      }, previous?.id ?? null);

      if (previous && step.lookAfter !== null) previous.indicator = previous.look !== step.lookAfter;
      if (!step.stop || step.stop.known) break;
      stops.push(step.stop);
      previous = step.stop;
    }
    // The last control still has the focus when the loop ends: take it away and look once more.
    if (previous) {
      const lookAfter = await page.evaluate((id) => {
        const element = window.__tab.elements.get(id);
        element.blur();
        return element.isConnected ? window.__tab.look(element) : null;
      }, previous.id);
      if (lookAfter !== null) previous.indicator = previous.look !== lookAfter;
    }
    return stops.map(({ name, tag, width, height, indicator, hidden }) => ({ name, tag, width, height, indicator: indicator ?? true, hidden }));
  } finally {
    await page.emulateMedia({ reducedMotion: null });
  }
}

/**
 * The controls on screen that are smaller than `min` on a side. Only what a finger can actually hit counts: a control hidden under a 3D
 * picture (which does the picking itself), without a size, or disabled is left out. A checkbox or radio button with a label is as big as
 * its label, because tapping the label works it.
 *
 * @param {import('playwright').Page} page
 * @param {number} [min]
 * @returns {Promise<{ name: string, tag: string, width: number, height: number }[]>}
 */
export function smallTargets(page, min = MIN_TARGET) {
  return page.evaluate((smallest) => {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [tabindex]:not([tabindex="-1"])';
    const shown = (element) => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
    };
    const nameOf = (element) => (element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
    const found = [];
    for (const element of document.querySelectorAll(selector)) {
      if (element.disabled || element.closest('[hidden], [inert]') || !shown(element) || getComputedStyle(element).pointerEvents === 'none') continue;
      let box = element.getBoundingClientRect();
      // Tapping a label works the control it belongs to, so the label's box is the one a finger aims at.
      const label = [...(element.labels ?? [])].find(shown);
      if (label) {
        const labelBox = label.getBoundingClientRect();
        if (labelBox.width * labelBox.height > box.width * box.height) box = labelBox;
      }
      // A control with no size, or the one-pixel kind kept for screen readers, is not something a finger can aim at.
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.bottom < 0 || box.right < 0 || box.top > innerHeight || box.left > innerWidth) continue;
      const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (centre === null || (centre !== element && !element.contains(centre) && !(label && label.contains(centre)))) continue; // under something else (a picture), so not what a tap lands on
      if (Math.round(box.width) >= smallest && Math.round(box.height) >= smallest) continue;
      found.push({
        name: nameOf(element),
        tag: element.tagName.toLowerCase() + (typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''),
        width: Math.round(box.width), height: Math.round(box.height),
      });
    }
    return found;
  }, min);
}

/**
 * Everything the accessibility checks have to say about the screen that is showing now, as a list of plain sentences (empty when it is fine).
 * Pass `keyboard: false` for a screen whose Tab order was already walked.
 *
 * @param {import('playwright').Page} page
 * @param {{ keyboard?: boolean }} [options]
 * @returns {Promise<string[]>}
 */
export async function problemsOnScreen(page, { keyboard = true } = {}) {
  const problems = [];

  if (keyboard) {
    for (const stop of await tabStops(page)) {
      if (!stop.indicator) problems.push(`keyboard focus cannot be seen on ${stop.tag} "${stop.name}"`);
      if (stop.hidden) problems.push(`${stop.tag} "${stop.name}" cannot be seen when it has the keyboard focus (it has no size, or something is on top of it)`);
    }
  }

  const restore = await showWholeScreen(page);
  try {
    const violations = await axeViolations(page);
    if (violations.length > 0) problems.push(`axe found:\n${describeViolations(violations)}`);
    for (const target of await smallTargets(page)) {
      problems.push(`${target.tag} "${target.name}" is ${target.width}×${target.height}px, smaller than ${MIN_TARGET}px to tap`);
    }
  } finally {
    await restore();
  }
  return problems;
}
