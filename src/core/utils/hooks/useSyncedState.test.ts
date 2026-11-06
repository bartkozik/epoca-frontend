import { act, renderHook } from '@testing-library/react';
import { useSyncedState } from './useSyncedState';

describe('useSyncedState', () => {
  it('starts with the given value', () => {
    const { result } = renderHook(({ value }) => useSyncedState(value), { initialProps: { value: 'a' } });

    expect(result.current[0]).toBe('a');
  });

  it('resyncs the local state when the external value changes', () => {
    const { result, rerender } = renderHook(({ value }) => useSyncedState(value), { initialProps: { value: 'a' } });

    rerender({ value: 'b' });

    expect(result.current[0]).toBe('b');
  });

  it('keeps a local update until the next external value change', () => {
    const { result, rerender } = renderHook(({ value }) => useSyncedState(value), { initialProps: { value: 'a' } });

    act(() => result.current[1]('local'));
    expect(result.current[0]).toBe('local');

    rerender({ value: 'a' });
    expect(result.current[0]).toBe('local');

    rerender({ value: 'b' });
    expect(result.current[0]).toBe('b');
  });

  it('resyncs on reference identity, not content -- a new array with the same items still clobbers a local override', () => {
    const first = [{ id: '1' }];
    const { result, rerender } = renderHook(({ value }) => useSyncedState(value), { initialProps: { value: first } });

    act(() => result.current[1]([]));
    expect(result.current[0]).toEqual([]);

    const sameContentNewReference = [{ id: '1' }];
    rerender({ value: sameContentNewReference });

    expect(result.current[0]).toBe(sameContentNewReference);
  });
});
