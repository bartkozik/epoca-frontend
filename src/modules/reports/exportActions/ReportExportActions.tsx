import Button from '@/core/theme/button';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './ReportExportActions.module.scss';

export interface ReportExportActionsProps {
  className?: string;
  label?: string;
  csvLoading: boolean;
  disabled: boolean;
  onCsv: () => void;
  onXlsx: () => void;
  xlsxLoading: boolean;
}

function ReportExportActions({
  className,
  label,
  csvLoading,
  disabled,
  onCsv,
  onXlsx,
  xlsxLoading,
}: ReportExportActionsProps): JSX.Element {
  const { t } = useTranslation();
  const xlsxLabel = t('report.report_board.button.xls.label');
  const csvLabel = t('report.report_board.button.csv.label');

  return (
    <div className={clsx(styles.container, className)} data-testid="report-export-actions">
      <span className={styles.text}>{label ?? t('report.report_board.text.download_report')}</span>
      <Button
        aria-label={xlsxLabel}
        loading={xlsxLoading}
        disabled={disabled || xlsxLoading}
        className={styles.button}
        label={xlsxLabel}
        variant="contained"
        size="medium"
        onClick={onXlsx}
      />
      <Button
        aria-label={csvLabel}
        loading={csvLoading}
        disabled={disabled || csvLoading}
        className={styles.button}
        label={csvLabel}
        variant="contained"
        size="medium"
        onClick={onCsv}
      />
    </div>
  );
}

export default ReportExportActions;
