import Button from '@/core/theme/button';
import DateSelector from '@/core/theme/dateSelector';
import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import { DATE_FORMAT } from '@/core/utils/helpers';
import { KeyBoardEventType, useKeyDown, useOnClickOutside } from '@/core/utils/hooks';
import { ReportDateRange, ReportDateRangeDirection } from '@/modules/reports/filterPanel/reportDateRange';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import styles from './DateRangePicker.module.scss';

const ARROW_RIGHT_ICON = <Icon className={styles.arrowIcon} icon={icons.arrowRight} width={7} height={12} />;
const INPUT_PREFIX = /^(?:From|To|Od|Do):\s*/i;
const EDITABLE_ELEMENT_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

const captureLocalToday = (): Dayjs => dayjs().startOf('day');

const isKeyboardInteractiveElement = (element: Element | null): boolean =>
  element instanceof HTMLElement &&
  (EDITABLE_ELEMENT_TAGS.has(element.tagName) || element.isContentEditable || element.tabIndex >= 0);

dayjs.extend(customParseFormat);

enum ActiveInputType {
  From = 'from',
  To = 'to',
}

interface DateRangePickerProps {
  onCommitDateRange: (range: ReportDateRange, capturedToday: Dayjs) => void;
  onNavigateDateRange: (direction: ReportDateRangeDirection) => void;
  selectedFromDate: Dayjs;
  selectedToDate: Dayjs | null;
}

const DateRangePicker = ({
  onCommitDateRange,
  onNavigateDateRange,
  selectedFromDate,
  selectedToDate,
}: DateRangePickerProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  const formatFromInput = (date: Dayjs): string =>
    t('report.dateRangePicker.input.from_date.value', { date: date.format(DATE_FORMAT.DAY_WITH_DOT) });
  const formatToInput = (date: Dayjs): string =>
    t('report.dateRangePicker.input.to_date.value', { date: date.format(DATE_FORMAT.DAY_WITH_DOT) });
  const [initialEffectiveToDate] = useState(() => selectedToDate ?? captureLocalToday());
  const [activeInput, setActiveInput] = useState<ActiveInputType>();
  const [activeMonth, setActiveMonth] = useState<Dayjs>(selectedFromDate);
  const [fromDate, setFromDate] = useState<Dayjs>(selectedFromDate);
  const [inputValueFrom, setInputValueFrom] = useState(() => formatFromInput(selectedFromDate));
  const [inputValueTo, setInputValueTo] = useState(() => formatToInput(initialEffectiveToDate));
  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [isSelectingHoverStart, setIsSelectingHoverStart] = useState(true);
  const [toDate, setToDate] = useState<Dayjs | null>(initialEffectiveToDate);
  const committedRangeRef = useRef<ReportDateRange>({ fromDate: selectedFromDate, toDate: selectedToDate });
  const isDraftDirtyRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toInputRef = useRef<HTMLInputElement | null>(null);

  committedRangeRef.current = { fromDate: selectedFromDate, toDate: selectedToDate };

  const setDraftDirty = (dirty: boolean): void => {
    isDraftDirtyRef.current = dirty;
    setIsDraftDirty(dirty);
  };

  const restoreCommittedRange = useCallback(
    (capturedToday: Dayjs): void => {
      const committedRange = committedRangeRef.current;
      const effectiveToDate = committedRange.toDate ?? capturedToday;

      setFromDate(committedRange.fromDate);
      setToDate(effectiveToDate);
      setInputValueFrom(formatFromInput(committedRange.fromDate));
      setInputValueTo(formatToInput(effectiveToDate));
      setActiveMonth(committedRange.fromDate);
    },
    [i18n.language],
  );

  const commitDraft = useCallback((): void => {
    if (!isDraftDirtyRef.current) return;

    const capturedToday = captureLocalToday();
    isDraftDirtyRef.current = false;
    setIsDraftDirty(false);

    const isValidRange = fromDate.isValid() && toDate !== null && toDate.isValid() && !fromDate.isAfter(toDate, 'day');

    if (!isValidRange) {
      restoreCommittedRange(capturedToday);
      return;
    }

    const normalizedFromDate = fromDate.startOf('day');
    const normalizedToDate = toDate.startOf('day');

    setFromDate(normalizedFromDate);
    setToDate(normalizedToDate);
    setInputValueFrom(formatFromInput(normalizedFromDate));
    setInputValueTo(formatToInput(normalizedToDate));
    onCommitDateRange({ fromDate: normalizedFromDate, toDate: normalizedToDate }, capturedToday);
  }, [fromDate, i18n.language, onCommitDateRange, restoreCommittedRange, toDate]);

  const closeDateSelector = useCallback((): void => {
    commitDraft();
    setIsDateSelectorOpen(false);
    setActiveInput(undefined);
    setActiveMonth(committedRangeRef.current.fromDate);
  }, [commitDraft]);

  const discardDraftAndCloseDateSelector = useCallback((): void => {
    isDraftDirtyRef.current = false;
    setIsDraftDirty(false);
    restoreCommittedRange(captureLocalToday());
    setIsDateSelectorOpen(false);
    setActiveInput(undefined);
  }, [restoreCommittedRange]);

  useEffect(() => {
    if (isDraftDirtyRef.current) return;
    restoreCommittedRange(captureLocalToday());
  }, [selectedFromDate, selectedToDate, i18n.language, restoreCommittedRange]);

  const handleSelectDate = (date: Dayjs): void => {
    const normalizedDate = date.startOf('day');

    if (activeInput === ActiveInputType.From) {
      setFromDate(normalizedDate);
      setInputValueFrom(formatFromInput(normalizedDate));

      if (!toDate?.isValid() || normalizedDate.isAfter(toDate, 'day')) {
        setToDate(normalizedDate);
        setInputValueTo(formatToInput(normalizedDate));
      }

      setActiveInput(ActiveInputType.To);
      setIsSelectingHoverStart(true);
      toInputRef.current?.focus();
    } else if (activeInput === ActiveInputType.To) {
      if (normalizedDate.isBefore(fromDate, 'day')) {
        setFromDate(normalizedDate);
        setInputValueFrom(formatFromInput(normalizedDate));
      } else {
        setToDate(normalizedDate);
        setInputValueTo(formatToInput(normalizedDate));
      }
    }

    setActiveMonth(normalizedDate);
    setDraftDirty(true);
  };

  const handleSelectMonthDate = (date: Dayjs): void => {
    setActiveMonth(date.startOf('month'));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { name: rawName, value } = event.target;
    const name = rawName as ActiveInputType;
    const parsedDate = dayjs(value.replace(INPUT_PREFIX, ''), DATE_FORMAT.DAY_WITH_DOT, true);

    if (name === ActiveInputType.From) {
      setInputValueFrom(value);
      setFromDate(parsedDate);
      if (parsedDate.isValid()) setActiveMonth(parsedDate.startOf('month'));
    } else if (name === ActiveInputType.To) {
      setInputValueTo(value);
      setToDate(parsedDate.isValid() ? parsedDate : null);
      if (parsedDate.isValid()) setActiveMonth(parsedDate.startOf('month'));
    }

    setDraftDirty(true);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if ((event.key as KeyBoardEventType) !== KeyBoardEventType.ENTER) return;

    event.preventDefault();
    event.stopPropagation();
    commitDraft();
    setIsDateSelectorOpen(false);
    setActiveInput(undefined);
  };

  const resetSelected = (): void => {
    const capturedToday = captureLocalToday();
    const currentMonthStart = capturedToday.startOf('month');
    const currentMonthEnd = capturedToday.endOf('month').startOf('day');

    isDraftDirtyRef.current = false;
    setIsDraftDirty(false);
    setFromDate(currentMonthStart);
    setToDate(currentMonthEnd);
    setInputValueFrom(formatFromInput(currentMonthStart));
    setInputValueTo(formatToInput(currentMonthEnd));
    setActiveMonth(currentMonthStart);
    setActiveInput(undefined);
    setIsDateSelectorOpen(false);
    onCommitDateRange({ fromDate: currentMonthStart, toDate: currentMonthEnd }, capturedToday);
  };

  const handleOnInputClick = (name: ActiveInputType): void => {
    const committedRange = committedRangeRef.current;
    let capturedOpenEnd: Dayjs | null = null;

    if (!isDraftDirtyRef.current && committedRange.toDate === null) {
      capturedOpenEnd = captureLocalToday();
      setToDate(capturedOpenEnd);
      setInputValueTo(formatToInput(capturedOpenEnd));
    }

    setIsDateSelectorOpen(true);
    setActiveInput(name);

    if (name === ActiveInputType.From) {
      setActiveMonth(fromDate.isValid() ? fromDate : committedRangeRef.current.fromDate);
      setIsSelectingHoverStart(false);
    } else {
      const effectiveToDate =
        capturedOpenEnd ?? (toDate?.isValid() ? toDate : (committedRange.toDate ?? captureLocalToday()));
      setActiveMonth(effectiveToDate);
      setIsSelectingHoverStart(true);
    }
  };

  const handleDateSelectorVisibility = (isOpen: boolean): void => {
    if (isOpen) setIsDateSelectorOpen(true);
    else closeDateSelector();
  };

  const handleNavigateDateRange = (direction: ReportDateRangeDirection): void => {
    if (isDateSelectorOpen) discardDraftAndCloseDateSelector();
    onNavigateDateRange(direction);
  };

  const handleKeyboardNavigateDateRange = (direction: ReportDateRangeDirection): void => {
    if (!isDateSelectorOpen && !isKeyboardInteractiveElement(document.activeElement)) onNavigateDateRange(direction);
  };

  useOnClickOutside({
    ref: rootRef,
    handler: closeDateSelector,
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.AR_RIGHT,
    action: () => handleKeyboardNavigateDateRange('next'),
    isListening: true,
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.AR_LEFT,
    action: () => handleKeyboardNavigateDateRange('previous'),
    isListening: true,
  });

  const isPolishLanguage = i18n.language === 'pl';
  const renderToday = captureLocalToday();
  const isResetButton =
    isDraftDirty ||
    !fromDate.isValid() ||
    !fromDate.isSame(renderToday.startOf('month'), 'day') ||
    !toDate?.isValid() ||
    !toDate.isSame(renderToday.endOf('month'), 'day');

  return (
    <div className={styles.root} ref={rootRef}>
      {isResetButton && (
        <Button
          onClick={resetSelected}
          className={clsx(styles.reset, { [styles.resetPl]: isPolishLanguage })}
          label={t('common.reset')}
          variant="text"
          size={isPolishLanguage ? 'small' : 'medium'}
          endIcon={<Icon icon={icons.x} />}
        />
      )}
      <div className={styles.labelContainer}>
        <label className={styles.label}>{t('report.dateRangePicker.text.select_date')}</label>
        <div className={styles.navigation}>
          <Button
            className={styles.monthSelectButton}
            label={t('report.dateRangePicker.button.prev_month.label')}
            startIcon={ARROW_RIGHT_ICON}
            variant="text"
            size="extraSmall"
            onClick={() => handleNavigateDateRange('previous')}
          />
          <Button
            className={styles.monthSelectButton}
            label={t('report.dateRangePicker.button.next_month.label')}
            endIcon={ARROW_RIGHT_ICON}
            variant="text"
            size="extraSmall"
            onClick={() => handleNavigateDateRange('next')}
          />
        </div>
      </div>

      <div>
        <div className={styles.datePickBox}>
          <Input
            autoCompleteOff
            className={styles.dateInput}
            name="from"
            value={inputValueFrom}
            onChange={handleInputChange}
            onClick={() => handleOnInputClick(ActiveInputType.From)}
            onKeyDown={handleInputKeyDown}
            size="small"
          />
          <Input
            ref={toInputRef}
            autoCompleteOff
            className={styles.dateInput}
            name="to"
            value={inputValueTo}
            onChange={handleInputChange}
            onClick={() => handleOnInputClick(ActiveInputType.To)}
            onKeyDown={handleInputKeyDown}
            size="small"
          />
        </div>
        <div className={styles.calendarRelativeContainer}>
          {isDateSelectorOpen && (
            <DateSelector
              hoverDirection={isSelectingHoverStart}
              isDateSelectorOpen={isDateSelectorOpen}
              selectedFromDate={fromDate}
              selectedToDate={toDate}
              onSelectDate={handleSelectDate}
              onSelectMonthByCursor={handleSelectMonthDate}
              selectedMonth={activeMonth}
              setIsDateSelectorOpen={handleDateSelectorVisibility}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
