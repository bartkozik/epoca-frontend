import Icon, { icons } from '@/core/theme/icon';
import { WorkUnitEntryType } from '@/modules/workingTime/types';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './EntryTypeSelector.module.scss';

interface EntryTypeSelectorProps {
  label: string;
  onChange: (entryType: WorkUnitEntryType) => void;
  value: WorkUnitEntryType;
}

const EntryTypeSelector = ({ label, onChange, value }: EntryTypeSelectorProps): JSX.Element => {
  const { t } = useTranslation();
  const labelId = useId();

  return (
    <div className={styles.root}>
      <span className={styles.label} id={labelId}>
        {label}
      </span>
      <div aria-labelledby={labelId} className={styles.options} role="group">
        {Object.values(WorkUnitEntryType).map((entryType) => {
          const isSelected = value === entryType;
          const icon = entryType === WorkUnitEntryType.Worklog ? icons.clock : icons.file;

          return (
            <button
              aria-pressed={isSelected}
              className={clsx(styles.option, { [styles.selected]: isSelected })}
              key={entryType}
              onClick={() => onChange(entryType)}
              type="button"
            >
              <span aria-hidden="true" className={styles.icon}>
                <Icon height={16} icon={icon} width={16} />
              </span>
              {t(`working_time.entry_type.${entryType.toLowerCase()}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EntryTypeSelector;
