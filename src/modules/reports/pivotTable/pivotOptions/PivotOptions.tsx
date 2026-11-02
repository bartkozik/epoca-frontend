import Toggle from '@/core/theme/toggle';
import { useTranslation } from 'react-i18next';
import type { PivotOptions as PivotOptionsValue } from '../types';
import styles from './PivotOptions.module.scss';

interface PivotOptionsProps {
  onChange: (key: keyof PivotOptionsValue, value: boolean) => unknown;
  options: PivotOptionsValue;
}

const OPTION_KEYS = ['rowSubtotals', 'columnSubtotals', 'grandTotals'] as const;

function PivotOptions({ onChange, options }: PivotOptionsProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <section aria-label={t('pivot_table.options.heading')} className={styles.options}>
      <h3>{t('pivot_table.options.heading')}</h3>
      <div className={styles.toggles}>
        {OPTION_KEYS.map((key) => (
          <Toggle
            isChecked={options[key]}
            key={key}
            label={t(`pivot_table.options.${key}`)}
            onClick={() => void onChange(key, !options[key])}
            withLabelAsStatus
          />
        ))}
      </div>
    </section>
  );
}

export default PivotOptions;
