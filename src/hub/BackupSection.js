import { el } from '../engine/utils/dom.js';
import { GameError, logError } from '../engine/utils/errors.js';
import { createButton } from '../engine/ui/Button.js';
import { confirmDialog } from '../engine/ui/Modal.js';
import { showToast } from '../engine/ui/Toast.js';
import { PROFILE_KEY, gameKey, saveSchema } from '../engine/services/schemas.js';
import {
  MAX_BACKUP_BYTES, backupFilename, createBackup, describeBackupProblem, parseBackup, restoreBackup, serializeBackup,
} from './backup.js';
import { SUBJECTS } from './gamesRegistry.js';
import { summarizeProgress } from './progressSummary.js';
import { describeTotals } from './progressText.js';

/**
 * Hands a text file to the browser to save, as if it had been downloaded. Nothing is sent anywhere.
 * @param {string} filename
 * @param {string} text
 */
export function saveTextFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { attrs: { href: url, download: filename, hidden: true } });
  document.body.append(link);
  link.click();
  link.remove();
  // The browser starts the download at once; the address is let go a little later, not while it is still being used.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * What a grown-up is shown before a copy replaces the progress on this device: who it is for, when it was saved and what it holds.
 * @param {ReturnType<typeof parseBackup>['backup']} backup
 * @param {readonly import('./gamesRegistry.js').GameEntry[]} games
 * @returns {string}
 */
function describeCopy(backup, games) {
  const summary = summarizeProgress({ games, subjects: SUBJECTS, saveOf: (slug) => backup.entries[gameKey(slug)] ?? saveSchema.defaults() });
  const name = /** @type {{ name?: string }} */ (backup.entries[PROFILE_KEY])?.name || 'This child';
  const saved = backup.savedAt ? ` saved on ${new Date(backup.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
  return `A copy${saved}. ${describeTotals(summary, name)} Restoring it replaces the progress on this device.`;
}

/**
 * The "Back up progress" part of the grown-ups' settings: save a copy of the progress as a file, and restore one. Everything it does is
 * checked first (see `parseBackup`) and nothing is changed unless the grown-up says yes to a plain description of what the copy holds.
 *
 * @param {{
 *   storage: import('../engine/services/StorageService.js').StorageService,
 *   games: readonly import('./gamesRegistry.js').GameEntry[],
 *   onRestored: () => void,
 *   saveFile?: (filename: string, text: string) => void,
 *   confirm?: typeof confirmDialog,
 *   notify?: (message: string) => void
 * }} deps `onRestored` is how the page learns that what it shows is out of date; the rest can be replaced in tests.
 * @returns {HTMLElement}
 */
export function buildBackupSection({ storage, games, onRestored, saveFile = saveTextFile, confirm = confirmDialog, notify = showToast }) {
  const status = el('p', { class: 'backup__status', attrs: { role: 'status' } });
  const problem = el('p', { class: 'message message--bad', attrs: { role: 'alert' } });
  const chooser = el('input', { attrs: { type: 'file', accept: '.json,application/json', hidden: true, tabindex: -1 } });
  const clearMessages = () => { status.textContent = ''; problem.textContent = ''; };

  const save = () => {
    clearMessages();
    try {
      const backup = createBackup({ storage, games });
      const filename = backupFilename(backup.savedAt);
      saveFile(filename, serializeBackup(backup));
      status.textContent = `Saved ${filename}. Keep it somewhere safe: it has the child's name and stars.`;
    } catch (error) {
      logError(error, 'hub:backup');
      problem.textContent = 'A copy could not be saved. Please try again.';
    }
  };

  /** Reads and checks the file; the grown-up has not been asked anything yet and nothing has been changed. */
  const read = async (file) => {
    if (file.size > MAX_BACKUP_BYTES) throw new GameError('BACKUP_TOO_BIG', `the file is ${file.size} bytes`, { bytes: file.size });
    return parseBackup(await file.text(), games);
  };

  const restore = async (file) => {
    clearMessages();
    let parsed;
    try {
      parsed = await read(file);
    } catch (error) {
      if (!(error instanceof GameError)) logError(error, 'hub:backup');
      problem.textContent = describeBackupProblem(error);
      return;
    }
    const sure = await confirm({ title: 'Restore this progress?', message: describeCopy(parsed.backup, games), confirmLabel: 'Yes, restore' });
    if (!sure) {
      status.textContent = 'Nothing was changed.';
      return;
    }
    try {
      const { durable } = restoreBackup({ storage, backup: parsed.backup });
      onRestored();
      const left = parsed.skipped.length;
      status.textContent = ['Progress restored.',
        left > 0 ? `${left === 1 ? 'One game' : `${left} games`} in the copy ${left === 1 ? 'is' : 'are'} not in this version and ${left === 1 ? 'was' : 'were'} left out.` : null,
        durable ? null : 'This browser will not keep it once the page is closed.'].filter(Boolean).join(' ');
      notify('Progress restored.');
    } catch (error) {
      logError(error, 'hub:backup');
      problem.textContent = 'Something went wrong while restoring, so the progress may be partly changed. Please try again.';
    }
  };

  chooser.addEventListener('change', () => {
    const file = chooser.files?.[0];
    // Cleared so that choosing the same file again (after fixing something) still counts as a choice.
    chooser.value = '';
    if (file) restore(file);
  });

  return el('section', { class: 'field backup' },
    el('h3', { text: 'Back up progress' }),
    el('p', { class: 'backup__about', text: 'Keep the stars and badges in a file, to put them on another tablet or to get them back after the browser is cleared. The file stays with you: nothing is sent anywhere.' }),
    el('div', { class: 'backup__actions' },
      createButton({ label: 'Save a copy', icon: '💾', onClick: save }),
      createButton({ label: 'Restore from a copy', icon: '📂', onClick: () => chooser.click() })),
    status, problem, chooser);
}
