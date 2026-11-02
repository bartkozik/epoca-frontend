import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// `@testing-library/dom`'s `waitFor` only drives fake timers forward itself when it detects a
// global `jest` object (`typeof jest !== 'undefined'`, then `jest.advanceTimersByTime`); it has no
// equivalent check for Vitest's `vi`. Without this, any test that combines `vi.useFakeTimers()`
// with `waitFor` hangs until the real test timeout, because `waitFor` falls back to polling via
// `setInterval`, which is itself one of the faked timers and never fires on its own. This shim
// satisfies that duck-typing check so `waitFor` drives `vi`'s fake timers the same way Jest's were.
if (typeof (globalThis as { jest?: unknown }).jest === 'undefined') {
  (globalThis as { jest?: { advanceTimersByTime: typeof vi.advanceTimersByTime } }).jest = {
    advanceTimersByTime: (...args) => vi.advanceTimersByTime(...args),
  };
}
