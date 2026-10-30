import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';

/**
 * One multiple-choice question: the prompt, picture-and-name answers (keys 1 to 5 work too), and, once one is chosen,
 * a tick or a cross with what the scene wants to say, then a Next button. Used by the quiz and by the weigh-in's
 * "mystery planet" questions, which differ only in how they judge an answer.
 *
 * Right and wrong are marked with ✔ and ✖ marks and a dashed outline, never by colour alone.
 *
 * @param {{
 *   prompt: string,
 *   options: { id: string, label: string, art?: SVGElement|null }[],
 *   judge: (chosenId: string) => { correct: boolean, answerId: string, message: string },
 *   onNext: () => void, nextLabel: string
 * }} config `judge` is called once, with the chosen option's id.
 * @returns {{ el: HTMLElement, handleKey: (event: KeyboardEvent) => void }}
 */
export function createQuestionPanel({ prompt, options, judge, onNext, nextLabel }) {
  let answered = false;
  const feedback = el('div', { class: 'qpanel__feedback', attrs: { role: 'status' } });

  const buttons = options.map((option, i) => el('button', {
    class: 'choice', attrs: { type: 'button', 'aria-label': `${option.label}. Key ${i + 1}` }, data: { id: option.id },
    on: { click: (event) => { choose(option.id); if (event.detail > 0) event.currentTarget.blur(); } },
  },
  el('span', { class: 'choice__key', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }),
  option.art ?? null,
  el('span', { class: 'choice__label', text: option.label })));

  function choose(id) {
    if (answered) return;
    answered = true;
    const verdict = judge(id);
    buttons.forEach((button) => {
      button.disabled = true;
      if (button.dataset.id === verdict.answerId) button.classList.add('is-right');
      else if (button.dataset.id === id) button.classList.add('is-wrong');
    });
    feedback.className = `qpanel__feedback ${verdict.correct ? 'is-right' : 'is-wrong'}`;
    feedback.replaceChildren(el('p', {}, el('span', { html: verdict.correct ? ICONS.check : ICONS.cross, attrs: { 'aria-hidden': 'true' } }), ` ${verdict.message}`));
    const next = createButton({ label: nextLabel, icon: '▶', variant: 'primary', big: true, onClick: onNext });
    feedback.append(next);
    next.focus();
  }

  const root = el('section', { class: 'qpanel' },
    el('h2', { class: 'qpanel__prompt', text: prompt }),
    el('div', { class: 'choices', attrs: { role: 'group', 'aria-label': `Answers. Keys 1 to ${options.length}` } }, ...buttons),
    feedback);

  return {
    el: root,
    handleKey(event) {
      if (answered || event.repeat || !/^[1-9]$/.test(event.key)) return;
      const option = options[Number(event.key) - 1];
      if (option) choose(option.id);
    },
  };
}
