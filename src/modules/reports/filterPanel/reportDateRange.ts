import { DATE_FORMAT } from '@/core/utils/helpers';
import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export type ReportDateRangeDirection = 'previous' | 'next';
export type ReportDateRangeNavigationMode = 'full-month' | 'fixed-length';

export interface ReportDateRange {
  fromDate: Dayjs;
  toDate: Dayjs | null;
}

export interface ReportDateRangeSnapshot extends ReportDateRange {
  navigationMode: ReportDateRangeNavigationMode;
  today: Dayjs;
}

export interface ReportDateRangeSnapshotInput extends ReportDateRange {
  navigationMode?: ReportDateRangeNavigationMode;
  today: Dayjs;
}

export interface ReportDateRangeSerializationInput extends ReportDateRange {
  navigationMode?: ReportDateRangeNavigationMode;
}

export interface SerializedReportDateRange {
  endDate?: string;
  navigationMode?: 'fixed-length';
  startDate: string;
}

const normalizeDay = (date: Dayjs): Dayjs => date.startOf('day');

const isFullCalendarMonth = (fromDate: Dayjs, toDate: Dayjs): boolean =>
  fromDate.isSame(fromDate.startOf('month'), 'day') &&
  toDate.isSame(toDate.endOf('month'), 'day') &&
  fromDate.isSame(toDate, 'month');

const inferNavigationMode = (fromDate: Dayjs, toDate: Dayjs | null): ReportDateRangeNavigationMode =>
  toDate !== null && isFullCalendarMonth(fromDate, toDate) ? 'full-month' : 'fixed-length';

export const createReportDateRangeSnapshot = (range: ReportDateRange, today: Dayjs): ReportDateRangeSnapshot | null => {
  const normalizedToday = normalizeDay(today);
  const fromDate = normalizeDay(range.fromDate);
  const effectiveToDate = normalizeDay(range.toDate ?? normalizedToday);

  if (
    !normalizedToday.isValid() ||
    !fromDate.isValid() ||
    !effectiveToDate.isValid() ||
    fromDate.isAfter(effectiveToDate, 'day')
  )
    return null;

  const toDate = range.toDate === null ? null : effectiveToDate;

  return {
    fromDate,
    navigationMode: inferNavigationMode(fromDate, toDate),
    toDate,
    today: normalizedToday,
  };
};

export const getEffectiveReportEndDate = (snapshot: ReportDateRangeSnapshot): Dayjs =>
  snapshot.toDate ?? snapshot.today;

export const shiftReportDateRange = (
  snapshot: ReportDateRangeSnapshotInput,
  direction: ReportDateRangeDirection,
): ReportDateRangeSnapshot | null => {
  const normalized = createReportDateRangeSnapshot(snapshot, snapshot.today);
  if (!normalized) return null;

  const effectiveToDate = getEffectiveReportEndDate(normalized);
  const multiplier = direction === 'next' ? 1 : -1;
  const navigationMode = snapshot.navigationMode ?? normalized.navigationMode;

  if (navigationMode === 'full-month') {
    const fromDate = normalized.fromDate.add(multiplier, 'month').startOf('month');

    return {
      fromDate,
      navigationMode,
      toDate: fromDate.endOf('month').startOf('day'),
      today: normalized.today,
    };
  }

  const inclusiveDays = effectiveToDate.diff(normalized.fromDate, 'day') + 1;
  const offset = inclusiveDays * multiplier;

  return {
    fromDate: normalized.fromDate.add(offset, 'day'),
    navigationMode,
    toDate: effectiveToDate.add(offset, 'day'),
    today: normalized.today,
  };
};

export const parseReportDateRange = (params: URLSearchParams, today: Dayjs): ReportDateRangeSnapshot => {
  const normalizedToday = normalizeDay(today);
  const defaultRange: ReportDateRangeSnapshot = {
    fromDate: normalizedToday.startOf('month'),
    navigationMode: 'full-month',
    toDate: normalizedToday.endOf('month').startOf('day'),
    today: normalizedToday,
  };
  const startValue = params.get('startDate');
  const endValue = params.get('endDate');
  const navigationModeValue = params.get('navigationMode');
  const fromDate = startValue ? dayjs(startValue, DATE_FORMAT.DAY_BE_FORMAT, true) : null;
  const toDate = endValue !== null ? dayjs(endValue, DATE_FORMAT.DAY_BE_FORMAT, true) : null;

  if (!fromDate?.isValid()) return defaultRange;

  const normalizedFromDate = normalizeDay(fromDate);

  if (
    endValue === null &&
    navigationModeValue !== 'fixed-length' &&
    normalizedFromDate.isSame(defaultRange.fromDate, 'day')
  )
    return defaultRange;

  if (!toDate?.isValid()) {
    return (
      createReportDateRangeSnapshot({ fromDate: normalizedFromDate, toDate: null }, normalizedToday) ?? defaultRange
    );
  }

  if (normalizedFromDate.isAfter(toDate, 'day')) return defaultRange;

  const normalizedToDate = normalizeDay(toDate);
  const inferredNavigationMode = inferNavigationMode(normalizedFromDate, normalizedToDate);
  const navigationMode =
    navigationModeValue === 'fixed-length' && inferredNavigationMode === 'full-month'
      ? 'fixed-length'
      : inferredNavigationMode;

  return {
    fromDate: normalizedFromDate,
    navigationMode,
    toDate: normalizedToDate,
    today: normalizedToday,
  };
};

export const serializeReportDateRange = (range: ReportDateRangeSerializationInput): SerializedReportDateRange => {
  const hasAmbiguousFixedLengthMode =
    range.navigationMode === 'fixed-length' &&
    (range.toDate === null
      ? range.fromDate.isSame(range.fromDate.startOf('month'), 'day')
      : isFullCalendarMonth(range.fromDate, range.toDate));

  return {
    startDate: range.fromDate.format(DATE_FORMAT.DAY_BE_FORMAT),
    ...(range.toDate ? { endDate: range.toDate.format(DATE_FORMAT.DAY_BE_FORMAT) } : {}),
    ...(hasAmbiguousFixedLengthMode ? { navigationMode: 'fixed-length' } : {}),
  };
};
