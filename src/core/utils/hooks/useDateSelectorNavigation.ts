import { TimeUnit } from '@/core/models/types';
import { DayInfo } from '@/core/theme/dateSelector/DateSelector';
import { MutableRefObject, useEffect, useState } from 'react';
import { Dayjs } from 'dayjs';

interface UseDateSelectorNavigationProps {
  showCalendar: boolean;
  setShowCalendar: (value: boolean) => void;
  onDaySelect: (selectedDayIndex: number) => void;
  isListening: boolean;
  currentMonth: Dayjs | null;
  days: DayInfo[];
  handleChangeToNext: (unit: TimeUnit.Month | TimeUnit.Year) => void;
  handleChangeToPrevious: (unit: TimeUnit.Month | TimeUnit.Year) => void;
  daysRefs: MutableRefObject<(HTMLDivElement | null)[]>;
}

interface UseDateSelectorNavigationReturn {
  highlightedDayIndex: number;
}

export const useDateSelectorNavigation = ({
  currentMonth,
  days,
  daysRefs,
  handleChangeToNext,
  handleChangeToPrevious,
  setShowCalendar,
  onDaySelect,
  isListening,
}: UseDateSelectorNavigationProps): UseDateSelectorNavigationReturn => {
  const [highlightedDayIndex, setHighlightedDayIndex] = useState(-1);

  const handleChangeDayToNext = (unit: TimeUnit): void => {
    if (!currentMonth) return;
    const daysIndexCount = days.length - 1;
    const lastWeek = daysIndexCount - 7;

    if (highlightedDayIndex === -1) {
      setHighlightedDayIndex(0);
    } else if (unit === TimeUnit.Day && highlightedDayIndex === days.length - 1) {
      handleChangeToNext(TimeUnit.Month);
      setHighlightedDayIndex(0);
    } else if (unit === TimeUnit.Week && highlightedDayIndex >= lastWeek) {
      const daysToNextMonth = daysIndexCount - highlightedDayIndex;
      const nextWeekDayIndex = 6 - daysToNextMonth;
      setHighlightedDayIndex(nextWeekDayIndex);
      handleChangeToNext(TimeUnit.Month);
    } else if (unit === TimeUnit.Month) {
      handleChangeToNext(TimeUnit.Month);
    } else if (unit === TimeUnit.Year) {
      handleChangeToNext(TimeUnit.Year);
    } else {
      const addDaysCount = unit === TimeUnit.Week ? 7 : 1;
      setHighlightedDayIndex((prev) => prev + addDaysCount);
    }
  };

  const handleChangeDayToPrevious = (unit: TimeUnit): void => {
    if (!currentMonth) return;

    if (highlightedDayIndex === -1) {
      setHighlightedDayIndex(days.length - 1);
    } else if (unit === TimeUnit.Day && highlightedDayIndex === 0) {
      const lastDayOfPreviousMonth = currentMonth.subtract(1, 'month').endOf('month');
      const lastDayIndex = lastDayOfPreviousMonth.date() - 1;
      handleChangeToPrevious(TimeUnit.Month);
      setHighlightedDayIndex(lastDayIndex);
    } else if (unit === TimeUnit.Week && highlightedDayIndex < 7) {
      const daysFromPrevMonth = 7 - highlightedDayIndex;
      const lastDayOfPreviousMonth = currentMonth.subtract(1, 'month').endOf('month');
      const lastDayIndex = lastDayOfPreviousMonth.date() - daysFromPrevMonth;
      handleChangeToPrevious(TimeUnit.Month);
      setHighlightedDayIndex(lastDayIndex);
    } else if (unit === TimeUnit.Month) {
      handleChangeToPrevious(TimeUnit.Month);
    } else if (unit === TimeUnit.Year) {
      handleChangeToPrevious(TimeUnit.Year);
    } else {
      const addDaysCount = unit === TimeUnit.Week ? 7 : 1;
      setHighlightedDayIndex((prev) => prev - addDaysCount);
    }
  };

  const handleChangeToFirstMonthDay = (): void => {
    setHighlightedDayIndex(0);
  };

  const handleChangeToLastMonthDay = (): void => {
    setHighlightedDayIndex(days.length - 1);
  };

  useEffect(() => {
    daysRefs.current[highlightedDayIndex]?.focus();
  }, [highlightedDayIndex]);

  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          handleChangeDayToNext(TimeUnit.Week);
          break;
        case 'ArrowUp':
          event.preventDefault();
          handleChangeDayToPrevious(TimeUnit.Week);
          break;
        case 'Enter':
          if (highlightedDayIndex === -1) return;
          onDaySelect(highlightedDayIndex);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          handleChangeDayToPrevious(TimeUnit.Day);
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleChangeDayToNext(TimeUnit.Day);
          break;
        case 'Escape':
          event.preventDefault();
          setShowCalendar(false);
          break;
        case 'Home':
          event.preventDefault();
          handleChangeToFirstMonthDay();
          break;
        case 'End':
          event.preventDefault();
          handleChangeToLastMonthDay();
          break;
        case 'PageUp':
          event.preventDefault();
          if (event.shiftKey) {
            handleChangeDayToPrevious(TimeUnit.Year);
          } else {
            handleChangeDayToPrevious(TimeUnit.Month);
          }
          break;
        case 'PageDown':
          event.preventDefault();
          if (event.shiftKey) {
            handleChangeDayToNext(TimeUnit.Year);
          } else {
            handleChangeDayToNext(TimeUnit.Month);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown as EventListener);
    return () => {
      document.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [
    isListening,
    handleChangeDayToNext,
    handleChangeDayToPrevious,
    highlightedDayIndex,
    onDaySelect,
    setShowCalendar,
  ]);

  return { highlightedDayIndex };
};
