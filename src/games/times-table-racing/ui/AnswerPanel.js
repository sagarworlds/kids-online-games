import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { questionText } from '../logic/facts.js';

/**
 * The question card and the way to answer it: four big buttons (keys 1 to 4 choose them) or, on Hard, a box to type
 * the answer in. After a wrong answer it shows the right fact for a moment.
 *
 * @param {{ mode: 'choice'|'type', onAnswer: (value: number|string) => void }} options
 * @returns {{
 *   el: HTMLElement,
 *   setQuestion: (question: import('../logic/facts.js').Question, options: number[]|null) => void,
 *   showReveal: (equation: string) => void,
 *   setFeedback: (text: string, tone?: 'good'|'bad'|'info') => void,
 *   setDisabled: (disabled: boolean) => void,
 *   choose: (index: number) => boolean,
 *   focus: () => void
 * }}
 */
export function createAnswerPanel({ mode, onAnswer }) {
  const questionEl = el('h2', { class: 'question', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const feedbackEl = el('p', { class: 'race__feedback', attrs: { role: 'status' } });
  let disabled = false;
  /** @type {HTMLButtonElement[]} */
  let optionButtons = [];
  /** @type {HTMLInputElement|null} */
  let input = null;

  const optionsEl = el('div', { class: 'options', attrs: { role: 'group', 'aria-label': 'Answers' } });
  let typingEl = null;

  if (mode === 'type') {
    input = el('input', {
      class: 'typed',
      attrs: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: 4, 'aria-label': 'Your answer' },
    });
    const submit = () => {
      if (disabled) return;
      const value = input.value;
      input.value = '';
      onAnswer(value);
      input.focus();
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
    typingEl = el('div', { class: 'typing' }, input, createButton({ label: 'Go', icon: '🏁', variant: 'primary', onClick: submit }));
  }

  const root = el('div', { class: 'answer-panel' }, questionEl, feedbackEl, mode === 'type' ? typingEl : optionsEl);

  function setQuestion(question, options) {
    questionEl.className = 'question';
    questionEl.textContent = questionText(question);
    if (mode === 'choice') {
      optionButtons = options.map((value, i) => el('button', {
        class: 'option', attrs: { type: 'button', 'aria-label': `${value}. Key ${i + 1}` },
        on: { click: (event) => {
          if (disabled) return;
          onAnswer(value);
          // Keep the focus off the tapped button so a later Enter or key press does not re-press it.
          if (event.detail > 0) event.currentTarget.blur();
        } },
      }, el('span', { class: 'option__key', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'option__value', text: String(value), attrs: { 'aria-hidden': 'true' } })));
      optionsEl.replaceChildren(...optionButtons);
    }
    setDisabled(disabled);
  }

  function showReveal(equation) {
    questionEl.className = 'question is-reveal';
    questionEl.replaceChildren(el('span', { html: ICONS.cross, attrs: { 'aria-hidden': 'true' } }), ` ${equation}`);
  }

  function setDisabled(value) {
    disabled = value;
    for (const button of optionButtons) button.disabled = value;
    if (input) input.disabled = value;
  }

  return {
    el: root,
    setQuestion,
    showReveal,
    setFeedback(text, tone = 'info') {
      feedbackEl.textContent = text;
      feedbackEl.dataset.tone = tone;
    },
    setDisabled,
    choose(index) {
      if (disabled || !optionButtons[index]) return false;
      optionButtons[index].click();
      return true;
    },
    focus: () => input?.focus(),
  };
}
