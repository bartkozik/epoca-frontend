import { act, renderHook } from '@testing-library/react';
import dayjs from 'dayjs';
import { useWeekNavigation } from './useWeekNavigation';

describe('useWeekNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday 2026-07-29 -- ISO week Monday is 2026-07-27.
    vi.setSystemTime(new Date(2026, 6, 29, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes dates to a 7-day range starting from this week's ISO Monday", () => {
    const { result } = renderHook(() => useWeekNavigation());

    expect(result.current.dates).toHaveLength(7);
    expect(dayjs(result.current.dates[0]).format('YYYY-MM-DD')).toBe('2026-07-27');
    expect(dayjs(result.current.dates[6]).format('YYYY-MM-DD')).toBe('2026-08-02');
  });

  it('formats weekStart/weekEnd for the current week', () => {
    const { result } = renderHook(() => useWeekNavigation());

    expect(result.current.weekStart).toBe('2026-07-27');
    expect(result.current.weekEnd).toBe('2026-08-02');
  });

  it('shifts the week forward by exactly 7 days on goToNextWeek', () => {
    const { result } = renderHook(() => useWeekNavigation());

    act(() => result.current.goToNextWeek());

    expect(result.current.weekStart).toBe('2026-08-03');
    expect(result.current.weekEnd).toBe('2026-08-09');
  });

  it('shifts the week backward by exactly 7 days on goToPrevWeek', () => {
    const { result } = renderHook(() => useWeekNavigation());

    act(() => result.current.goToPrevWeek());

    expect(result.current.weekStart).toBe('2026-07-20');
    expect(result.current.weekEnd).toBe('2026-07-26');
  });

  it('resets back to the current week after navigating away, on goToToday', () => {
    const { result } = renderHook(() => useWeekNavigation());

    act(() => result.current.goToNextWeek());
    act(() => result.current.goToNextWeek());
    expect(result.current.weekStart).toBe('2026-08-10');

    act(() => result.current.goToToday());

    expect(result.current.weekStart).toBe('2026-07-27');
    expect(result.current.weekEnd).toBe('2026-08-02');
  });
});
