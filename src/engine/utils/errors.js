/**
 * Error type for anything the game can explain to a child or a developer:
 * malformed level JSON, an invalid name, an impossible puzzle request.
 * Throw this instead of plain strings so callers can branch on `code`.
 */
export class GameError extends Error {
  /**
   * @param {string} code Stable machine-readable id, e.g. 'INVALID_NAME'.
   * @param {string} [message] Developer-facing description (defaults to the code).
   * @param {Record<string, unknown>} [context] Extra facts for logs and UI,
   *   e.g. `{ file: 'levels.json', field: 'goal' }`.
   */
  constructor(code, message = code, context = {}) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Logs an error with its code and context in one consistent format.
 * @param {unknown} error
 * @param {string} [where] Short label of the code path that caught it.
 */
export function logError(error, where = 'game') {
  if (error instanceof GameError) {
    console.error(`[${where}] ${error.code}: ${error.message}`, error.context);
  } else {
    console.error(`[${where}]`, error);
  }
}

/**
 * Throws a GameError describing a bad field in a JSON data file.
 * @param {string} file File name, shown in the log so content authors can find it.
 * @param {string} field Path of the offending field, e.g. 'levels[3].goal'.
 * @param {string} problem What is wrong with it.
 * @returns {never}
 * @throws {GameError} Always, with code 'INVALID_DATA'.
 */
export function invalidData(file, field, problem) {
  throw new GameError('INVALID_DATA', `${file}: ${field} ${problem}`, { file, field });
}
