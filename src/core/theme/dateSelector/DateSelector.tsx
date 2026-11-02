import { TimeUnit } from '@/core/models/types';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import { DATE_FORMAT } from '@/core/utils/helpers';
import { useDateSelectorNavigation } from '@/core/utils/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs, { Dayjs } from 'dayjs';
import styles from './DateSelector.module.scss';
import MonthSelector, { type MonthSelectorProps } from './MonthSelector';

const ARROW_RIGHT_ICON = <Icon icon={icons.arrowRight} width={7} height={12} />;

const FILLER_DAYS_COUNT = 6;

type DaySelectorProps = {
  hoverDirection: boolean;
  isDateSelectorOpen: boolean;
  selectedMonth: Dayjs | null;
  selectedFromDate?: Dayjs | null;
  selectedToDate?: Dayjs | null;
  selectedSingleDay?: Dayjs | null;
  setIsDateSelectorOpen: (isOpen: boolean) => void;
  maxDate?: Dayjs;
  onSelectDate: (date: Dayjs) => void;
  onSelectMonthByCursor?: (date: Dayjs) => void;
};

export interface DayInfo {
  date: Dayjs;
  isCurrentMonth: boolean;
  isFromRowEnd: boolean;
  isSelectedFrom: boolean;
  isSelectedTo: boolean;
  isSingleDaySelected: boolean;
  isInRange: boolean;
  isHoveredInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isSunday: boolean;
}

const DaySelector = ({
  hoverDirection,
  isDateSelectorOpen,
  selectedMonth,
  selectedFromDate,
  selectedToDate,
  selectedSingleDay,
  setIsDateSelectorOpen,
  maxDate,
  onSelectDate,
  onSelectMonthByCursor,
}: DaySelectorProps): JSX.Element => {
  const { t, i18n } = useTranslation();

  const [currentMonth, setCurrentMonth] = useState<Dayjs>(selectedMonth || dayjs());
  const [hoveredDate, setHoveredDate] = useState<Dayjs | null>(null);
  const dateSelectorRef = useRef<HTMLDivElement | null>(null);
  const daysRefs = useRef<(HTMLDivElement | null)[]>([]);
  const WEEK_DAYS = [
    t('common.week_day_short.mo'),
    t('common.week_day_short.tu'),
    t('common.week_day_short.we'),
    t('common.week_day_short.th'),
    t('common.week_day_short.fr'),
    t('common.week_day_short.sa'),
    t('common.week_day_short.su'),
  ];

  const handleChangeToPrevious = (unit: TimeUnit.Month | TimeUnit.Year): void => {
    const newMonth = currentMonth.subtract(1, unit);
    onSelectMonthByCursor && onSelectMonthByCursor(newMonth);
    setCurrentMonth(newMonth);
  };

  const handleChangeToNext = (unit: TimeUnit.Month | TimeUnit.Year): void => {
    const newMonth = currentMonth.add(1, unit);
    onSelectMonthByCursor && onSelectMonthByCursor(newMonth);
    setCurrentMonth(newMonth);
  };

  const previousMonth = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    handleChangeToPrevious(TimeUnit.Month);
  };

  const nextMonth = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    handleChangeToNext(TimeUnit.Month);
  };

  useEffect(() => {
    if (!selectedMonth) return;
    selectedMonth.isValid() && setCurrentMonth(selectedMonth);
  }, [selectedMonth]);

  const isDayInRange = (day: Dayjs): boolean => {
    const startDateHover = hoveredDate ? day.isAfter(hoveredDate) && day.isBefore(selectedToDate) : false;
    const endDateHover = hoveredDate ? day.isAfter(selectedFromDate) && day.isBefore(hoveredDate) : false;

    if (selectedFromDate && !selectedToDate) return false;
    else if (!selectedFromDate && selectedToDate) return startDateHover;
    else if (selectedFromDate && selectedToDate) {
      if (hoverDirection) return endDateHover;
      else return startDateHover;
    }
    return false;
  };

  const daysInMonth = (month: Dayjs): DayInfo[] => {
    const startDay = month.startOf('month');
    const endDay = month.endOf('month');
    const days: DayInfo[] = [];

    for (let i = 0; i <= endDay.diff(startDay, 'day'); i++) {
      const day = startDay.add(i, 'day');
      const isSelectedFrom = !!selectedFromDate && day.isSame(selectedFromDate, 'day');
      const isSelectedTo = !!selectedToDate && day.isSame(selectedToDate, 'day');
      const isSingleDaySelected = !!selectedSingleDay && day.isSame(selectedSingleDay, 'day');

      const isBothSelected = !!selectedFromDate && !!selectedToDate;
      const isFromToDateSameDate = selectedFromDate && selectedFromDate.isSame(selectedToDate, 'day');

      const isFromRowEnd =
        !isFromToDateSameDate && selectedFromDate
          ? day.isSame(selectedFromDate, 'day') &&
            (day.day() % 7 === 0 || day.isSame(selectedFromDate.endOf('month'), 'day'))
          : false;

      const isRangeStart =
        isSelectedFrom && isBothSelected && !isFromToDateSameDate && selectedFromDate.isBefore(selectedToDate, 'day');
      const isRangeEnd = isSelectedTo && isBothSelected && !isFromToDateSameDate;

      const isInRange = isBothSelected && day.isAfter(selectedFromDate, 'day') && day.isBefore(selectedToDate, 'day');
      const isSunday = day.day() === 0;

      days.push({
        date: day,
        isCurrentMonth: day.month() === currentMonth.month(),
        isFromRowEnd,
        isSelectedFrom,
        isSelectedTo,
        isSingleDaySelected,
        isInRange,
        isHoveredInRange: isDayInRange(day),
        isRangeStart,
        isRangeEnd,
        isSunday,
      });
    }
    return days;
  };

  const selectDateOnEnter = (selectedDayIndex: number): void => {
    if (highlightedDayIndex >= 0 && highlightedDayIndex < daysRefs.current.length) {
      daysRefs.current[highlightedDayIndex]?.click();
    }
  };

  const days = daysInMonth(currentMonth);

  const { highlightedDayIndex } = useDateSelectorNavigation({
    currentMonth,
    days,
    showCalendar: isDateSelectorOpen,
    setShowCalendar: setIsDateSelectorOpen,
    onDaySelect: selectDateOnEnter,
    isListening: isDateSelectorOpen,
    handleChangeToNext,
    handleChangeToPrevious,
    daysRefs,
  });

  const monthAndYear = useMemo(
    () => dayjs(currentMonth).locale(i18n.language).format(DATE_FORMAT.MONTH_YEAR),
    [i18n.language, currentMonth],
  );

  const handleSelectDate = (date: dayjs.Dayjs): void => {
    onSelectDate(date);
    if (date.month() !== currentMonth.month() || date.year() !== currentMonth.year()) setCurrentMonth(date);
  };

  const generateEmptyDays = (count: number): JSX.Element[] => {
    return Array.from({ length: count }, (_, i) => <div key={i} className={styles.emptyDay}></div>);
  };

  const firstDayOfMonth = currentMonth.startOf('month').day();
  const emptyDaysCount = firstDayOfMonth === 0 ? FILLER_DAYS_COUNT : firstDayOfMonth - 1;
  const emptyDays = generateEmptyDays(emptyDaysCount);

  return (
    <div className={styles.root} ref={dateSelectorRef} tabIndex={1}>
      <div className={styles.header}>
        <span className={styles.monthLabel}>{monthAndYear}</span>
        <div className={styles.navigation}>
          <IconButton className={styles.arrowButton} icon={ARROW_RIGHT_ICON} variant="raw" onClick={previousMonth} />
          <IconButton
            className={styles.arrowButton}
            icon={ARROW_RIGHT_ICON}
            variant="raw"
            onClick={nextMonth}
            disabled={maxDate && maxDate?.month() === currentMonth.month()}
          />
        </div>
      </div>
      <div className={styles.weekDays}>
        {WEEK_DAYS.map((day) => (
          <div key={day} className={styles.weekDay}>
            {day}
          </div>
        ))}
      </div>
      <div className={styles.calendar}>
        {emptyDays}
        {days.map((day, index) => (
          <div
            key={index}
            tabIndex={1}
            className={clsx(
              styles.day,
              { [styles.selected]: day.isSelectedFrom || day.isSelectedTo || day.isSingleDaySelected },
              { [styles.inRangeHovered]: isDayInRange(day.date) },
              { [styles.disabled]: maxDate && day.date > maxDate },
              { [styles.highlightedDay]: index === highlightedDayIndex },
            )}
            onClick={() => handleSelectDate(day.date)}
            onMouseEnter={() => setHoveredDate(day.date)}
            onMouseLeave={() => setHoveredDate(null)}
            ref={(el) => (daysRefs.current[index] = el)}
          >
            <div
              className={clsx(
                { [styles.inRange]: day.isInRange },
                { [styles.rangeStart]: day.isRangeStart },
                { [styles.rangeStartIsLastRowDay]: day.isFromRowEnd },
                { [styles.rangeEnd]: day.isRangeEnd },
                { [styles.sundayInRange]: day.isSunday && day.isInRange },
              )}
            ></div>
            <div
              className={clsx(
                styles.day,
                {
                  [styles.selected]: day.isSelectedFrom || day.isSelectedTo || day.isSingleDaySelected,
                },
                { [styles.numberInRange]: day.isInRange },
              )}
            >
              {day.date.date()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

type DateSelectorProps = DaySelectorProps | (MonthSelectorProps & { selectionMode: 'month' });

const DateSelector = (props: DateSelectorProps): JSX.Element => {
  if ('selectionMode' in props) {
    return <MonthSelector {...props} />;
  }
  return <DaySelector {...props} />;
};

export default DateSelector;
