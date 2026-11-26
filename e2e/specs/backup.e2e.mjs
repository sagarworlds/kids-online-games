// A grown-up can keep the child's progress on a file and put it back: on another tablet, or after the browser was cleared. Progress lives in one
// browser's storage, so without this a new device starts from nothing. These go through the real settings (the grown-ups' check, the buttons, the
// file chooser and the confirmation) with a real download from one browser and a restore in another.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { problemsOnScreen } from '../support/a11y.mjs';
import { launchBrowser } from '../support/browser.mjs';
import { scenario } from '../support/scenario.mjs';
import { startSite } from '../support/site.mjs';
import { answerGrownUpCheck, textOf } from '../support/ui.mjs';

const TIMEOUT = { timeout: 120_000 };

/** A save as the games write it (`kidsgames:<slug>`): stars per level, a best score, badges. */
const save = ({ stars = {}, badges = [], score = 0 }) => JSON.stringify({ version: 1, bestStars: stars, bestScore: score, badges, extra: {} });

/** Four games played, and Simon Says the one played last: 9 stars and 2 badges in 4 games. */
const SAVES = {
  'number-ninja': save({ stars: { easy: 3, medium: 2 }, badges: ['streak-5'], score: 120 }),
  'pizza-fractions': save({ stars: { easy: 1 } }),
  'simon-says': save({ stars: { hard: 3 } }),
  'lights-out': save({ badges: ['curious'] }),
};
const LAST_PLAYED = JSON.stringify({ version: 1, slug: 'simon-says', at: 1_700_000_000_000 });

/** Puts those saves in the browser before any page runs, as if they had been played on this device. */
const played = (context) => context.addInitScript(([saves, last]) => {
  for (const [slug, value] of Object.entries(saves)) localStorage.setItem(`kidsgames:${slug}`, value);
  localStorage.setItem('kidsgames:last-played', last);
}, [SAVES, LAST_PLAYED]);

const SENTENCE = /has earned 9 stars and 2 badges, playing 4 of \d+ games\.$/;

describe('backing up and restoring progress', () => {
  const env = /** @type {{ site: Awaited<ReturnType<typeof startSite>>, browser: import('playwright').Browser }} */ ({});

  before(async () => {
    env.site = await startSite();
    env.browser = await launchBrowser();
  });
  after(async () => {
    await env.browser?.close();
    await env.site?.close();
  });

  /** Opens the home page and the grown-ups' settings; gives back the child's name and the two sections this is about. */
  async function openSettings(page, site) {
    await page.goto(`${site.url}/`);
    await page.locator('.hub__greeting').waitFor();
    const name = (await textOf(page.locator('.hub__greeting'))).replace(/^Hi, /, '').replace(/!$/, '');
    await page.getByRole('button', { name: 'Grown-ups', exact: true }).click();
    await answerGrownUpCheck(page);
    const backup = page.locator('dialog[open] .backup');
    await backup.waitFor();
    return { name, backup, report: page.locator('dialog[open] .report') };
  }

  /** Saves a copy and gives back where the browser put it, what it is called and what it says. */
  async function saveCopy(page, backup) {
    const [download] = await Promise.all([page.waitForEvent('download'), backup.getByRole('button', { name: /Save a copy/ }).click()]);
    const path = await download.path();
    return { filename: download.suggestedFilename(), text: readFileSync(path, 'utf8') };
  }

  /** Hands the file chooser a file, as a grown-up picking it would. */
  const choose = (backup, file) => backup.locator('input[type="file"]').setInputFiles(file);

  it('saves a copy as a file named for the day, with the progress and the name, and without the device record', TIMEOUT, () => scenario(env, 'backup save', { screen: 'phone', prepare: played }, async ({ page, site }) => {
    const { name, backup } = await openSettings(page, site);
    const { filename, text } = await saveCopy(page, backup);

    assert.match(filename, /^kids-games-progress-\d{4}-\d{2}-\d{2}\.json$/);
    const copy = JSON.parse(text);
    assert.equal(copy.app, 'kids-learning-games');
    const keys = Object.keys(copy.entries);
    for (const key of ['number-ninja', 'pizza-fractions', 'simon-says', 'lights-out'].map((slug) => `kidsgames:${slug}`)) assert.ok(keys.includes(key), `${key} is in the copy`);
    assert.ok(keys.includes('kidsgames:profile') && keys.includes('kidsgames:last-played'));
    assert.equal(copy.entries['kidsgames:profile'].name, name, 'the copy has the child\'s name');
    assert.equal(keys.includes('kidsgames:device'), false, 'how fast this tablet is is not part of the child\'s progress');
    assert.equal(keys.includes('kidsgames:robot-path'), false, 'a game that was never played has no entry');
    assert.match(await textOf(backup.locator('.backup__status')), new RegExp(`^Saved ${filename.replace(/\./g, '\\.')}\\.`), 'and the page says what it saved');
  }));

  it('puts the progress, the name and the game played last on another device', TIMEOUT, async () => {
    let copy;
    let name;
    await scenario(env, 'backup from', { screen: 'phone', prepare: played }, async ({ page, site }) => {
      const opened = await openSettings(page, site);
      name = opened.name;
      copy = await saveCopy(page, opened.backup);
    });

    await scenario(env, 'backup to', { screen: 'phone' }, async ({ page, site }) => {
      const { name: before, backup, report } = await openSettings(page, site);
      assert.notEqual(before, name, 'a new device, with a name of its own');
      assert.match(await textOf(report.locator('.report__total')), /has not played anything/);

      await choose(backup, { name: copy.filename, mimeType: 'application/json', buffer: Buffer.from(copy.text) });
      const question = page.getByRole('dialog', { name: 'Restore this progress?' });
      await question.waitFor();
      assert.match(await textOf(question), new RegExp(`${name} has earned 9 stars and 2 badges.*replaces the progress on this device`), 'the grown-up is told what the copy holds before anything changes');
      assert.match(await textOf(report.locator('.report__total')), /has not played anything/, 'and nothing has changed yet');
      await question.getByRole('button', { name: 'Yes, restore' }).click();

      await page.locator('dialog[open] .report .report__total').filter({ hasText: 'has earned 9 stars' }).waitFor();
      assert.match(await textOf(page.locator('dialog[open] .report .report__total')), new RegExp(`^${name} ${SENTENCE.source}`), 'the progress section is brought up to date in place');
      assert.equal(await textOf(page.locator('.hub__greeting')), `Hi, ${name}!`, 'the home page behind has the name');
      assert.equal(await textOf(page.locator('#total-stars')), '9 stars', 'and the star total');
      assert.match(await textOf(page.locator('.resume')), /Continue\s+Simon Says/, 'and offers the game played last');
      assert.match(await textOf(backup.locator('.backup__status')), /^Progress restored\./);
    });
  });

  it('brings back what a reset took away', TIMEOUT, () => scenario(env, 'backup reset', { screen: 'phone', prepare: played }, async ({ page, site }) => {
    const { backup, report } = await openSettings(page, site);
    const copy = await saveCopy(page, backup);
    assert.match(await textOf(report.locator('.report__total')), /has earned 9 stars/);

    await page.getByRole('button', { name: 'Reset all progress' }).click();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    await page.locator('dialog[open] .report .report__total').filter({ hasText: 'has not played anything' }).waitFor();

    await choose(backup, { name: copy.filename, mimeType: 'application/json', buffer: Buffer.from(copy.text) });
    await page.getByRole('button', { name: 'Yes, restore' }).click();
    await page.locator('dialog[open] .report .report__total').filter({ hasText: 'has earned 9 stars' }).waitFor();
    assert.equal(await textOf(page.locator('#total-stars')), '9 stars');
  }));

  it('changes nothing when the grown-up says no', TIMEOUT, async () => {
    let copy;
    await scenario(env, 'backup cancel from', { screen: 'phone', prepare: played }, async ({ page, site }) => {
      copy = await saveCopy(page, (await openSettings(page, site)).backup);
    });
    await scenario(env, 'backup cancel to', { screen: 'phone' }, async ({ page, site }) => {
      const { backup, report } = await openSettings(page, site);
      await choose(backup, { name: copy.filename, mimeType: 'application/json', buffer: Buffer.from(copy.text) });
      await page.getByRole('dialog', { name: 'Restore this progress?' }).getByRole('button', { name: 'Cancel' }).click();
      // The page answers once the question has closed, a moment after the click.
      await backup.locator('.backup__status').filter({ hasText: 'Nothing was changed.' }).waitFor();
      assert.match(await textOf(report.locator('.report__total')), /has not played anything/);
      assert.equal(await page.locator('.resume').count(), 0, 'and there is still no card for a game played last');
    });
  });

  describe('a file that cannot be used', () => {
    const text = (name, content) => ({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
    const copyWith = (entries) => JSON.stringify({ app: 'kids-learning-games', format: 1, savedAt: '2026-11-26T10:30:00.000Z', entries });

    /** Picks the file on a device with no progress: a plain-words message says why, no question is asked and nothing changes. */
    const refused = (what, file, message) => it(`${what}: says so in plain words, and nothing is changed`, TIMEOUT, () => scenario(env, `backup refuse ${what}`, { screen: 'phone' }, async ({ page, site }) => {
      const { backup, report } = await openSettings(page, site);
      await choose(backup, file);
      const problem = backup.locator('[role="alert"]');
      await problem.filter({ hasText: 'Nothing was changed.' }).waitFor();
      assert.match(await textOf(problem), message);
      assert.equal(await page.getByRole('dialog', { name: 'Restore this progress?' }).count(), 0, 'no question is asked about a file that is no use');
      assert.match(await textOf(report.locator('.report__total')), /has not played anything/);
    }));

    refused('a text file', text('notes.txt', 'remember to buy milk'), /not a copy of this progress/);
    refused('JSON from another app', text('other.json', JSON.stringify({ app: 'some-other-app', format: 1, entries: {} })), /not a copy of this progress/);
    refused('a copy with seven stars in a game', text('copy.json', copyWith({ 'kidsgames:number-ninja': { version: 1, bestStars: { easy: 7 }, bestScore: 0, badges: [], extra: {} } })), /damaged or has been changed/);
    refused('a copy with a key it should not hold', text('copy.json', copyWith({ 'kidsgames:device': { version: 1, slow3d: true, frameWatch: 'on' } })), /damaged or has been changed/);
    refused('a copy from a newer version', text('copy.json', JSON.stringify({ app: 'kids-learning-games', format: 99, entries: {} })), /newer version/);
  });

  it('the section, with a message showing, passes the accessibility checks on a phone', TIMEOUT, () => scenario(env, 'backup a11y', { screen: 'phone', prepare: played }, async ({ page, site }) => {
    const { backup } = await openSettings(page, site);
    await saveCopy(page, backup);
    await backup.locator('.backup__status').filter({ hasText: 'Saved' }).waitFor();
    const problems = await problemsOnScreen(page);
    assert.equal(problems.length, 0, `accessibility problems:\n${problems.join('\n')}`);
  }));
});
