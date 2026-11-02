import { convertTimeFormat } from '@/core/utils/helpers';
import { Unit } from '@/modules/workingTime/types';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { calculateClientHoursForWeek, calculateUnitsWeeklyReportedHours } from '../unitCalculations';
import styles from './WeeklyHoursBar.module.scss';

interface WeeklyHoursBarProps {
  units: Unit[];
  loadingUnits: boolean;
}

const WeeklyHoursBar = ({ units, loadingUnits }: WeeklyHoursBarProps): JSX.Element => {
  const { t } = useTranslation();
  const clientHoursInReportedUnits = calculateClientHoursForWeek(units);
  const unitsWeeklyReportedHours = calculateUnitsWeeklyReportedHours(units);

  const clientBars = Object.entries(clientHoursInReportedUnits).map(([clientName, data], index) => {
    const width = unitsWeeklyReportedHours > 0 ? (data.hours / unitsWeeklyReportedHours) * 100 : 0;

    const formattedHours = convertTimeFormat({
      time: data.hours,
      fractionalHour: true,
      includeColons: true,
    });

    return (
      <div
        className={styles.barInfoText}
        key={index}
        style={{
          width: `${width}%`,
          backgroundColor: data.color,
          borderRadius: '4px',
          height: '22px',
          minWidth: '20px',
        }}
      >
        <div className={styles.icon}>{t('common.information_short')}</div>

        <p>
          {t('working_time.weekly_hours_bar.text.client_hours', {
            clientName: clientName,
            hours: formattedHours,
          })}
        </p>
      </div>
    );
  });

  return (
    <div className={styles.root}>
      <div className={styles.hoursBarContainer}>
        <div className={clsx(styles.currentHoursInfo, { [styles.noWeeklyHours]: unitsWeeklyReportedHours === 0 })}>
          {t('working_time.weekly_hours_bar.title.client_hours')}
        </div>
        <div className={styles.hoursBar}>{loadingUnits ? <div /> : clientBars}</div>
      </div>
      <div className={styles.hoursSumup}>
        {loadingUnits
          ? '--:--'
          : convertTimeFormat({ time: unitsWeeklyReportedHours, fractionalHour: true, includeColons: true })}
      </div>
    </div>
  );
};

export default WeeklyHoursBar;
