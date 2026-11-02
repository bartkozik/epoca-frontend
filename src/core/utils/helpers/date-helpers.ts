import dayjs from 'dayjs';
import { DATE_FORMAT, DAYJS_UNIT } from './format-date';

export function isSameWeek(date: string, dateToCompare: Date): boolean {
  const first = dayjs(date);
  const second = dayjs(dateToCompare);

  return first.isoWeek() === second.isoWeek() && first.isoWeekYear() === second.isoWeekYear();
}

export function isTodayDate(date: Date): boolean {
  return dayjs(date).isToday();
}

export function isDateAfterToday(date: Date): boolean {
  return dayjs(date).isAfter(dayjs(), DAYJS_UNIT.DAY);
}

export function formatDateDay(date: Date): string {
  return dayjs(date).format(DATE_FORMAT.DAY);
}

export function formatDateWeekday(date: Date): string {
  return dayjs(date).format(DATE_FORMAT.FULL_DAY);
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return dayjs(date1).isSame(dayjs(date2), DAYJS_UNIT.DAY);
}
