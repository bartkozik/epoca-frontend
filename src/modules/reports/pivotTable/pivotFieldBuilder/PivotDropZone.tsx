import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useDroppable } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { PivotKey } from '../constants';
import type { PivotArea, PivotFieldMove } from '../layout/types';
import styles from './PivotFieldBuilder.module.scss';
import PivotFieldChip from './PivotFieldChip';

interface PivotDropZoneProps {
  area: PivotArea;
  fields: string[];
  valuesCount: number;
  onMove: (move: PivotFieldMove) => unknown;
  destinationIndex: (destination: PivotArea) => number;
  insertionIndex: number | null;
  renderFilterControl?: (field: PivotKey) => ReactNode;
}

function PivotDropZone({
  area,
  destinationIndex,
  fields,
  insertionIndex,
  onMove,
  renderFilterControl,
  valuesCount,
}: PivotDropZoneProps): JSX.Element {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: `area:${area}`, data: { area } });
  const label = t(`pivot_table.areas.${area}`);
  const isPalette = area === 'available';
  const Heading = isPalette ? 'h3' : 'h4';

  return (
    <section
      aria-label={label}
      className={clsx(styles.zone, { [styles.zoneActive]: insertionIndex !== null })}
      ref={setNodeRef}
    >
      <div className={styles.zoneLabel}>
        <Heading className={styles.zoneHeading}>{label}</Heading>
        <p className={styles.instruction}>{t(`pivot_table.areas.${area}_instruction`)}</p>
      </div>
      <SortableContext items={fields.map((field) => `field:${field}`)} strategy={rectSortingStrategy}>
        <ul className={styles.fieldList}>
          {fields.map((field, index) => (
            <PivotFieldChip
              area={area}
              destinationIndex={destinationIndex}
              field={field}
              fieldCount={fields.length}
              hasInsertionBefore={insertionIndex === index}
              index={index}
              isFinalMeasure={area === 'values' && valuesCount === 1}
              key={field}
              onMove={onMove}
              renderFilterControl={renderFilterControl}
            />
          ))}
          {insertionIndex === fields.length && (
            <li aria-hidden="true" className={styles.insertionBar} data-testid="pivot-insertion" />
          )}
          {!isPalette && fields.length === 0 && insertionIndex === null && (
            <li aria-hidden="true" className={styles.emptySlot}>
              {t('pivot_table.areas.drop_here')}
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

export default PivotDropZone;
