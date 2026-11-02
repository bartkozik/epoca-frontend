import { addPivotDurations, formatPivotDuration, parsePivotDuration } from './parsePivotDuration';

describe('parsePivotDuration', () => {
  it.each([
    ['PT0S', { seconds: 0, nanoseconds: 0 }],
    ['PT8H30M', { seconds: 30_600, nanoseconds: 0 }],
    ['P2D', { seconds: 172_800, nanoseconds: 0 }],
    ['PT48H', { seconds: 172_800, nanoseconds: 0 }],
    ['PT1.250S', { seconds: 1, nanoseconds: 250_000_000 }],
  ])('parses %s', (input, expected) => {
    expect(parsePivotDuration(input)).toEqual(expected);
  });

  it.each(['-PT1H', 'P1Y', 'P1M', 'P1W', 'P', 'PT', 'P1DT', 'PT1,5S', 'PT1.1234567890S'])(
    'rejects unsupported duration %s',
    (input) => {
      expect(() => parsePivotDuration(input)).toThrow('Invalid pivot duration');
    },
  );

  it('rejects a duration that exceeds safe integer seconds', () => {
    expect(() => parsePivotDuration('P999999999999D')).toThrow('Invalid pivot duration');
  });
});

describe('pivot duration arithmetic', () => {
  it('carries nanoseconds while adding without losing precision', () => {
    expect(
      addPivotDurations({ seconds: 59, nanoseconds: 750_000_000 }, { seconds: 1, nanoseconds: 500_000_000 }),
    ).toEqual({ seconds: 61, nanoseconds: 250_000_000 });
  });

  it.each([
    [{ seconds: 172_800, nanoseconds: 0 }, '48:00'],
    [{ seconds: 30_629, nanoseconds: 999_999_999 }, '08:30'],
    [{ seconds: 30_630, nanoseconds: 0 }, '08:31'],
  ])('formats %o as %s without wrapping hours', (duration, expected) => {
    expect(formatPivotDuration(duration)).toBe(expected);
  });
});
