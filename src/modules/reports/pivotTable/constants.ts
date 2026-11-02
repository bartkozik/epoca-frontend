export const PIVOT_KEY = {
  USER: 'UserKey',
  PROJECT: 'ProjectKey',
  CLIENT: 'ClientKey',
  YEAR: 'YearKey',
  MONTH_YEAR: 'MonthYearKey',
  DATE: 'DateKey',
  ENTRY_TYPE: 'EntryTypeKey',
  TASK: 'TaskKey',
} as const;

export type PivotKey = (typeof PIVOT_KEY)[keyof typeof PIVOT_KEY];

export const PIVOT_VALUE = {
  DURATION_SUM: 'DurationSum',
  DURATION_AVG: 'DurationAvg',
  ENTRIES_COUNT: 'EntriesCount',
} as const;

export type PivotValue = (typeof PIVOT_VALUE)[keyof typeof PIVOT_VALUE];
