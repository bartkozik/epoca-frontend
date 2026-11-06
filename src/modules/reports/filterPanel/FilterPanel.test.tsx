import en from '@/core/i18n/locales/en/translation.json';
import pl from '@/core/i18n/locales/pl/translation.json';
import { useCallback, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import dayjs, { Dayjs } from 'dayjs';
import type { Mock, MockedFunction } from 'vitest';
import FilterPanel from './FilterPanel';
import type { ReportDateRange, ReportDateRangeSnapshot } from './reportDateRange';
import { buildFilters } from './reportFiltersTestFixtures';
import type { ReportQuerySnapshot } from './types';
import { useFilterPanelURLParams } from './useFilterPanelURLParams';
import { useReportDateRangeURL } from './useReportDateRangeURL';
import type { ReportFilters } from './useReportFilters';

let currentLanguage: 'en' | 'pl' = 'en';
const translations = { en, pl };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: currentLanguage },
    t: (key: string) => (translations[currentLanguage] as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('i18next', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

vi.mock('./useFilterPanelURLParams', () => ({
  useFilterPanelURLParams: vi.fn(),
}));

vi.mock('./useReportDateRangeURL', () => ({
  useReportDateRangeURL: vi.fn(),
}));

vi.mock('./dateRangePicker', async () => {
  const dayjsModule = await vi.importActual<typeof import('dayjs')>('dayjs');
  const actualDayjs = (dayjsModule as unknown as { default?: typeof dayjsModule }).default ?? dayjsModule;

  return {
    __esModule: true,
    default: ({
      onCommitDateRange,
      onNavigateDateRange,
    }: {
      onCommitDateRange: (range: ReportDateRange, capturedToday: Dayjs) => void;
      onNavigateDateRange: (direction: 'previous' | 'next') => void;
    }) => (
      <div>
        <button onClick={() => onNavigateDateRange('previous')}>picker-previous</button>
        <button onClick={() => onNavigateDateRange('next')}>picker-next</button>
        <button
          onClick={() =>
            onCommitDateRange(
              {
                fromDate: actualDayjs('2026-07-10T15:30:00'),
                toDate: actualDayjs('2026-07-20T22:00:00'),
              },
              actualDayjs('2026-10-05').startOf('day'),
            )
          }
        >
          picker-valid-manual
        </button>
        <button
          onClick={() =>
            onCommitDateRange(
              { fromDate: actualDayjs('2026-07-20'), toDate: actualDayjs('2026-07-10') },
              actualDayjs('2026-10-05').startOf('day'),
            )
          }
        >
          picker-invalid-manual
        </button>
      </div>
    ),
  };
});

vi.mock('@/modules/reports/filterPanel/FilterPanelTag', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/core/theme/multiSearch', () => ({
  __esModule: true,
  default: ({
    items,
    label,
    name,
    onChange,
    readOnly,
  }: {
    items: Array<{ label: string; value: string }>;
    label: string;
    name: string;
    onChange: (values: string[]) => void;
    readOnly?: boolean;
  }) => (
    <section aria-label={name} data-readonly={readOnly ? 'true' : 'false'}>
      <span>{label}</span>
      <button onClick={() => onChange(items.slice(0, 1).map(({ value }) => value))}>{`select-${name}`}</button>
    </section>
  ),
}));

vi.mock('@/modules/reports/hooks/useReportFilterFacets', () => ({
  useReportFilterFacets: () => ({ status: 'unavailable', facets: null, request: vi.fn(), retry: vi.fn() }),
}));

const useFilterPanelURLParamsMock = useFilterPanelURLParams as MockedFunction<typeof useFilterPanelURLParams>;
const useReportDateRangeURLMock = useReportDateRangeURL as MockedFunction<typeof useReportDateRangeURL>;

const replaceDateRange = vi.fn();
const setURLParams = vi.fn<(updates: Record<string, string | null>) => void>();
let hydrateDateRange: ((snapshot: ReportDateRangeSnapshot) => void) | undefined;
let hookRegistrationOrder: string[] = [];

interface FilterPanelFixture {
  onApplyFilters: Mock;
}

const createFixture = (): FilterPanelFixture => {
  const onApplyFilters = vi.fn().mockResolvedValue(undefined);
  return { onApplyFilters };
};

function StatefulFilterPanel({
  initialFilters,
  onApplyFilters,
}: {
  initialFilters: ReportFilters;
  onApplyFilters?: (snapshot: ReportQuerySnapshot) => void | Promise<void>;
}): JSX.Element {
  const [dateRange, setDateRange] = useState({
    selectedFromDate: initialFilters.selectedFromDate,
    selectedToDate: initialFilters.selectedToDate,
    navigationMode: initialFilters.navigationMode,
  });

  const setSelectedDateRange = useCallback(
    (snapshot: ReportDateRangeSnapshot) => {
      initialFilters.setSelectedDateRange(snapshot);
      setDateRange({
        selectedFromDate: snapshot.fromDate,
        selectedToDate: snapshot.toDate,
        navigationMode: snapshot.navigationMode,
      });
    },
    [initialFilters],
  );

  return (
    <FilterPanel filters={{ ...initialFilters, ...dateRange, setSelectedDateRange }} onApplyFilters={onApplyFilters} />
  );
}

const reportSnapshot = (
  fromDate: string,
  toDate: string | null,
  navigationMode: ReportDateRangeSnapshot['navigationMode'],
): ReportDateRangeSnapshot => ({
  fromDate: dayjs(fromDate),
  navigationMode,
  toDate: toDate === null ? null : dayjs(toDate),
  today: dayjs('2026-07-29T12:00:00'),
});

const expectSnapshotDates = (
  snapshot: ReportDateRangeSnapshot,
  fromDate: string,
  toDate: string | null,
  navigationMode: ReportDateRangeSnapshot['navigationMode'],
): void => {
  expect(snapshot.fromDate.format('YYYY-MM-DD')).toBe(fromDate);
  expect(snapshot.toDate?.format('YYYY-MM-DD') ?? null).toBe(toDate);
  expect(snapshot.navigationMode).toBe(navigationMode);
};

describe('FilterPanel report date orchestration', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentLanguage = 'en';
    hydrateDateRange = undefined;
    hookRegistrationOrder = [];
    useFilterPanelURLParamsMock.mockImplementation(() => {
      hookRegistrationOrder.push('filters');
      return { setURLParams };
    });
    useReportDateRangeURLMock.mockImplementation(({ onHydrate }) => {
      hookRegistrationOrder.push('dates');
      hydrateDateRange = onHydrate;
      return { replaceDateRange };
    });
  });

  it.each([
    ['en', 'Project:', 'User:', 'Client:'],
    ['pl', 'Projekt:', 'Użytkownik:', 'Klient:'],
  ] as const)('renders the report filters in %s without obsolete PM controls', (language, project, user, client) => {
    currentLanguage = language;
    const fixture = createFixture();
    render(<FilterPanel filters={buildFilters()} onApplyFilters={fixture.onApplyFilters} />);
    expect(screen.getByText(project)).toBeVisible();
    expect(screen.getByText(user)).toBeVisible();
    expect(screen.getByText(client)).toBeVisible();
    expect(screen.queryByText(/PM classification|Klasyfikacja PM|Projekt PM|PM project/i)).not.toBeInTheDocument();
  });

  it('registers non-date URL hydration before report-date hydration', () => {
    const fixture = createFixture();

    render(<FilterPanel filters={buildFilters()} onApplyFilters={fixture.onApplyFilters} />);

    expect(hookRegistrationOrder).toEqual(['filters', 'dates']);
  });

  it('commits the next full month as one exact snapshot across store, URL, and request', () => {
    const fixture = createFixture();
    const setSelectedDateRange = vi.fn();
    const filters = buildFilters({
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: dayjs('2026-07-31'),
      navigationMode: 'full-month',
      setSelectedDateRange,
    });

    render(<FilterPanel filters={filters} onApplyFilters={fixture.onApplyFilters} />);
    fireEvent.click(screen.getByRole('button', { name: 'picker-next' }));

    const committedSnapshot = setSelectedDateRange.mock.calls[0][0] as ReportDateRangeSnapshot;
    expectSnapshotDates(committedSnapshot, '2026-08-01', '2026-08-31', 'full-month');
    expect(replaceDateRange).toHaveBeenCalledWith(committedSnapshot);
    expect(fixture.onApplyFilters).toHaveBeenCalledWith(expect.objectContaining(committedSnapshot));
    expect(replaceDateRange.mock.calls[0][0]).toBe(committedSnapshot);
    expect(fixture.onApplyFilters.mock.calls[0][0]).toEqual(expect.objectContaining(committedSnapshot));
    const filterURLKeys = setURLParams.mock.calls.flatMap(([updates]) => Object.keys(updates));
    expect(filterURLKeys).not.toContain('startDate');
    expect(filterURLKeys).not.toContain('endDate');
  });

  it('advances from live store values on two rapid next clicks', () => {
    const fixture = createFixture();
    const filters = buildFilters({
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: dayjs('2026-07-31'),
      navigationMode: 'full-month',
    });

    render(<StatefulFilterPanel initialFilters={filters} onApplyFilters={fixture.onApplyFilters} />);

    const nextButton = screen.getByRole('button', { name: 'picker-next' });
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);

    const firstRequest = fixture.onApplyFilters.mock.calls[0][0] as ReportDateRangeSnapshot;
    const secondRequest = fixture.onApplyFilters.mock.calls[1][0] as ReportDateRangeSnapshot;
    expectSnapshotDates(firstRequest, '2026-08-01', '2026-08-31', 'full-month');
    expectSnapshotDates(secondRequest, '2026-09-01', '2026-09-30', 'full-month');
  });

  it('round-trips an ambiguous full-month-shaped fixed-length range through next and previous', () => {
    const fixture = createFixture();
    const filters = buildFilters({
      selectedFromDate: dayjs('2026-05-31'),
      selectedToDate: dayjs('2026-06-30'),
      navigationMode: 'fixed-length',
    });

    render(<StatefulFilterPanel initialFilters={filters} onApplyFilters={fixture.onApplyFilters} />);

    fireEvent.click(screen.getByRole('button', { name: 'picker-next' }));
    fireEvent.click(screen.getByRole('button', { name: 'picker-previous' }));

    const next = fixture.onApplyFilters.mock.calls[0][0] as ReportDateRangeSnapshot;
    const previous = fixture.onApplyFilters.mock.calls[1][0] as ReportDateRangeSnapshot;
    expectSnapshotDates(next, '2026-07-01', '2026-07-31', 'fixed-length');
    expectSnapshotDates(previous, '2026-05-31', '2026-06-30', 'fixed-length');
  });

  it('hydrates the store and starts one request with the same snapshot without replacing the URL', () => {
    const fixture = createFixture();
    const setSelectedDateRange = vi.fn();
    const filters = buildFilters({ setSelectedDateRange });
    render(<FilterPanel filters={filters} onApplyFilters={fixture.onApplyFilters} />);
    const snapshot = reportSnapshot('2026-06-01', '2026-06-30', 'full-month');

    act(() => hydrateDateRange?.(snapshot));

    expect(setSelectedDateRange).toHaveBeenCalledTimes(1);
    expect(setSelectedDateRange).toHaveBeenCalledWith(snapshot);
    expect(fixture.onApplyFilters).toHaveBeenCalledTimes(1);
    expect(fixture.onApplyFilters).toHaveBeenCalledWith(expect.objectContaining(snapshot));
    expect(replaceDateRange).not.toHaveBeenCalled();
  });

  it('creates one snapshot for a valid manual commit and shares it across all consumers', () => {
    const fixture = createFixture();
    const setSelectedDateRange = vi.fn();
    const filters = buildFilters({ setSelectedDateRange });
    render(<FilterPanel filters={filters} onApplyFilters={fixture.onApplyFilters} />);

    fireEvent.click(screen.getByRole('button', { name: 'picker-valid-manual' }));

    const committedSnapshot = setSelectedDateRange.mock.calls[0][0] as ReportDateRangeSnapshot;
    expectSnapshotDates(committedSnapshot, '2026-07-10', '2026-07-20', 'fixed-length');
    expect(committedSnapshot.fromDate.format('HH:mm:ss')).toBe('00:00:00');
    expect(committedSnapshot.today.format('YYYY-MM-DD')).toBe('2026-10-05');
    expect(replaceDateRange.mock.calls[0][0]).toBe(committedSnapshot);
    expect(fixture.onApplyFilters.mock.calls[0][0]).toEqual(expect.objectContaining(committedSnapshot));
    expect((fixture.onApplyFilters.mock.calls[0][0] as ReportDateRangeSnapshot).today.format('YYYY-MM-DD')).toBe(
      '2026-10-05',
    );
  });

  it('ignores an invalid manual range without changing store, URL, or requests', () => {
    const fixture = createFixture();
    const setSelectedDateRange = vi.fn();
    const filters = buildFilters({ setSelectedDateRange });
    render(<FilterPanel filters={filters} onApplyFilters={fixture.onApplyFilters} />);

    fireEvent.click(screen.getByRole('button', { name: 'picker-invalid-manual' }));

    expect(setSelectedDateRange).not.toHaveBeenCalled();
    expect(replaceDateRange).not.toHaveBeenCalled();
    expect(fixture.onApplyFilters).not.toHaveBeenCalled();
  });
});
