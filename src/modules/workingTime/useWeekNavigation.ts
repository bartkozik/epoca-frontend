import { useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import range from 'lodash/range';

dayjs.extend(isoWeek);

const WEEK_DAY_COUNT = 7;

const getTodaysDate = (): Dayjs => dayjs().startOf('isoWeek');

export interface UseWeekNavigationResult {
  startDate: Dayjs;
  dates: Date[];
  weekStart: string;
  weekEnd: string;
  goToPrevWeek: () => void;
  goToNextWeek: () => void;
  goToToday: () => void;
}

export function useWeekNavigation(): UseWeekNavigationResult {
  const [startDate, setStartDate] = useState<Dayjs>(getTodaysDate());

  const dates = useMemo(
    () => range(WEEK_DAY_COUNT).map((num) => dayjs(startDate).add(num, 'day').toDate()),
    [startDate],
  );

  const weekStart = useMemo(() => startDate.startOf('isoWeek').format('YYYY-MM-DD'), [startDate]);
  const weekEnd = useMemo(() => startDate.endOf('isoWeek').format('YYYY-MM-DD'), [startDate]);

  const goToPrevWeek = (): void => setStartDate((prev) => prev.subtract(7, 'day'));
  const goToNextWeek = (): void => setStartDate((prev) => prev.add(7, 'day'));
  const goToToday = (): void => setStartDate(getTodaysDate());

  return { startDate, dates, weekStart, weekEnd, goToPrevWeek, goToNextWeek, goToToday };
}
