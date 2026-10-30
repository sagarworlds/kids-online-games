import { GameError } from './errors.js';

/**
 * Loads and validates a JSON data file.
 *
 * Every data file is validated on load (spec rule): if the file is missing,
 * malformed or fails `validate`, a GameError is thrown whose context names the
 * file, so the caller can log it and show the friendly error screen.
 *
 * @template T
 * @param {string|URL} url Where to fetch from (use `new URL('./x.json', import.meta.url)`).
 * @param {string} file Short file name for error messages, e.g. 'names.json'.
 * @param {(data: any) => T} validate Throws (ideally via `invalidData`) when the shape is wrong; returns the data.
 * @param {typeof fetch} [fetchImpl] Injectable for tests.
 * @returns {Promise<T>}
 * @throws {GameError} With code 'DATA_LOAD_FAILED' or 'INVALID_DATA'.
 */
export async function loadJson(url, file, validate, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new GameError('DATA_LOAD_FAILED', `${file}: could not be fetched`, { file, cause: String(error) });
  }
  if (!response.ok) {
    throw new GameError('DATA_LOAD_FAILED', `${file}: HTTP ${response.status}`, { file, status: response.status });
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new GameError('INVALID_DATA', `${file}: is not valid JSON`, { file, field: '(root)', cause: String(error) });
  }
  return validate(data);
}
