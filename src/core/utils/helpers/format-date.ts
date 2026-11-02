import dayjs from 'dayjs';

export const DATE_FORMAT = {
  DAY_BE_FORMAT: 'YYYY-MM-DD',
  DAY_WITH_DOT: 'DD.MM.YYYY',
  DAY: 'D',
  FULL_DAY: 'dddd',
  MONTH_YEAR: 'MMMM YYYY',
};

export enum DAYJS_UNIT {
  DAY = 'day',
}

export const formatDate = (date: string | Date, format?: string): string => {
  const fmt = format || DATE_FORMAT.DAY_WITH_DOT;
  return dayjs(date).format(fmt);
};
