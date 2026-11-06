import Modal from '@/core/theme/modal';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PivotKey } from '../constants';
import type { PivotFieldMove, PivotLayout } from '../layout/types';
import PivotFieldBuilder from '../pivotFieldBuilder';
import PivotOptions from '../pivotOptions';
import type { PivotOptions as PivotOptionsValue } from '../types';
import styles from './PivotConfigurationModal.module.scss';

interface PivotConfigurationModalProps {
  isFilterPanelOpen?: boolean;
  isOpen: boolean;
  layout: PivotLayout;
  onClose: () => void;
  onMove: (move: PivotFieldMove) => unknown;
  onOptionChange: (key: keyof PivotOptionsValue, value: boolean) => unknown;
  renderFilterControl: (key: PivotKey) => JSX.Element | null;
}

function PivotConfigurationModal({
  isFilterPanelOpen = false,
  isOpen,
  layout,
  onClose,
  onMove,
  onOptionChange,
  renderFilterControl,
}: PivotConfigurationModalProps): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleClose = useCallback(() => {
    setIsDragging(false);
    onClose();
  }, [onClose]);

  return (
    <Modal
      ariaLabelledBy={headingId}
      className={styles.modal}
      close={handleClose}
      disableClickOutside={isFilterPanelOpen || isDragging}
      disableEscapeClickClose={isFilterPanelOpen || isDragging}
      isOpen={isOpen}
      overlayClassName={styles.overlay}
    >
      <section className={styles.root}>
        <header className={styles.header}>
          <h2 id={headingId}>{t('pivot_table.configurator.heading')}</h2>
          <p>
            {t('pivot_table.configurator.summary', {
              rows: layout.rows.length,
              columns: layout.columns.length,
              values: layout.values.length,
              filters: layout.filters.length,
            })}
          </p>
        </header>
        <div className={styles.body}>
          <PivotFieldBuilder
            layout={layout}
            onDraggingChange={setIsDragging}
            onMove={onMove}
            renderFilterControl={renderFilterControl}
          />
          <PivotOptions onChange={onOptionChange} options={layout.options} />
        </div>
      </section>
    </Modal>
  );
}

export default PivotConfigurationModal;
