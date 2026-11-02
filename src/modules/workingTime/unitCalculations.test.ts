import { ProjectClientReportedData, Unit, UnitState, WorkUnitEntryType } from './types';
import {
  calculateClientHoursForWeek,
  calculateUnitsWeeklyReportedHours,
  calculateUnitsWeeklyTotalHours,
  getAvailableHoursForDay,
  getUnitsForDay,
  isReportedMinimumHoursForDay,
} from './unitCalculations';

vi.mock('i18next', () => {
  const i18nextMock = {
    init: vi.fn(),
    t: (key: string) => key,
    use: vi.fn(),
  };
  i18nextMock.use.mockReturnValue(i18nextMock);

  return { __esModule: true, default: i18nextMock };
});

const projectClient = {
  projectName: 'Epoca',
  clientId: 'client-1',
  projectId: 'project-1',
  clientName: 'Iterators',
  clientColor: '#123456',
  clientTexture: '',
  projectDescription: 'Time reporting',
};

const createUnit = (overrides: Partial<Unit> = {}): Unit => ({
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient,
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
  convertedDate: new Date('2026-07-28T00:00:00.000Z'),
  formattedCreatedAt: '28/07/2026',
  formattedDate: '28/07/2026',
  formattedDuration: '8:00',
  formattedReportDuration: '8:00',
  sequenceIndex: 0,
  userFullName: 'Test User',
  ...overrides,
});

describe('calculateUnitsWeeklyTotalHours', () => {
  it('returns 0 for an empty units list', () => {
    expect(calculateUnitsWeeklyTotalHours([])).toBe(0);
  });

  it('sums worklog hours and excludes Note entries, regardless of state', () => {
    const units = [
      createUnit({ id: 'w1', duration: 'PT8H', state: UnitState.Draft }),
      createUnit({ id: 'w2', duration: 'PT2H', state: UnitState.Active }),
      createUnit({ id: 'n1', entryType: WorkUnitEntryType.Note, duration: 'PT5H' }),
    ];

    expect(calculateUnitsWeeklyTotalHours(units)).toBe(10);
  });
});

describe('calculateUnitsWeeklyReportedHours', () => {
  it('returns 0 for an empty units list', () => {
    expect(calculateUnitsWeeklyReportedHours([])).toBe(0);
  });

  it('excludes Draft worklogs and Note entries', () => {
    const units = [
      createUnit({ id: 'w1', duration: 'PT8H', state: UnitState.Draft }),
      createUnit({ id: 'w2', duration: 'PT2H', state: UnitState.Active }),
      createUnit({ id: 'n1', entryType: WorkUnitEntryType.Note, duration: 'PT5H', state: UnitState.Active }),
    ];

    expect(calculateUnitsWeeklyReportedHours(units)).toBe(2);
  });
});

describe('calculateClientHoursForWeek', () => {
  it('returns an empty record for an empty units list', () => {
    expect(calculateClientHoursForWeek([])).toEqual({});
  });

  it('aggregates non-draft worklog hours per client, excluding drafts and notes', () => {
    const units = [
      createUnit({
        id: 'w1',
        formattedDuration: '4:00',
        projectClient: { ...projectClient, clientName: 'Beta', clientColor: '#abcdef' },
      }),
      createUnit({
        id: 'w2',
        formattedDuration: '2:30',
        projectClient: { ...projectClient, clientName: 'Beta', clientColor: '#abcdef' },
      }),
      createUnit({ id: 'draft', formattedDuration: '8:00', state: UnitState.Draft }),
      createUnit({ id: 'note', entryType: WorkUnitEntryType.Note, formattedDuration: '8:00' }),
    ];

    const result = calculateClientHoursForWeek(units);

    expect(result).toEqual<Record<string, ProjectClientReportedData>>({
      Beta: { hours: 6.5, color: '#abcdef' },
    });
  });

  it('falls back to the unknown-client translation key and default color when projectClient is missing', () => {
    const units = [createUnit({ id: 'w1', projectClient: undefined, formattedDuration: '1:00' })];

    const result = calculateClientHoursForWeek(units);

    expect(Object.keys(result)).toEqual(['common.unknown']);
    expect(result['common.unknown'].hours).toBe(1);
  });
});

describe('getUnitsForDay', () => {
  const dayOne = new Date('2026-07-28T00:00:00.000Z');
  const dayTwo = new Date('2026-07-29T00:00:00.000Z');

  it('returns an empty array for an empty units list', () => {
    expect(getUnitsForDay([], dayOne)).toEqual([]);
  });

  it('returns only Active units matching the given day, across multiple days', () => {
    const units = [
      createUnit({ id: 'day1-active', date: '2026-07-28', state: UnitState.Active }),
      createUnit({ id: 'day1-draft', date: '2026-07-28', state: UnitState.Draft }),
      createUnit({ id: 'day2-active', date: '2026-07-29', state: UnitState.Active }),
    ];

    expect(getUnitsForDay(units, dayOne).map((u) => u.id)).toEqual(['day1-active']);
    expect(getUnitsForDay(units, dayTwo).map((u) => u.id)).toEqual(['day2-active']);
  });
});

describe('getAvailableHoursForDay', () => {
  const day = new Date('2026-07-28T00:00:00.000Z');
  const otherDay = new Date('2026-07-29T00:00:00.000Z');

  it('returns the full max when there are no units', () => {
    expect(getAvailableHoursForDay([], day)).toBe(672);
  });

  it('only counts units matching the given day', () => {
    const units = [
      createUnit({ id: 'day1', date: '2026-07-28', formattedDuration: '8:00' }),
      createUnit({ id: 'day2', date: '2026-07-29', formattedDuration: '4:00' }),
    ];

    expect(getAvailableHoursForDay(units, day)).toBe(664);
    expect(getAvailableHoursForDay(units, otherDay)).toBe(668);
  });

  it('excludes the given editingUnitId from the total', () => {
    const units = [
      createUnit({ id: 'unit-a', date: '2026-07-28', formattedDuration: '8:00' }),
      createUnit({ id: 'unit-b', date: '2026-07-28', formattedDuration: '2:00' }),
    ];

    expect(getAvailableHoursForDay(units, day, 'unit-a')).toBe(670);
  });
});

describe('isReportedMinimumHoursForDay', () => {
  const day = new Date('2026-07-28T00:00:00.000Z');

  it('returns false when there are no units', () => {
    expect(isReportedMinimumHoursForDay([], day)).toBe(false);
  });

  it('only counts units matching the given day', () => {
    const units = [
      createUnit({ id: 'day1', date: '2026-07-28', formattedDuration: '8:00' }),
      createUnit({ id: 'day2', date: '2026-07-29', formattedDuration: '8:00' }),
    ];

    expect(isReportedMinimumHoursForDay(units, day)).toBe(true);
    expect(isReportedMinimumHoursForDay([units[1]], day)).toBe(false);
  });

  it('returns false when total hours are below the minimum', () => {
    const units = [createUnit({ id: 'unit-a', date: '2026-07-28', formattedDuration: '2:00' })];

    expect(isReportedMinimumHoursForDay(units, day)).toBe(false);
  });
});
