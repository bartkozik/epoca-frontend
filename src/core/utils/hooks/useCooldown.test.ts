import { act, renderHook } from '@testing-library/react';
import { useCooldown } from './useCooldown';

afterEach(() => {
  vi.useRealTimers();
});

it('expires after elapsed wall time even when a suspended tab delays its timer', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useCooldown());
  act(() => result.current.setCooldown(60));

  act(() => {
    vi.setSystemTime(Date.now() + 120_000);
    vi.advanceTimersByTime(1000);
  });

  expect(result.current.cooldown).toBe(0);
});

it('restarts the deadline when the server sends the same delay again', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useCooldown());
  act(() => result.current.setCooldown(60));
  act(() => {
    vi.advanceTimersByTime(500);
  });
  act(() => result.current.setCooldown(60));
  act(() => {
    vi.advanceTimersByTime(59_500);
  });
  expect(result.current.cooldown).toBe(1);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(result.current.cooldown).toBe(0);
});

it('cancels the scheduled tick when unmounted', () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useCooldown());
  act(() => result.current.setCooldown(60));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
