import Select from '@/core/theme/select';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { Dayjs } from 'dayjs';
import styles from './DateSelector.module.scss';

export interface MonthSelectorProps {
  selectedMonth: Dayjs;
  minDate: Dayjs;
  maxDate: Dayjs;
  onSelectDate: (date: Dayjs) => void;
  isMonthDisabled?: (date: Dayjs) => boolean;
  onYearChange?: (year: number) => void;
}

const MonthSelector = ({
  selectedMonth,
  minDate,
  maxDate,
  onSelectDate,
  isMonthDisabled,
  onYearChange,
}: MonthSelectorProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  const [year, setYear] = useState(selectedMonth.year());
  const yearId = useId();
  const selectedRef = useRef<HTMLButtonElement>(null);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const years = Array.from({ length: Math.max(0, maxDate.year() - minDate.year() + 1) }, (_, index) => {
    const value = String(maxDate.year() - index);
    return { value, label: value };
  });
  const months = Array.from({ length: 12 }, (_, index) => selectedMonth.startOf('year').year(year).month(index));
  const shortMonth = new Intl.DateTimeFormat(locale, { month: 'short' });
  const fullMonth = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });

  useEffect(() => {
    selectedRef.current?.focus();
  }, []);

  return (
    <div className={clsx(styles.root, styles.monthRoot)}>
      <Select
        name={yearId}
        className={styles.yearSelect}
        label={t('common.date_selector.year')}
        items={years}
        selectedItem={years.find((item) => item.value === String(year))}
        onSelect={(item) => {
          const nextYear = Number(item.value);
          setYear(nextYear);
          onYearChange?.(nextYear);
        }}
      />
      <div className={styles.monthGrid}>
        {months.map((date) => {
          const selected = date.isSame(selectedMonth, 'month');
          const disabled =
            date.isBefore(minDate, 'month') || date.isAfter(maxDate, 'month') || Boolean(isMonthDisabled?.(date));
          return (
            <button
              type="button"
              key={date.month()}
              ref={selected ? selectedRef : undefined}
              className={clsx(styles.day, styles.monthOption, { [styles.selected]: selected })}
              aria-label={fullMonth.format(date.toDate())}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelectDate(date)}
            >
              {shortMonth.format(date.toDate())}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthSelector;
