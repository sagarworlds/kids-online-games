import { el } from '../utils/dom.js';
import { createParentQuestion, checkParentAnswer } from '../utils/parentCheck.js';
import { openModal } from './Modal.js';

/**
 * Asks a simple multiplication question (like 7 × 8) so a young child cannot
 * wander into settings or reset by accident. A wrong answer asks a fresh question.
 *
 * @param {() => number} rng
 * @returns {Promise<boolean>} True if a grown-up answered correctly; false if cancelled.
 */
export async function askParentCheck(rng) {
  let question = createParentQuestion(rng);
  const prompt = el('p', { class: 'field__label' });
  const input = el('input', {
    class: 'input',
    attrs: { id: 'parent-answer', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 3, 'aria-describedby': 'parent-msg' },
  });
  const message = el('p', { class: 'message message--bad', attrs: { id: 'parent-msg', role: 'status' } });
  const showQuestion = () => {
    prompt.textContent = `Grown-ups only: what is ${question.text}?`;
    input.value = '';
  };
  showQuestion();

  const body = el('div', {}, el('div', { class: 'field' }, el('label', { attrs: { for: 'parent-answer' } }, prompt), input), message);

  const modal = openModal({
    title: 'Grown-ups area',
    body,
    actions: [
      { label: 'Cancel', value: 'cancel' },
      {
        label: 'Continue',
        value: 'ok',
        variant: 'primary',
        onClick: () => {
          if (checkParentAnswer(question, input.value)) return true;
          message.textContent = 'Not quite. Please try this one.';
          question = createParentQuestion(rng);
          showQuestion();
          input.focus();
          return false;
        },
      },
    ],
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      modal.dialog.querySelector('.btn--primary')?.click();
    }
  });
  input.focus();
  return (await modal.closed) === 'ok';
}
