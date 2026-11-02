import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PIVOT_VALUE, type PivotKey } from '../constants';
import type { PivotArea, PivotFieldMove } from '../layout/types';
import { dimensions, getFieldLabelKey } from './getFieldLabelKey';
import PivotDragHandle from './PivotDragHandle';
import styles from './PivotFieldBuilder.module.scss';

interface PivotFieldChipProps {
  area: PivotArea;
  field: string;
  fieldCount: number;
  index: number;
  isFinalMeasure: boolean;
  onMove: (move: PivotFieldMove) => unknown;
  destinationIndex: (destination: PivotArea) => number;
  hasInsertionBefore: boolean;
  renderFilterControl?: (field: PivotKey) => ReactNode;
}

const measures = new Set<string>(Object.values(PIVOT_VALUE));

const destinationsFor = (field: string): PivotArea[] =>
  measures.has(field) ? ['available', 'values'] : ['available', 'rows', 'columns', 'filters'];

function PivotFieldChip({
  area,
  destinationIndex,
  field,
  fieldCount,
  hasInsertionBefore,
  index,
  isFinalMeasure,
  onMove,
  renderFilterControl,
}: PivotFieldChipProps): JSX.Element {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const chipSlotRef = useRef<HTMLLIElement>(null);
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    id: `field:${field}`,
    data: { area, field, index },
  });
  const label = t(getFieldLabelKey(field));

  const move = (destination: PivotArea): void => {
    setIsMenuOpen(false);
    void onMove({ field, destination, index: destinationIndex(destination) });
  };
  const reorder = (nextIndex: number): void => {
    setIsMenuOpen(false);
    void onMove({ field, destination: area, index: nextIndex });
  };

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsidePointer = ({ target }: PointerEvent): void => {
      if (target instanceof Node && !chipSlotRef.current?.contains(target)) setIsMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isMenuOpen]);

  return (
    <li className={styles.chipSlot} ref={chipSlotRef}>
      {hasInsertionBefore && <div aria-hidden="true" className={styles.insertionBar} data-testid="pivot-insertion" />}
      <div
        className={clsx(styles.chip, { [styles.dragging]: isDragging })}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <button
          {...attributes}
          {...listeners}
          aria-label={t('pivot_table.field.drag', { field: label })}
          className={styles.dragSurface}
          ref={setActivatorNodeRef}
          title={label}
          type="button"
        >
          <PivotDragHandle />
          <span className={styles.chipLabel}>{label}</span>
        </button>
        {area === 'filters' && dimensions.has(field) && renderFilterControl?.(field as PivotKey)}
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label={t('pivot_table.field.menu', { field: label })}
          className={styles.chipAction}
          onClick={() => setIsMenuOpen((open) => !open)}
          type="button"
        >
          ⋯
        </button>
        {isMenuOpen && (
          <div aria-label={t('pivot_table.field.menu', { field: label })} className={styles.menu} role="menu">
            {destinationsFor(field).map((destination) => (
              <button
                className={styles.menuItem}
                disabled={destination === area}
                key={destination}
                onClick={() => move(destination)}
                role="menuitem"
                type="button"
              >
                {t(`pivot_table.areas.${destination}`)}
              </button>
            ))}
            {area !== 'available' && (
              <>
                <button
                  className={styles.menuItem}
                  disabled={index === 0}
                  onClick={() => reorder(index - 1)}
                  role="menuitem"
                  type="button"
                >
                  {t('pivot_table.field.move_earlier')}
                </button>
                <button
                  className={styles.menuItem}
                  disabled={index === fieldCount - 1}
                  onClick={() => reorder(index + 1)}
                  role="menuitem"
                  type="button"
                >
                  {t('pivot_table.field.move_later')}
                </button>
              </>
            )}
          </div>
        )}
        {area !== 'available' && (
          <button
            aria-label={t('pivot_table.field.remove', { field: label })}
            className={styles.chipAction}
            disabled={isFinalMeasure}
            onClick={() => move('available')}
            type="button"
          >
            ×
          </button>
        )}
      </div>
    </li>
  );
}

export default PivotFieldChip;
