import { renderToString } from 'react-dom/server';
import { act, renderHook } from '@testing-library/react';
import useWindowSize from './useWindowSize';

const WindowSizeProbe = (): JSX.Element => {
  const [width, height] = useWindowSize();

  return <span>{`${width}x${height}`}</span>;
};

describe('useWindowSize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns initial dimensions and applies the latest resize after 100 ms', () => {
    const { result } = renderHook(() => useWindowSize());
    expect(result.current).toEqual([1200, 800]);

    act(() => {
      window.innerWidth = 900;
      window.innerHeight = 600;
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(99);
    });
    expect(result.current).toEqual([1200, 800]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([900, 600]);
  });

  it('removes the registered resize handler on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useWindowSize());
    const handler = addSpy.mock.calls.find(([event]) => event === 'resize')?.[1];

    unmount();

    expect(handler).toBeDefined();
    expect(removeSpy).toHaveBeenCalledWith('resize', handler);
  });

  it('renders safely when window is unavailable on the server', () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

    try {
      delete (globalThis as { window?: Window }).window;

      expect(renderToString(<WindowSizeProbe />)).toContain('0x0');
    } finally {
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    }
  });
});
