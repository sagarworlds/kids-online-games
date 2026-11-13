import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCREENS } from './browser.mjs';
import { watchPage } from './log.mjs';

const ARTIFACTS = resolve(import.meta.dirname, '..', 'artifacts');

/**
 * Runs one check on a brand new browser context (empty storage, like a first visit) and fails it when the page reported
 * any unexpected problem. When a check fails, a screenshot and the page's log are kept in e2e/artifacts for the CI upload.
 *
 * Set E2E_RETRIES=1 to run a failed check once more with fresh state: a real bug fails twice, a rare stall in a slow
 * software renderer does not fail the whole run.
 *
 * @param {{ browser: import('playwright').Browser, site: { url: string } }} env
 * @param {string} name Used for the failure files, so make it unique.
 * @param {{
 *   screen?: keyof typeof SCREENS,
 *   expected?: RegExp[],
 *   serviceWorkers?: 'allow'|'block',
 *   prepare?: (context: import('playwright').BrowserContext) => Promise<void>,
 *   contextOptions?: import('playwright').BrowserContextOptions,
 *   context?: import('playwright').BrowserContext,
 * }} options `prepare` runs before the page opens (inject failures, set storage); `expected` is passed to `watchPage`.
 *   `context` runs the check in a context the caller owns (for state that must carry over, like an installed service
 *   worker); it opens a new page there and leaves the context open.
 * @param {(t: { page: import('playwright').Page, context: import('playwright').BrowserContext, log: ReturnType<typeof watchPage>, site: { url: string }, touch: boolean }) => Promise<void>} body
 */
export async function scenario(env, name, options, body) {
  const attempts = 1 + Number(process.env.E2E_RETRIES ?? 0);
  const { touch, viewport, ...device } = SCREENS[options.screen ?? 'desktop'];
  let failure;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const owned = options.context === undefined;
    const context = options.context ?? await env.browser.newContext({
      viewport,
      ...device,
      // Registering the production service worker makes the browser download the whole site; only the offline checks want that.
      serviceWorkers: options.serviceWorkers ?? 'block',
      ...options.contextOptions,
    });
    const page = await context.newPage();
    const close = () => (owned ? context.close() : page.close()).catch(() => {});
    const log = watchPage(page, { expected: options.expected });
    try {
      await options.prepare?.(context);
      await body({ page, context, log, site: env.site, touch });
      log.assertClean();
      await close();
      return;
    } catch (error) {
      // A timeout alone says little; what the page reported (a 404, a thrown error) is usually the cause, so put it in the message.
      if (error instanceof Error && log.unexpected.length > 0) {
        error.message += `\n\nThe page reported:\n${log.unexpected.map((line) => `  ${line.split('\n')[0]}`).join('\n')}`;
      }
      failure = error;
      await keepEvidence(name, attempt, page, log, error);
      await close();
      if (attempt < attempts) console.error(`  retrying "${name}" after: ${String(error.message).split('\n')[0]}`);
    }
  }
  throw failure;
}

/** Saves what the failed page looked like and what it logged. Never throws: evidence is a bonus, not a reason to hide the failure. */
async function keepEvidence(name, attempt, page, log, error) {
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    const stem = `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-attempt${attempt}`;
    writeFileSync(resolve(ARTIFACTS, `${stem}.txt`), `${error.stack ?? error}\n\n${log.describe()}\n`);
    await page.screenshot({ path: resolve(ARTIFACTS, `${stem}.png`) });
  } catch (cause) {
    console.error(`  could not keep evidence for "${name}": ${cause.message}`);
  }
}
