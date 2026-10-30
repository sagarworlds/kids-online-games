// Shared test doubles. Not a test file itself (no ".test" in the name).
import { createMemoryBackend } from '../../src/engine/services/StorageService.js';

/** A logger that records instead of printing, so tests can assert on it. */
export function createLogger() {
  const calls = { error: [], warn: [] };
  return {
    calls,
    error: (...args) => calls.error.push(args),
    warn: (...args) => calls.warn.push(args),
  };
}

/** A backend that holds data but throws on write once `failWrites` is set. */
export function createFlakyBackend(initial = {}) {
  const inner = createMemoryBackend();
  for (const [k, v] of Object.entries(initial)) inner.setItem(k, v);
  const backend = {
    failWrites: false,
    getItem: (k) => inner.getItem(k),
    setItem(k, v) {
      if (backend.failWrites) {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
    key: (i) => inner.key(i),
    get length() {
      return inner.length;
    },
  };
  return backend;
}
