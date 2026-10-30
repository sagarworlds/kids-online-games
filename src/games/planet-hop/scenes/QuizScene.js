import { HopScene } from './HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { LEVELS, QUIZ_QUESTIONS } from '../logic/levels.js';
import { buildQuiz } from '../logic/quiz.js';
import { questionStars, questionScore } from '../logic/scoring.js';
import { createPlanetArt } from '../ui/PlanetArt.js';
import { createQuestionPanel } from '../ui/QuestionPanel.js';

/** "Planet quiz": 10 questions about the planets, one at a time, with pictures to choose from. */
export class QuizScene extends HopScene {
  #levelId = 'easy';
  #questions = [];
  #index = 0;
  #correct = 0;
  #hud = null;
  #host = null;
  #panel = null;
  #off = null;

  /** @param {{ levelId: 'easy'|'medium'|'hard' }} params */
  enter({ levelId }) {
    const { services, data } = this;
    if (!LEVELS[levelId]) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
    this.#levelId = levelId;
    this.#questions = buildQuiz({ items: data.quiz, levelId, count: QUIZ_QUESTIONS, optionCount: LEVELS[levelId].quiz.options, rng: services.rng });

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'question', label: 'Question' }, { id: 'right', label: 'Right' }],
      onSettings: () => services.openSettings(),
    });
    this.#host = el('main', { class: 'quiz' });
    this.ui.append(this.#hud.el, this.#host);
    this.#off = services.input.on('key', (event) => this.#panel?.handleKey(event));
    this.#show();
  }

  exit() {
    this.#off?.();
  }

  #show() {
    const { services, data } = this;
    const question = this.#questions[this.#index];
    const planets = new Map(data.planets.map((p) => [p.id, p]));
    const last = this.#index + 1 >= this.#questions.length;
    this.#hud.setStat('question', `${this.#index + 1}/${this.#questions.length}`);
    this.#hud.setStat('right', this.#correct);

    this.#panel = createQuestionPanel({
      prompt: question.q,
      options: question.optionIds.map((id) => question.kind === 'planet'
        ? { id, label: planets.get(id).name, art: createPlanetArt(planets.get(id), { diameter: 64 }) }
        : { id, label: id }),
      judge: (chosenId) => {
        const correct = chosenId === question.answerId;
        if (correct) this.#correct += 1;
        this.#hud.setStat('right', this.#correct);
        services.audio.play(correct ? 'ding' : 'boop');
        const answerName = question.kind === 'planet' ? planets.get(question.answerId).name : question.answerId;
        const message = `${correct ? 'Yes!' : `Not quite. The answer is ${answerName}.`} ${question.explain}`;
        services.speech.speak(message);
        return { correct, answerId: question.answerId, message };
      },
      nextLabel: last ? 'See my results' : 'Next question',
      onNext: () => (last ? this.#finish() : (this.#index += 1, this.#show())),
    });
    this.#host.replaceChildren(this.#panel.el);
    services.speech.speak(question.q);
  }

  #finish() {
    const total = this.#questions.length;
    this.routes.results({
      mode: 'quiz', levelId: this.#levelId, stars: questionStars(this.#correct, total), score: questionScore(this.#correct),
      lines: [`${this.#correct} of ${total} answers right.`],
    });
  }
}
