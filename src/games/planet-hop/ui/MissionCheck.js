import { el } from '../../../engine/utils/dom.js';
import { MYSTERY_QUESTIONS } from '../logic/levels.js';
import { formatKg } from '../logic/weight.js';
import { buildMystery, sameGravity } from '../logic/mystery.js';
import { createPlanetArt } from './PlanetArt.js';
import { createQuestionPanel } from './QuestionPanel.js';

/**
 * The weigh-in's last step: five "you would weigh X kg on a mystery place, which one is it?" questions. The 2D and 3D
 * weigh-ins share it, so the questions, the feedback and the stars are the same in both.
 *
 * It owns the question flow only; the scene gives it the numbers and is told how it went.
 *
 * @param {{
 *   services: import('../../../engine/Scene.js').Services,
 *   stops: readonly (import('../logic/planets.js').Planet|import('../logic/planets.js').Bonus)[],
 *   kg: number, who: string, optionCount: number,
 *   onProgress: (done: number, total: number) => void,
 *   onFinish: (result: { correct: number, total: number }) => void
 * }} options `who` is "You" or the name of what is being weighed. `onProgress` is called as each question is shown,
 *   with the number of the question (from 1).
 * @returns {{ el: HTMLElement, handleKey: (event: KeyboardEvent) => void }} `handleKey` takes the keyboard shortcuts (1 to 5).
 * @throws {import('../../../engine/utils/errors.js').GameError} From `buildMystery` when the stops cannot make a fair question.
 */
export function createMissionCheck({ services, stops, kg, who, optionCount, onProgress, onFinish }) {
  const questions = buildMystery({ bodies: stops, kg, count: MYSTERY_QUESTIONS, optionCount, rng: services.rng });
  const lookup = new Map(stops.map((b) => [b.id, b]));
  const host = el('section', { class: 'mission' });
  let index = 0;
  let correct = 0;
  let panel = null;

  const show = () => {
    const question = questions[index];
    const last = index + 1 >= questions.length;
    onProgress(index + 1, questions.length);
    panel = createQuestionPanel({
      prompt: `You would weigh ${formatKg(question.felt)} on a mystery place. Which place is it?`,
      options: question.optionIds.map((id) => ({ id, label: lookup.get(id).name, art: createPlanetArt(lookup.get(id), { diameter: 56 }) })),
      judge: (chosenId) => {
        const answer = lookup.get(question.answerId);
        const isRight = chosenId === question.answerId;
        if (isRight) correct += 1;
        services.audio.play(isRight ? 'ding' : 'boop');
        const twins = sameGravity(stops, answer).map((b) => b.name);
        const sum = `${formatKg(kg)} × ${answer.gravity} = ${formatKg(question.felt)}`;
        const message = `${isRight ? 'Yes!' : 'Not quite.'} ${isRight ? `It is ${answer.name}` : `The answer is ${answer.name}`}: ${sum}.${twins.length ? ` ${twins.join(' and ')} pulls just the same.` : ''}`;
        services.speech.speak(message);
        return { correct: isRight, answerId: question.answerId, message };
      },
      nextLabel: last ? 'See my results' : 'Next question',
      onNext: () => {
        if (last) onFinish({ correct, total: questions.length });
        else { index += 1; show(); }
      },
    });
    host.replaceChildren(
      el('p', { class: 'mission__who', text: `Mission check: ${who === 'You' ? 'your' : `${who}'s`} weight on Earth is ${formatKg(kg)}.` }),
      panel.el);
  };
  show();
  return { el: host, handleKey: (event) => panel?.handleKey(event) };
}
