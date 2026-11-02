import dayjs from 'dayjs';
import {
  createReportDateRangeSnapshot,
  getEffectiveReportEndDate,
  parseReportDateRange,
  serializeReportDateRange,
  shiftReportDateRange,
} from './reportDateRange';

const TODAY = dayjs('2026-07-29T23:59:59');

const requireSnapshot = <T>(snapshot: T | null): T => {
  expect(snapshot).not.toBeNull();
  if (snapshot === null) throw new Error('Expected a valid report date range snapshot');

  return snapshot;
};

const toURLSearchParams = (range: ReturnType<typeof serializeReportDateRange>): URLSearchParams => {
  const params = new URLSearchParams();
  Object.entries(range).forEach(([key, value]) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (value !== undefined) params.set(key, value);
  });

  return params;
};

describe('createReportDateRangeSnapshot', () => {
  it('normalizes stored dates to the start of their local day', () => {
    const snapshot = requireSnapshot(
      createReportDateRangeSnapshot(
        {
          fromDate: dayjs('2026-07-10T13:14:15'),
          toDate: dayjs('2026-07-20T21:22:23'),
        },
        TODAY,
      ),
    );

    expect(snapshot.fromDate.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-10 00:00:00');
    expect(snapshot.toDate?.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-20 00:00:00');
    expect(snapshot.today.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-29 00:00:00');
  });

  it('keeps an open end while using captured today as its effective end', () => {
    const snapshot = requireSnapshot(
      createReportDateRangeSnapshot({ fromDate: dayjs('2026-07-20T13:00:00'), toDate: null }, TODAY),
    );

    expect(snapshot.toDate).toBeNull();
    expect(getEffectiveReportEndDate(snapshot).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-29 00:00:00');
  });

  it.each([
    ['full-month', dayjs('2026-07-01'), dayjs('2026-07-31'), 'full-month'],
    ['custom closed', dayjs('2026-07-10'), dayjs('2026-07-20'), 'fixed-length'],
    ['open', dayjs('2026-07-01'), null, 'fixed-length'],
  ] as const)('assigns the expected navigation mode to the %s range', (_name, fromDate, toDate, expectedMode) => {
    const snapshot = requireSnapshot(createReportDateRangeSnapshot({ fromDate, toDate }, dayjs('2026-07-31')));

    expect(snapshot.navigationMode).toBe(expectedMode);
  });

  it('returns null when today is invalid for a closed range', () => {
    expect(
      createReportDateRangeSnapshot({ fromDate: dayjs('2026-07-10'), toDate: dayjs('2026-07-20') }, dayjs('invalid')),
    ).toBeNull();
  });

  it.each([
    ['an invalid start', dayjs('invalid'), dayjs('2026-07-20')],
    ['an invalid effective end', dayjs('2026-07-10'), dayjs('invalid')],
    ['an end before its start', dayjs('2026-07-20'), dayjs('2026-07-10')],
  ])('returns null for %s', (_name, fromDate, toDate) => {
    expect(createReportDateRangeSnapshot({ fromDate, toDate }, TODAY)).toBeNull();
  });
});

describe('shiftReportDateRange', () => {
  it('moves a full month to the adjacent full month and back', () => {
    const july = { fromDate: dayjs('2026-07-01'), toDate: dayjs('2026-07-31'), today: TODAY };
    const august = requireSnapshot(shiftReportDateRange(july, 'next'));

    expect(serializeReportDateRange(august)).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(august.navigationMode).toBe('full-month');
    expect(serializeReportDateRange(requireSnapshot(shiftReportDateRange(august, 'previous')))).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
  });

  it('moves a custom range by its inclusive day count and back', () => {
    const range = { fromDate: dayjs('2026-07-10'), toDate: dayjs('2026-07-20'), today: TODAY };
    const next = requireSnapshot(shiftReportDateRange(range, 'next'));

    expect(serializeReportDateRange(next)).toEqual({
      startDate: '2026-07-21',
      endDate: '2026-07-31',
    });
    expect(serializeReportDateRange(requireSnapshot(shiftReportDateRange(next, 'previous')))).toEqual({
      startDate: '2026-07-10',
      endDate: '2026-07-20',
    });
  });

  it('restores a custom range after its ambiguous result crosses URL serialization and parsing', () => {
    const next = requireSnapshot(
      shiftReportDateRange({ fromDate: dayjs('2026-05-31'), toDate: dayjs('2026-06-30'), today: TODAY }, 'next'),
    );
    const serialized = serializeReportDateRange(next);

    expect(serialized).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      navigationMode: 'fixed-length',
    });
    const hydrated = parseReportDateRange(toURLSearchParams(serialized), TODAY);
    expect(hydrated.navigationMode).toBe('fixed-length');
    expect(serializeReportDateRange(requireSnapshot(shiftReportDateRange(hydrated, 'previous')))).toEqual({
      startDate: '2026-05-31',
      endDate: '2026-06-30',
    });
  });

  it('keeps an open month-start range fixed-length when today is month-end', () => {
    const previous = requireSnapshot(
      shiftReportDateRange(
        { fromDate: dayjs('2026-07-01'), toDate: null, today: dayjs('2026-07-31T23:59:59') },
        'previous',
      ),
    );

    expect(serializeReportDateRange(previous)).toEqual({
      startDate: '2026-05-31',
      endDate: '2026-06-30',
    });
    expect(previous.toDate).not.toBeNull();
    expect(previous.navigationMode).toBe('fixed-length');

    const restored = requireSnapshot(shiftReportDateRange(previous, 'next'));
    expect(serializeReportDateRange(restored)).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      navigationMode: 'fixed-length',
    });
    expect(restored.navigationMode).toBe('fixed-length');
  });

  it.each([
    ['year boundary', '2026-12-01', '2026-12-31', '2027-01-01', '2027-01-31'],
    ['regular February', '2025-02-01', '2025-02-28', '2025-03-01', '2025-03-31'],
    ['leap February', '2028-02-01', '2028-02-29', '2028-03-01', '2028-03-31'],
  ])('moves a full month across a %s', (_name, from, to, expectedFrom, expectedTo) => {
    const shifted = requireSnapshot(
      shiftReportDateRange({ fromDate: dayjs(from), toDate: dayjs(to), today: TODAY }, 'next'),
    );

    expect(serializeReportDateRange(shifted)).toEqual({
      startDate: expectedFrom,
      endDate: expectedTo,
    });
    expect(serializeReportDateRange(requireSnapshot(shiftReportDateRange(shifted, 'previous')))).toEqual({
      startDate: from,
      endDate: to,
    });
  });

  it('uses captured today as the effective end of an open range', () => {
    const shifted = requireSnapshot(
      shiftReportDateRange({ fromDate: dayjs('2026-07-20'), toDate: null, today: TODAY }, 'previous'),
    );

    expect(serializeReportDateRange(shifted)).toEqual({
      startDate: '2026-07-10',
      endDate: '2026-07-19',
    });
  });

  it('returns null for an invalid snapshot', () => {
    expect(
      shiftReportDateRange({ fromDate: dayjs('2026-07-20'), toDate: dayjs('2026-07-10'), today: TODAY }, 'next'),
    ).toBeNull();
  });
});

describe('serializeReportDateRange', () => {
  it('adds a fixed-length marker only for a structurally ambiguous closed range', () => {
    expect(
      serializeReportDateRange({
        fromDate: dayjs('2026-07-01'),
        navigationMode: 'fixed-length',
        toDate: dayjs('2026-07-31'),
      }),
    ).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      navigationMode: 'fixed-length',
    });
  });

  it('omits the marker for an ordinary full month and parses it as full-month', () => {
    const snapshot = requireSnapshot(
      createReportDateRangeSnapshot({ fromDate: dayjs('2026-07-01'), toDate: dayjs('2026-07-31') }, TODAY),
    );
    const serialized = serializeReportDateRange(snapshot);

    expect(serialized).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
    expect(parseReportDateRange(toURLSearchParams(serialized), TODAY).navigationMode).toBe('full-month');
  });

  it('omits the marker for ordinary custom and open ranges', () => {
    expect(serializeReportDateRange({ fromDate: dayjs('2026-07-10'), toDate: dayjs('2026-07-20') })).toEqual({
      startDate: '2026-07-10',
      endDate: '2026-07-20',
    });

    const open = requireSnapshot(createReportDateRangeSnapshot({ fromDate: dayjs('2026-07-10'), toDate: null }, TODAY));
    expect(serializeReportDateRange(open)).toEqual({ startDate: '2026-07-10' });
  });
});

describe('parseReportDateRange', () => {
  it('parses and serializes strict local calendar dates without UTC conversion', () => {
    const params = new URLSearchParams('startDate=2026-07-10&endDate=2026-07-20');
    const snapshot = parseReportDateRange(params, TODAY);

    expect(snapshot.fromDate.format('YYYY-MM-DD HH:mm:ss Z')).toBe(
      dayjs('2026-07-10').startOf('day').format('YYYY-MM-DD HH:mm:ss Z'),
    );
    expect(snapshot.toDate?.format('YYYY-MM-DD HH:mm:ss Z')).toBe(
      dayjs('2026-07-20').startOf('day').format('YYYY-MM-DD HH:mm:ss Z'),
    );
    expect(serializeReportDateRange(snapshot)).toEqual({
      startDate: '2026-07-10',
      endDate: '2026-07-20',
    });
    expect(snapshot.navigationMode).toBe('fixed-length');
  });

  it('marks an exact closed calendar month as full-month navigation', () => {
    const snapshot = parseReportDateRange(new URLSearchParams('startDate=2026-07-01&endDate=2026-07-31'), TODAY);

    expect(snapshot.navigationMode).toBe('full-month');
  });

  it('honors a fixed-length marker for an ambiguous exact closed month', () => {
    const snapshot = parseReportDateRange(
      new URLSearchParams('startDate=2026-07-01&endDate=2026-07-31&navigationMode=fixed-length'),
      TODAY,
    );

    expect(snapshot.navigationMode).toBe('fixed-length');
  });

  it.each([
    [
      'an unknown marker on a full month',
      'startDate=2026-07-01&endDate=2026-07-31&navigationMode=unknown',
      'full-month',
      { startDate: '2026-07-01', endDate: '2026-07-31' },
    ],
    [
      'a full-month marker on a full month',
      'startDate=2026-07-01&endDate=2026-07-31&navigationMode=full-month',
      'full-month',
      { startDate: '2026-07-01', endDate: '2026-07-31' },
    ],
    [
      'a fixed-length marker on a custom range',
      'startDate=2026-07-10&endDate=2026-07-20&navigationMode=fixed-length',
      'fixed-length',
      { startDate: '2026-07-10', endDate: '2026-07-20' },
    ],
    [
      'a full-month marker on a custom range',
      'startDate=2026-07-10&endDate=2026-07-20&navigationMode=full-month',
      'fixed-length',
      { startDate: '2026-07-10', endDate: '2026-07-20' },
    ],
    [
      'a fixed-length marker on an open range',
      'startDate=2026-07-10&navigationMode=fixed-length',
      'fixed-length',
      { startDate: '2026-07-10' },
    ],
  ] as const)('ignores or canonicalizes %s', (_name, query, expectedMode, expectedSerialized) => {
    const snapshot = parseReportDateRange(new URLSearchParams(query), TODAY);

    expect(snapshot.navigationMode).toBe(expectedMode);
    expect(serializeReportDateRange(snapshot)).toEqual(expectedSerialized);
  });

  it.each([
    ['a missing start', 'endDate=2026-07-20'],
    ['an invalid start', 'startDate=not-a-date&endDate=2026-07-20'],
    ['an end before its start', 'startDate=2026-07-20&endDate=2026-07-10'],
    ['a non-strict date', 'startDate=2026-7-10&endDate=2026-07-20'],
  ])('uses the default range for %s', (_name, query) => {
    const snapshot = parseReportDateRange(new URLSearchParams(query), TODAY);

    expect(serializeReportDateRange(snapshot)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(snapshot.today.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-29 00:00:00');
    expect(snapshot.navigationMode).toBe('full-month');
  });

  it.each([
    ['an invalid calendar date', '2026-02-29'],
    ['an empty value', ''],
    ['an arbitrary invalid value', 'not-a-date'],
  ])('preserves a valid start as an open range for %s as end', (_name, endDate) => {
    const snapshot = parseReportDateRange(new URLSearchParams(`startDate=2026-07-10&endDate=${endDate}`), TODAY);

    expect(snapshot.toDate).toBeNull();
    expect(snapshot.navigationMode).toBe('fixed-length');
    expect(serializeReportDateRange(snapshot)).toEqual({ startDate: '2026-07-10' });
  });

  it.each([
    ['a missing end', 'startDate=2026-08-10'],
    ['an empty end', 'startDate=2026-08-10&endDate='],
    ['an invalid end', 'startDate=2026-08-10&endDate=not-a-date'],
  ])('defaults a future start with %s', (_name, query) => {
    const snapshot = parseReportDateRange(new URLSearchParams(query), TODAY);

    expect(snapshot.toDate?.format('YYYY-MM-DD')).toBe('2026-07-31');
    expect(snapshot.navigationMode).toBe('full-month');
    expect(serializeReportDateRange(snapshot)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
  });

  it('preserves an explicitly closed valid future range', () => {
    const snapshot = parseReportDateRange(new URLSearchParams('startDate=2026-08-10&endDate=2026-08-20'), TODAY);

    expect(serializeReportDateRange(snapshot)).toEqual({
      startDate: '2026-08-10',
      endDate: '2026-08-20',
    });
    expect(snapshot.navigationMode).toBe('fixed-length');
  });

  it.each([
    '',
    'startDate=2026-07-10',
    'startDate=2026-07-10&endDate=not-a-date',
    'startDate=2026-07-10&endDate=2026-07-20',
    'startDate=2026-08-10',
    'startDate=2026-08-10&endDate=2026-08-20',
    'startDate=2026-07-20&endDate=2026-07-10',
    'startDate=2026-07-01&endDate=2026-07-31&navigationMode=fixed-length',
  ])('returns a snapshot that satisfies the factory invariant for %s', (query) => {
    const snapshot = parseReportDateRange(new URLSearchParams(query), TODAY);

    expect(snapshot.fromDate.isValid()).toBe(true);
    expect(snapshot.toDate?.isValid() ?? true).toBe(true);
    expect(snapshot.today.isValid()).toBe(true);
    expect(createReportDateRangeSnapshot(snapshot, snapshot.today)).not.toBeNull();
  });

  it.each(['fixed-length', 'full-month', 'sideways'])(
    'canonicalizes away navigationMode=%s when an invalid end becomes open',
    (navigationMode) => {
      const snapshot = parseReportDateRange(
        new URLSearchParams(`startDate=2026-07-10&endDate=not-a-date&navigationMode=${navigationMode}`),
        TODAY,
      );

      expect(snapshot.toDate).toBeNull();
      expect(snapshot.navigationMode).toBe('fixed-length');
      expect(serializeReportDateRange(snapshot)).toEqual({ startDate: '2026-07-10' });
    },
  );

  it('returns an open range for a valid start with no end', () => {
    const snapshot = parseReportDateRange(new URLSearchParams('startDate=2026-07-10'), TODAY);

    expect(snapshot.toDate).toBeNull();
    expect(serializeReportDateRange(snapshot)).toEqual({ startDate: '2026-07-10' });
    expect(snapshot.navigationMode).toBe('fixed-length');
  });
});

describe('default monthly report navigation', () => {
  it('preserves an explicitly open current-month range when its URL is canonicalized and reloaded', () => {
    const snapshot = parseReportDateRange(
      new URLSearchParams('startDate=2026-07-01&navigationMode=fixed-length'),
      TODAY,
    );
    expect(snapshot.toDate).toBeNull();
    const restored = parseReportDateRange(toURLSearchParams(serializeReportDateRange(snapshot)), TODAY);
    expect(restored.toDate).toBeNull();
    expect(getEffectiveReportEndDate(restored).format('YYYY-MM-DD')).toBe('2026-07-29');
    expect(restored.navigationMode).toBe('fixed-length');
  });
  it.each(['', 'startDate=2026-10-01'])('navigates whole months from the default October range: %s', (query) => {
    const october = parseReportDateRange(new URLSearchParams(query), dayjs('2026-10-02'));
    expect(serializeReportDateRange(october)).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    const september = requireSnapshot(shiftReportDateRange(october, 'previous'));
    expect(serializeReportDateRange(september)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(serializeReportDateRange(requireSnapshot(shiftReportDateRange(september, 'next')))).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
  });
});
