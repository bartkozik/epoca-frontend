import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  closestCenter,
  DndContext,
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { PIVOT_KEY, PIVOT_VALUE, type PivotKey } from '../constants';
import { getAvailableDimensions, getAvailableMeasures, getFieldArea } from '../layout/pivotLayout';
import type { PivotArea, PivotFieldMove, PivotLayout } from '../layout/types';
import { getFieldLabelKey } from './getFieldLabelKey';
import PivotDropZone from './PivotDropZone';
import styles from './PivotFieldBuilder.module.scss';

interface PivotFieldBuilderProps {
  layout: PivotLayout;
  onDraggingChange?: (isDragging: boolean) => void;
  onMove: (move: PivotFieldMove) => unknown;
  renderFilterControl?: (field: PivotKey) => ReactNode;
}

interface DropTarget {
  area: PivotArea;
  index: number;
}

const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCenter(args);
};

const ALL_FIELDS = new Set<string>([...Object.values(PIVOT_KEY), ...Object.values(PIVOT_VALUE)]);

const fieldFromId = (id: string | number): string | null => {
  const value = id.toString();
  if (!value.startsWith('field:')) return null;
  const field = value.slice('field:'.length);
  return ALL_FIELDS.has(field) ? field : null;
};

const areaFromId = (id: string | number): PivotArea | null => {
  const value = id.toString();
  if (!value.startsWith('area:')) return null;
  const area = value.slice('area:'.length);
  return ['available', 'rows', 'columns', 'values', 'filters'].includes(area) ? (area as PivotArea) : null;
};

const areaFields = (layout: PivotLayout, area: PivotArea): string[] => {
  if (area === 'available') return [...getAvailableDimensions(layout), ...getAvailableMeasures(layout)];
  if (area === 'rows') return layout.rows;
  if (area === 'columns') return layout.columns;
  if (area === 'values') return layout.values;
  return layout.filters.map(({ key }) => key);
};

const accepts = (field: string, area: PivotArea): boolean => {
  const isMeasure = Object.values(PIVOT_VALUE).some((value) => value === field);
  return isMeasure ? area === 'available' || area === 'values' : area !== 'values';
};

function PivotFieldBuilder({
  layout,
  onDraggingChange,
  onMove,
  renderFilterControl,
}: PivotFieldBuilderProps): JSX.Element {
  const { t } = useTranslation();
  const [activeField, setActiveField] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const fieldsByArea = useMemo(
    () => ({
      available: areaFields(layout, 'available'),
      rows: areaFields(layout, 'rows'),
      columns: areaFields(layout, 'columns'),
      values: areaFields(layout, 'values'),
      filters: areaFields(layout, 'filters'),
    }),
    [layout],
  );

  const destinationIndex = (destination: PivotArea): number => fieldsByArea[destination].length;

  const getDropTarget = (field: string, overId: string | number): DropTarget | null => {
    const overField = fieldFromId(overId);
    const area = overField ? getFieldArea(layout, overField) : areaFromId(overId);
    if (!area || !accepts(field, area) || overField === field) return null;
    const index = overField ? fieldsByArea[area].indexOf(overField) : destinationIndex(area);
    return index < 0 ? null : { area, index };
  };

  const clearDrag = (): void => {
    setActiveField(null);
    setDropTarget(null);
    onDraggingChange?.(false);
  };
  const handleDragStart = ({ active }: DragStartEvent): void => {
    const field = fieldFromId(active.id);
    setActiveField(field);
    setAnnouncement(field ? t('pivot_table.drag.picked_up', { field: t(getFieldLabelKey(field)) }) : '');
    onDraggingChange?.(true);
  };
  const handleDragOver = ({ active, over }: DragOverEvent): void => {
    const field = fieldFromId(active.id);
    const target = field && over ? getDropTarget(field, over.id) : null;
    setDropTarget(target);
    if (field && target) {
      setAnnouncement(
        t('pivot_table.drag.destination', {
          area: t(`pivot_table.areas.${target.area}`),
          field: t(getFieldLabelKey(field)),
          position: target.index + 1,
        }),
      );
    }
  };
  const handleDragCancel = (_event?: DragCancelEvent): void => {
    if (activeField) {
      setAnnouncement(t('pivot_table.drag.cancelled', { field: t(getFieldLabelKey(activeField)) }));
    }
    clearDrag();
  };
  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    const field = fieldFromId(active.id);
    const target = field && over ? getDropTarget(field, over.id) : null;
    if (field && target) {
      void onMove({ field, destination: target.area, index: target.index });
      setAnnouncement(
        t('pivot_table.drag.completed', {
          area: t(`pivot_table.areas.${target.area}`),
          field: t(getFieldLabelKey(field)),
          position: target.index + 1,
        }),
      );
    } else if (field) {
      setAnnouncement(t('pivot_table.drag.cancelled', { field: t(getFieldLabelKey(field)) }));
    }
    clearDrag();
  };

  return (
    <DndContext
      collisionDetection={collisionDetection}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className={styles.builder}>
        <div className={styles.availableShelf} data-testid="pivot-available-shelf">
          <PivotDropZone
            area="available"
            destinationIndex={destinationIndex}
            insertionIndex={dropTarget?.area === 'available' ? dropTarget.index : null}
            fields={fieldsByArea.available}
            onMove={onMove}
            renderFilterControl={renderFilterControl}
            valuesCount={layout.values.length}
          />
        </div>
        <div className={styles.layoutSection}>
          <h3 className={styles.sectionHeading}>{t('pivot_table.configurator.layout_heading')}</h3>
          <div className={styles.assignmentGrid} data-testid="pivot-assignment-grid">
            {(['filters', 'rows', 'columns', 'values'] as PivotArea[]).map((area) => (
              <PivotDropZone
                area={area}
                destinationIndex={destinationIndex}
                insertionIndex={dropTarget?.area === area ? dropTarget.index : null}
                fields={fieldsByArea[area]}
                key={area}
                onMove={onMove}
                renderFilterControl={renderFilterControl}
                valuesCount={layout.values.length}
              />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeField ? <div className={styles.overlay}>{t(getFieldLabelKey(activeField))}</div> : null}
      </DragOverlay>
      <div aria-live="polite" className={styles.liveRegion}>
        {announcement}
      </div>
    </DndContext>
  );
}

export default PivotFieldBuilder;
