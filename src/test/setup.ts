import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// waitFor relies on timers; its polling can deadlock when fake timers are not advanced.
if (typeof (globalThis as { jest?: unknown }).jest === 'undefined') {
  (globalThis as { jest?: { advanceTimersByTime: typeof vi.advanceTimersByTime } }).jest = {
    advanceTimersByTime: (...args) => vi.advanceTimersByTime(...args),
  };
}
