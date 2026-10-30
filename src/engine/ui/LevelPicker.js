import { el } from '../utils/dom.js';
import { LEVELS } from '../services/schemas.js';

const DEFAULT_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

let groupId = 0;

/**
 * Easy / Medium / Hard chooser built from native radio buttons, so arrow keys,
 * focus and screen-reader behaviour work without extra code.
 *
 * When a grown-up has locked the difficulty, only that level can be selected
 * and a short note explains why the others are greyed out.
 *
 * @param {{
 *   value?: 'easy'|'medium'|'hard',
 *   lock?: 'easy'|'medium'|'hard'|null,
 *   hints?: Partial<Record<'easy'|'medium'|'hard', string>>,
 *   onChange?: (level: 'easy'|'medium'|'hard') => void
 * }} [options] `hints` are the small second lines under each label.
 * @returns {{ el: HTMLElement, value: 'easy'|'medium'|'hard' }}
 */
export function createLevelPicker({ value = 'easy', lock = null, hints = {}, onChange } = {}) {
  const name = `level-${groupId++}`;
  let current = lock ?? value;

  const items = LEVELS.map((level) => {
    const id = `${name}-${level}`;
    const input = el('input', {
      attrs: { type: 'radio', name, id, value: level, checked: level === current, disabled: lock !== null && level !== lock },
      on: {
        change: () => {
          current = level;
          onChange?.(level);
        },
      },
    });
    const label = el('label', { attrs: { for: id } },
      el('span', { text: DEFAULT_LABELS[level] }),
      hints[level] ? el('small', { text: hints[level] }) : null);
    return el('div', { class: 'segmented__item' }, input, label);
  });

  const root = el('div', {},
    el('fieldset', { class: 'segmented' }, el('legend', { text: 'Level' }), ...items),
    lock ? el('p', { class: 'lock-note', text: '🔒 A grown-up has locked this level.' }) : null);

  return {
    el: root,
    get value() {
      return current;
    },
  };
}
