import { useTranslation } from 'react-i18next';
import type { PivotKey } from '../constants';
import styles from './PivotShapeSelect.module.scss';
import type { PivotShapeOption } from './usePivotShapeURL';

const CUSTOM = 'custom';

interface PivotShapeSelectProps {
  options: PivotShapeOption[];
  selectedURL: string | null;
  onSelect: (url: string) => void;
}

function PivotShapeSelect({ options, selectedURL, onSelect }: PivotShapeSelectProps): JSX.Element {
  const { t } = useTranslation();
  const nameOf = ({ levels, columns }: PivotShapeOption): string => {
    const levelName = (key: PivotKey): string => t(`pivot_table.shapes.levels.${key}`);
    const rows = levels.map(levelName).join(' → ');
    const name = columns.length > 0 ? `${rows} × ${columns.map(levelName).join(', ')}` : rows;
    return name.charAt(0).toLocaleUpperCase() + name.slice(1);
  };

  return (
    <select
      aria-label={t('pivot_table.shapes.label')}
      className={styles.select}
      onChange={(event) => {
        if (event.target.value !== CUSTOM) onSelect(event.target.value);
      }}
      value={selectedURL ?? CUSTOM}
    >
      {selectedURL === null && (
        <option disabled value={CUSTOM}>
          {t('pivot_table.shapes.custom')}
        </option>
      )}
      {options.map((option) => (
        <option key={option.url} value={option.url}>
          {nameOf(option)}
        </option>
      ))}
    </select>
  );
}

export default PivotShapeSelect;
