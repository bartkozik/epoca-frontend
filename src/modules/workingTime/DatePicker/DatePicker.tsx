import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import { KeyBoardEventType, useKeyDown } from '@/core/utils/hooks';
import { useUnitWorkspace } from '@/modules/workingTime/UnitWorkspaceProvider';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs from 'dayjs';
import styles from './DatePicker.module.scss';

const ARROW_RIGHT_ICON = <Icon icon={icons.arrowRight} width={7} height={12} />;

interface DatePickerProps {
  dates: Date[];
  goToPrevWeek: () => void;
  goToNextWeek: () => void;
  goToToday: () => void;
}

function DatePicker({ dates, goToPrevWeek, goToNextWeek, goToToday }: DatePickerProps): JSX.Element {
  const { t } = useTranslation();
  const { modalConfig } = useUnitWorkspace();

  const [isDateHovered, setIsDateHovered] = useState(false);

  const weekTitle = `${dayjs(dates[0]).format('D MMM')} - ${dayjs(dates[dates.length - 1]).format('D MMM')}`;

  const handleDateHover = (): void => {
    setIsDateHovered(!isDateHovered);
  };

  const handleDateChangeForPrevious = (): void => {
    goToPrevWeek();
  };

  const handleDateChangeForNext = (): void => {
    goToNextWeek();
  };

  const handleDateChangeForToday = (): void => {
    goToToday();
  };

  useKeyDown({
    keyboardEventType: KeyBoardEventType.AR_RIGHT,
    action: handleDateChangeForNext,
    isListening: !modalConfig.isOpen,
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.AR_LEFT,
    action: handleDateChangeForPrevious,
    isListening: !modalConfig.isOpen,
  });

  return (
    <div className={styles.datePicker}>
      <IconButton
        className={styles.arrowButton}
        icon={ARROW_RIGHT_ICON}
        onClick={handleDateChangeForPrevious}
        size="medium"
        variant="outlined"
      />
      <button
        className={styles.dateButton}
        onClick={handleDateChangeForToday}
        onMouseEnter={handleDateHover}
        onMouseLeave={handleDateHover}
      >
        <span className={clsx(styles.dateButtonText, { [styles.dateButtonTextActive]: !isDateHovered })}>
          {weekTitle}
        </span>
        <span className={clsx(styles.dateButtonText, { [styles.dateButtonTextActive]: isDateHovered })}>
          {t('working_time.date_picker.button.show_today.label')}
        </span>
      </button>
      <IconButton
        className={styles.arrowButton}
        icon={ARROW_RIGHT_ICON}
        onClick={handleDateChangeForNext}
        size="medium"
        variant="outlined"
      />
    </div>
  );
}

export default DatePicker;
