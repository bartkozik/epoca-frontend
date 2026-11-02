import { convertTimeFormat } from './convert-time-format';

const asClock = (time: string | number): string =>
  convertTimeFormat({
    time,
    fractionalHour: true,
    includeColons: true,
  });

const hoursFromTime = (hours: number, minutes: number, seconds: number): number =>
  hours + minutes / 60 + seconds / 3600;

describe('convertTimeFormat', () => {
  describe('minute normalization', () => {
    it('carries a rounded 60-minute component into the next hour', () => {
      expect(asClock(7.999999999999999)).toBe('08:00');
    });

    it.each([
      { expected: '07:59', seconds: 29 },
      { expected: '08:00', seconds: 30 },
    ])('rounds 07:59:$seconds to $expected', ({ expected, seconds }) => {
      expect(asClock(hoursFromTime(7, 59, seconds))).toBe(expected);
    });

    it.each([
      { expected: '00:59', totalMinutes: 59 },
      { expected: '01:00', totalMinutes: 60 },
      { expected: '01:59', totalMinutes: 119 },
      { expected: '02:00', totalMinutes: 120 },
    ])('formats $totalMinutes total minutes as $expected', ({ expected, totalMinutes }) => {
      expect(asClock(totalMinutes / 60)).toBe(expected);
    });

    it('normalizes an overflowing HH:mm input for clock output', () => {
      expect(asClock('07:60')).toBe('08:00');
    });

    it('normalizes an overflowing HH:mm input for ISO output', () => {
      expect(convertTimeFormat({ time: '07:60' })).toBe('PT8H0M');
    });

    it.each([
      { expected: '07:59', time: 'PT7H59M29S' },
      { expected: '08:00', time: 'PT7H59M30S' },
      { expected: '25:00', time: 'PT25H' },
    ])('formats $time as $expected using its complete duration', ({ expected, time }) => {
      expect(asClock(time)).toBe(expected);
    });
  });

  describe('existing output contract', () => {
    it.each([
      { expected: '01:30', inputKind: 'numeric', time: 1.5 },
      { expected: '01:30', inputKind: 'decimal string', time: '1.5' },
      { expected: '01:30', inputKind: 'comma string', time: '1,5' },
      { expected: '01:30', inputKind: 'HH:mm string', time: '01:30' },
      { expected: '01:30', inputKind: 'ISO duration', time: 'PT1H30M' },
    ])('preserves the clock result for $inputKind input', ({ expected, time }) => {
      expect(asClock(time)).toBe(expected);
    });

    it('preserves fractional-hour output after normalization', () => {
      expect(convertTimeFormat({ time: 7.999999999999999, fractionalHour: true })).toBe('8.00h');
    });

    it('preserves ISO output after normalization', () => {
      expect(convertTimeFormat({ time: 7.999999999999999 })).toBe('PT8H0M');
    });

    it('returns an empty string for empty values', () => {
      expect(convertTimeFormat({})).toBe('');
      expect(convertTimeFormat({ time: '' })).toBe('');
      expect(convertTimeFormat({ time: null as never })).toBe('');
    });

    it('does not introduce a new malformed-input contract', () => {
      expect(asClock('invalid')).toBe('NaN:NaN');
    });
  });
});
