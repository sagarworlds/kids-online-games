/**
 * Tiny DOM builder so scenes and UI modules stay readable without a framework.
 * Text always goes in through `textContent`, never `innerHTML`, so player-typed
 * strings (like their name) can never inject markup.
 *
 * @param {string} tag
 * @param {{
 *   class?: string, text?: string, html?: string, attrs?: Record<string, string|number|boolean>,
 *   data?: Record<string, string>, on?: Record<string, EventListener>, style?: Record<string, string>
 * }} [props] `html` is for trusted static markup only (our own SVG icons).
 * @param {...(Node|string|null|undefined|false)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false || value === undefined) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, value] of Object.entries(props.data ?? {})) node.dataset[name] = value;
  for (const [type, handler] of Object.entries(props.on ?? {})) node.addEventListener(type, handler);
  for (const [name, value] of Object.entries(props.style ?? {})) node.style.setProperty(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Removes every child of a node. @param {Node} node */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds an SVG element (SVG needs its own XML namespace, so `el` cannot make it).
 * @param {string} tag
 * @param {Record<string, string|number>} [attrs]
 * @param {...(Node|null|undefined|false)} children
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  for (const child of children) if (child) node.append(child);
  return node;
}
