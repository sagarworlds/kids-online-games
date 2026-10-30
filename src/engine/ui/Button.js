import { el } from '../utils/dom.js';

/**
 * Creates an accessible button (or link, when `href` is given) that meets the
 * 48 x 48 px tap-target rule via the `.btn` class.
 *
 * @param {{
 *   label?: string, icon?: string, ariaLabel?: string,
 *   variant?: 'primary'|'accent'|'good'|'ghost'|'default', big?: boolean,
 *   href?: string, onClick?: (event: MouseEvent) => void,
 *   disabled?: boolean, className?: string
 * }} options `icon` is a short text glyph/emoji shown before the label.
 *   Icon-only buttons must supply `ariaLabel`.
 * @returns {HTMLButtonElement|HTMLAnchorElement}
 */
export function createButton({
  label = '', icon = '', ariaLabel, variant = 'default', big = false,
  href, onClick, disabled = false, className = '',
}) {
  const classes = ['btn'];
  if (variant !== 'default') classes.push(`btn--${variant}`);
  if (big) classes.push('btn--big');
  if (icon && !label) classes.push('btn--icon');
  if (className) classes.push(className);

  const attrs = {};
  if (ariaLabel) attrs['aria-label'] = ariaLabel;
  if (href) attrs.href = href;
  else attrs.type = 'button';

  const node = el(
    href ? 'a' : 'button',
    { class: classes.join(' '), attrs, on: onClick ? { click: onClick } : {} },
    icon ? el('span', { text: icon, attrs: { 'aria-hidden': 'true' } }) : null,
    label ? el('span', { text: label }) : null,
  );
  if (disabled) setDisabled(node, true);
  return node;
}

/**
 * Enables or disables a button created by createButton (works for links too).
 * @param {HTMLElement} node
 * @param {boolean} disabled
 */
export function setDisabled(node, disabled) {
  if ('disabled' in node) node.disabled = disabled;
  node.setAttribute('aria-disabled', String(disabled));
  if (node.tagName === 'A') node.tabIndex = disabled ? -1 : 0;
}
