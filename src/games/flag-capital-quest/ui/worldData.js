import { GameError, invalidData } from '../../../engine/utils/errors.js';

/**
 * @typedef {{ code: string, d: string, cx: number, cy: number, r: number }} MapCountry
 * @typedef {{ countries: MapCountry[], context: string[] }} World
 * `context` are plain grey shapes (land that is not part of the quiz).
 */

const FILE = 'world.svg';

/**
 * Loads the map picture and takes it apart: one path for each country with where to aim for, plus the grey shapes. The
 * map is checked against the country list, so a country without a shape is a clear error at start-up instead of a map
 * you can never tap.
 *
 * @param {string|URL} url
 * @param {readonly string[]} expectedCodes
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<World>}
 * @throws {GameError} 'DATA_LOAD_FAILED' or 'INVALID_DATA'
 */
export async function loadWorld(url, expectedCodes, fetchImpl = globalThis.fetch) {
  let text;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) throw new GameError('DATA_LOAD_FAILED', `${FILE}: HTTP ${response.status}`, { file: FILE, status: response.status });
    text = await response.text();
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError('DATA_LOAD_FAILED', `${FILE}: could not be fetched`, { file: FILE, cause: String(error) });
  }
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) invalidData(FILE, '(root)', 'is not valid SVG');

  const countries = [...doc.querySelectorAll('#countries path')].map((p) => ({
    code: p.getAttribute('id'), d: p.getAttribute('d'),
    cx: Number(p.dataset?.cx ?? p.getAttribute('data-cx')), cy: Number(p.getAttribute('data-cy')), r: Number(p.getAttribute('data-r')),
  }));
  const have = new Set(countries.map((c) => c.code));
  for (const code of expectedCodes) if (!have.has(code)) invalidData(FILE, `#${code}`, 'is missing from the map');
  for (const c of countries) {
    if (!c.d || ![c.cx, c.cy, c.r].every(Number.isFinite)) invalidData(FILE, `#${c.code}`, 'has no shape or aim point');
  }
  const context = [...doc.querySelectorAll('#context path')].map((p) => p.getAttribute('d')).filter(Boolean);
  return { countries, context };
}
