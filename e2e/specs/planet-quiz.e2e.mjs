// Planet Hop's quiz, played in the browser at every level. The bot reads each question from the screen and answers it from the game's own question
// file, so it works for whatever questions the file holds (picture questions and word questions alike) and fails when the screen and the file
// disagree. A round is ten questions drawn from the chosen level, and a level has enough of its own that two rounds are not the same ten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { eventually, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 180_000 };
const QUESTIONS = JSON.parse(readFileSync(new URL('../../src/games/planet-hop/data/quiz.json', import.meta.url), 'utf8')).questions;
const GAME = '/src/games/planet-hop/index.html';
const ROUND = 10;

/** Opens the game, picks the level, starts the quiz and waits for the first question. */
async function startQuiz(page, site, level) {
  await page.goto(`${site.url}${GAME}`);
  await page.locator('.modes .mode').first().waitFor();
  await page.locator(`fieldset.segmented input[value="${level}"]`).check({ force: true });
  await page.locator('.mode', { hasText: 'Planet quiz' }).click();
  await page.locator('.qpanel__prompt').waitFor();
}

/**
 * Plays one round to its last question, reading each question off the screen and answering it from the question file.
 * The last answer is given but its Next button (which says "See my results") is left for the caller to press.
 *
 * @param {import('playwright').Page} page
 * @param {(question: object, feedback: string) => void} [onAnswered] Sees each question and the feedback the screen showed for the answer.
 * @returns {Promise<object[]>} The questions of the round, in the order they were asked, as the file has them.
 */
async function playRound(page, onAnswered = () => {}) {
  const asked = [];
  for (let number = 1; number <= ROUND; number++) {
    const prompt = await textOf(page.locator('.qpanel__prompt'));
    const question = QUESTIONS.find((candidate) => candidate.q === prompt);
    assert.ok(question, `question ${number}, "${prompt}", is in the question file`);
    asked.push(question);
    await page.locator(`.choice[data-id=${JSON.stringify(question.answerId)}]`).click();
    onAnswered(question, await textOf(page.locator('.qpanel__feedback')));
    if (number < ROUND) {
      await page.locator('.qpanel__feedback button').click();
      await eventually(async () => (await textOf(page.locator('.qpanel__prompt'))) !== prompt, { message: `question ${number + 1} to appear` });
    }
  }
  return asked;
}

describe('the planet quiz', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  for (const level of ['easy', 'medium', 'hard']) {
    it(`a ${level} round: ten questions of that level, each answered from the question file, ends on three stars`, TIMEOUT, () => scenario(env, `planet quiz ${level}`, { screen: 'desktop' }, async ({ page, site }) => {
      await startQuiz(page, site, level);
      const asked = await playRound(page, (question, feedback) => {
        assert.ok(feedback.startsWith('Yes!') && feedback.includes(question.explain), `${question.id}: the right answer is acknowledged with its explanation (the screen said "${feedback}")`);
      });
      await page.locator('.qpanel__feedback button').click();
      await page.locator('.result').waitFor();

      assert.equal(await page.locator('.result__stars').getAttribute('aria-label'), '3 out of 3 stars');
      assert.match(await textOf(page.locator('.result__lines')), new RegExp(`${ROUND} of ${ROUND} answers right`));
      assert.equal(new Set(asked.map((question) => question.id)).size, ROUND, 'no question is asked twice in a round');
      assert.deepEqual(asked.filter((question) => question.level !== level).map((question) => question.id), [], `every question belongs to ${level}`);
    }));
  }

  it('two Hard rounds are not the same ten questions', TIMEOUT, async () => {
    const rounds = [];
    for (const which of ['first', 'second']) {
      await scenario(env, `planet quiz hard ${which}`, { screen: 'desktop' }, async ({ page, site }) => {
        await startQuiz(page, site, 'hard');
        rounds.push((await playRound(page)).map((question) => question.id).sort());
      });
    }
    assert.notDeepEqual(rounds[0], rounds[1], 'the second round asks different questions from the first (there are 22 Hard questions to draw ten from)');
  });
});
