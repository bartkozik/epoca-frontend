import Icon, { icons } from '@/core/theme/icon';
import Tooltip from '@/core/theme/tooltip';
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { PIVOT_VALUE, type PivotKey, type PivotValue } from '../constants';
import { formatPivotDuration } from '../parsePivotDuration';
import type {
  PivotCoordinate,
  PivotFilterValue,
  PivotMetricValues,
  PivotMonthAxisProjection,
  WorkUnitPivotQueryRequest,
  WorkUnitPivotQueryResponse,
} from '../types';
import { buildPivotMatrix, coordinateIdentity } from './buildPivotMatrix';
import styles from './PivotMatrix.module.scss';
import { headerRowOffset, matrixTableWidth, rowFieldOffset } from './pivotMatrixGeometry';
import { usePivotMatrixDocks } from './usePivotMatrixDocks';
import { usePivotMatrixViewport } from './usePivotMatrixViewport';

interface PivotMatrixProps {
  locale: string;
  projection?: PivotMonthAxisProjection;
  request: WorkUnitPivotQueryRequest;
  resolveLabel: (key: PivotKey, value: PivotFilterValue) => string;
  response: WorkUnitPivotQueryResponse;
  verticalScrollContainerRef?: RefObject<HTMLDivElement>;
}

interface ColumnHeaderCell {
  id: string;
  label: string;
  colSpan: number;
  isRightEdge: boolean;
  rowSpan: number;
}

interface ColumnHeaders {
  rows: ColumnHeaderCell[][];
  idsByCoordinate: string[][];
}

interface OverflowLabelProps {
  children: ReactNode;
  measurementKey: number;
  text: string;
}

const OverflowLabel = ({ children, measurementKey, text }: OverflowLabelProps): JSX.Element => {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const nextIsTruncated = label.scrollWidth > label.clientWidth;
    setIsTruncated((current) => (current === nextIsTruncated ? current : nextIsTruncated));
  }, [measurementKey, text]);

  const label = (
    <span className={styles.overflowLabel} ref={labelRef}>
      {children}
    </span>
  );

  return isTruncated ? (
    <Tooltip className={styles.labelTooltip} content={text}>
      {label}
    </Tooltip>
  ) : (
    label
  );
};

const pathPrefixIdentity = (coordinate: PivotCoordinate, length: number): string =>
  JSON.stringify(coordinate.path.slice(0, length).map(({ key, value }) => [key, value]));

const isPathDescendant = (coordinate: PivotCoordinate, group: PivotCoordinate): boolean =>
  coordinate.path.length > group.path.length &&
  group.path.every(
    (segment, index) =>
      coordinate.path[index]?.key === segment.key && Object.is(coordinate.path[index]?.value, segment.value),
  );

const metricValue = (values: PivotMetricValues, measure: PivotValue): PivotMetricValues[keyof PivotMetricValues] => {
  if (measure === PIVOT_VALUE.DURATION_SUM) return values.durationSum;
  if (measure === PIVOT_VALUE.DURATION_AVG) return values.durationAvg;
  return values.entriesCount;
};

function PivotMatrix({
  locale,
  projection,
  request,
  resolveLabel,
  response,
  verticalScrollContainerRef,
}: PivotMatrixProps): JSX.Element {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const disconnectedVerticalScrollContainerRef = useRef<HTMLDivElement>(null);
  const grandTotalDockRef = useRef<HTMLDivElement>(null);
  const grandTotalDockTableRef = useRef<HTMLTableElement>(null);
  const grandTotalDockRowHeaderRef = useRef<HTMLTableCellElement>(null);
  const headerDockRef = useRef<HTMLDivElement>(null);
  const headerDockTableRef = useRef<HTMLTableElement>(null);
  const masterToggleRef = useRef<HTMLButtonElement>(null);
  const matrixShellRef = useRef<HTMLDivElement>(null);
  const semanticGrandTotalRef = useRef<HTMLTableRowElement>(null);
  const semanticHeaderRef = useRef<HTMLTableSectionElement>(null);
  const semanticMasterAnchorRef = useRef<HTMLTableCellElement>(null);
  const semanticTableRef = useRef<HTMLTableElement>(null);
  const model = useMemo(() => buildPivotMatrix(response, request, projection), [projection, request, response]);
  const renderedValueColumnCount = model.columnCoordinates.length * model.values.length;
  const { geometry, rowFieldsSticky } = usePivotMatrixViewport(
    containerRef,
    request.rows.length,
    renderedValueColumnCount,
  );
  const tableWidth = matrixTableWidth(request.rows.length, renderedValueColumnCount, geometry);
  const rowGroups = useMemo(
    () => model.rowCoordinates.filter(({ kind }) => kind === 'Subtotal'),
    [model.rowCoordinates],
  );
  const rowGroupSignature = rowGroups.map(coordinateIdentity).join('\u0000');
  const [expandedRowGroups, setExpandedRowGroups] = useState<Set<string>>(
    () => new Set(rowGroups.map(coordinateIdentity)),
  );

  useEffect(() => {
    setExpandedRowGroups(new Set(rowGroupSignature ? rowGroupSignature.split('\u0000') : []));
  }, [model.signature, rowGroupSignature]);

  const safeLabel = (key: PivotKey, value: PivotFilterValue): string => {
    try {
      const label = resolveLabel(key, value);
      if (label.trim()) return label;
    } catch {
      // Reference data can refresh independently; the raw value keeps the matrix understandable.
    }
    return t('pivot_table.table.unknown_value', { value: String(value) });
  };

  const coordinateLabel = (coordinate: PivotCoordinate): string => {
    if (coordinate.kind === 'GrandTotal') return t('pivot_table.table.grand_total');
    return coordinate.path.map(({ key, value }) => safeLabel(key, value)).join(' ');
  };

  const buildColumnHeaders = (): ColumnHeaders => {
    const idsByCoordinate = model.columnCoordinates.map(() => [] as string[]);
    const rows: ColumnHeaderCell[][] = [];

    for (let level = 0; level < request.columns.length; level += 1) {
      const cells: ColumnHeaderCell[] = [];
      let coordinateIndex = 0;

      while (coordinateIndex < model.columnCoordinates.length) {
        const coordinate = model.columnCoordinates[coordinateIndex];
        if (coordinate.path.length <= level) {
          if (coordinate.path.length === level) {
            const id = `pivot-column-${level}-${coordinateIndex}`;
            cells.push({
              id,
              label:
                coordinate.kind === 'GrandTotal' ? t('pivot_table.table.grand_total') : t('pivot_table.table.subtotal'),
              colSpan: model.values.length,
              isRightEdge: coordinateIndex === model.columnCoordinates.length - 1,
              rowSpan: request.columns.length - level,
            });
            idsByCoordinate[coordinateIndex].push(id);
          }
          coordinateIndex += 1;
          continue;
        }

        const prefix = pathPrefixIdentity(coordinate, level + 1);
        let end = coordinateIndex + 1;
        while (
          end < model.columnCoordinates.length &&
          model.columnCoordinates[end].path.length > level &&
          pathPrefixIdentity(model.columnCoordinates[end], level + 1) === prefix
        ) {
          end += 1;
        }
        const id = `pivot-column-${level}-${coordinateIndex}`;
        cells.push({
          id,
          label: safeLabel(coordinate.path[level].key, coordinate.path[level].value),
          colSpan: (end - coordinateIndex) * model.values.length,
          isRightEdge: end === model.columnCoordinates.length,
          rowSpan: 1,
        });
        for (let covered = coordinateIndex; covered < end; covered += 1) idsByCoordinate[covered].push(id);
        coordinateIndex = end;
      }
      rows.push(cells);
    }

    rows.push(
      model.columnCoordinates.flatMap((_, columnIndex) =>
        model.values.map((measure, measureIndex) => {
          const id = `pivot-value-${columnIndex}-${measureIndex}`;
          idsByCoordinate[columnIndex].push(id);
          return {
            id,
            label: t(`pivot_table.values.${measure}`),
            colSpan: 1,
            isRightEdge: columnIndex === model.columnCoordinates.length - 1 && measureIndex === model.values.length - 1,
            rowSpan: 1,
          };
        }),
      ),
    );
    return { rows, idsByCoordinate };
  };

  const columnHeaders = buildColumnHeaders();
  const allRowGroupsExpanded =
    rowGroups.length > 0 && rowGroups.every((group) => expandedRowGroups.has(coordinateIdentity(group)));
  const collapsedGroups = rowGroups.filter((group) => !expandedRowGroups.has(coordinateIdentity(group)));
  const visibleRows = model.rowCoordinates.filter(
    (coordinate) => !collapsedGroups.some((group) => isPathDescendant(coordinate, group)),
  );
  const grandTotalCoordinate = visibleRows.find(({ kind }) => kind === 'GrandTotal');

  usePivotMatrixDocks({
    grandTotalDockRef,
    grandTotalDockRowHeaderRef,
    grandTotalDockTableRef,
    headerDockRef,
    headerDockTableRef,
    horizontalContainerRef: containerRef,
    masterToggleRef,
    matrixShellRef,
    rowFieldsSticky,
    semanticGrandTotalRef,
    semanticHeaderRef,
    semanticMasterAnchorRef,
    semanticTableRef,
    verticalScrollContainerRef: verticalScrollContainerRef ?? disconnectedVerticalScrollContainerRef,
  });

  const toggleRowGroup = (coordinate: PivotCoordinate): void => {
    const identity = coordinateIdentity(coordinate);
    setExpandedRowGroups((current) => {
      const next = new Set(current);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  };

  const toggleAllRowGroups = (): void => {
    setExpandedRowGroups(
      allRowGroupsExpanded ? new Set() : new Set(rowGroups.map((group) => coordinateIdentity(group))),
    );
  };

  const formatValue = (values: PivotMetricValues, measure: PivotValue): string => {
    const value = metricValue(values, measure);
    if (value === null) return '—';
    if (value === undefined) return '';
    if (measure === PIVOT_VALUE.ENTRIES_COUNT) return new Intl.NumberFormat(locale).format(value as number);
    return formatPivotDuration(value as NonNullable<typeof value> & { seconds: number; nanoseconds: number });
  };

  return (
    <div className={styles.viewportShell} data-testid="pivot-matrix-shell" ref={matrixShellRef}>
      <div
        aria-label={t('pivot_table.table.scroll_region')}
        className={clsx(styles.container, { [styles.rowFieldsSticky]: rowFieldsSticky })}
        data-density={geometry.density}
        data-row-fields-sticky={rowFieldsSticky}
        ref={containerRef}
        role="region"
        tabIndex={0}
      >
        <table
          aria-label={t('pivot_table.table.label')}
          className={clsx(styles.table, styles.tableSurface)}
          data-testid="pivot-matrix-surface"
          ref={semanticTableRef}
          style={{ width: tableWidth }}
        >
          <colgroup>
            {request.rows.map((key) => (
              <col
                data-testid="pivot-matrix-column"
                key={`row-field-${key}`}
                style={{ width: geometry.rowFieldWidth }}
              />
            ))}
            {Array.from({ length: renderedValueColumnCount }, (_, index) => (
              <col
                data-testid="pivot-matrix-column"
                key={`value-column-${index}`}
                style={{ width: geometry.valueColumnWidth }}
              />
            ))}
          </colgroup>
          <thead ref={semanticHeaderRef}>
            {columnHeaders.rows.map((headerRow, headerRowIndex) => (
              <tr
                className={clsx({
                  [styles.headerBoundary]: headerRowIndex === columnHeaders.rows.length - 1,
                })}
                data-testid="pivot-matrix-header-row"
                key={`column-level-${headerRowIndex}`}
                style={{ height: geometry.headerRowHeight }}
              >
                {headerRowIndex === 0 &&
                  request.rows.map((key, level) => {
                    const label = t(`pivot_table.dimensions.${key}`);
                    return (
                      <th
                        className={clsx(styles.cornerHeader, {
                          [styles.masterCornerHeader]: level === 0 && rowGroups.length > 0,
                          [styles.rowFieldBoundary]: level === request.rows.length - 1,
                        })}
                        key={key}
                        ref={level === 0 ? semanticMasterAnchorRef : undefined}
                        rowSpan={columnHeaders.rows.length}
                        scope="col"
                        style={{ left: rowFieldsSticky ? rowFieldOffset(level, geometry) : undefined }}
                      >
                        <OverflowLabel measurementKey={geometry.rowFieldWidth} text={label}>
                          {label}
                        </OverflowLabel>
                      </th>
                    );
                  })}
                {headerRow.map(({ colSpan, id, isRightEdge, label, rowSpan }) => (
                  <th
                    className={clsx(styles.columnHeader, { [styles.rightEdgeCell]: isRightEdge })}
                    colSpan={colSpan}
                    id={id}
                    key={id}
                    rowSpan={rowSpan}
                    scope={colSpan > 1 || rowSpan > 1 ? 'colgroup' : 'col'}
                    style={{ top: headerRowOffset(headerRowIndex, geometry) }}
                  >
                    <OverflowLabel measurementKey={geometry.valueColumnWidth * colSpan} text={label}>
                      {label}
                    </OverflowLabel>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.map((rowCoordinate) => {
              const rowIndex = model.rowCoordinates.indexOf(rowCoordinate);
              const rowHeaderIds: string[] = [];
              const isSubtotal = rowCoordinate.kind === 'Subtotal';
              const groupIdentity = coordinateIdentity(rowCoordinate);
              const expanded = expandedRowGroups.has(groupIdentity);
              const rowLabel = coordinateLabel(rowCoordinate);
              const grandHeaderId = `pivot-row-${rowIndex}-0`;
              const ancestorDepth = rowGroups.reduce(
                (deepest, group) =>
                  isPathDescendant(rowCoordinate, group) ? Math.max(deepest, group.path.length) : deepest,
                0,
              );
              if (request.rows.length > 0 && rowCoordinate.kind === 'GrandTotal') rowHeaderIds.push(grandHeaderId);

              return (
                <tr
                  aria-label={rowLabel}
                  className={clsx({
                    [styles.subtotalRow]: isSubtotal,
                    [styles.grandTotalRow]: rowCoordinate.kind === 'GrandTotal',
                  })}
                  data-testid="pivot-matrix-body-row"
                  key={groupIdentity}
                  ref={rowCoordinate.kind === 'GrandTotal' ? semanticGrandTotalRef : undefined}
                  style={{ height: geometry.bodyRowHeight }}
                >
                  {request.rows.length > 0 && rowCoordinate.kind === 'GrandTotal' ? (
                    <th
                      className={clsx(styles.rowHeader, styles.rowFieldBoundary)}
                      colSpan={request.rows.length}
                      id={grandHeaderId}
                      scope="row"
                      style={{ left: rowFieldsSticky ? 0 : undefined }}
                    >
                      <OverflowLabel measurementKey={geometry.rowFieldWidth * request.rows.length} text={rowLabel}>
                        {rowLabel}
                      </OverflowLabel>
                    </th>
                  ) : (
                    request.rows.map((_, level) => {
                      const segment = rowCoordinate.path[level];
                      const id = segment ? `pivot-row-${rowIndex}-${level}` : undefined;
                      if (id) rowHeaderIds.push(id);
                      const segmentLabel = segment ? safeLabel(segment.key, segment.value) : '';
                      const label = level < ancestorDepth ? '' : segmentLabel;
                      const isGroupControl = isSubtotal && level === rowCoordinate.path.length - 1;
                      return (
                        <th
                          aria-label={!label && segmentLabel ? segmentLabel : undefined}
                          className={clsx(styles.rowHeader, {
                            [styles.rowFieldBoundary]: level === request.rows.length - 1,
                          })}
                          id={id}
                          key={`row-${rowIndex}-${level}`}
                          scope="row"
                          style={{ left: rowFieldsSticky ? rowFieldOffset(level, geometry) : undefined }}
                        >
                          {(isGroupControl || label) && (
                            <div className={styles.rowHeaderContent}>
                              {isGroupControl && (
                                <button
                                  aria-expanded={expanded}
                                  aria-label={t(
                                    expanded ? 'pivot_table.table.collapse_group' : 'pivot_table.table.expand_group',
                                    { label },
                                  )}
                                  className={styles.expandButton}
                                  onClick={() => toggleRowGroup(rowCoordinate)}
                                  type="button"
                                >
                                  <span aria-hidden="true" data-testid="pivot-group-toggle-icon">
                                    <Icon
                                      height={expanded ? 7 : 12}
                                      icon={expanded ? icons.arrowDown : icons.arrowRight}
                                      width={expanded ? 12 : 7}
                                    />
                                  </span>
                                </button>
                              )}
                              {label && (
                                <OverflowLabel measurementKey={geometry.rowFieldWidth} text={label}>
                                  {label}
                                </OverflowLabel>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })
                  )}
                  {model.columnCoordinates.flatMap((columnCoordinate, columnIndex) => {
                    const cell = model.getCell(rowCoordinate, columnCoordinate);
                    return model.values.map((measure, measureIndex) => (
                      <td
                        className={clsx(styles.valueCell, {
                          [styles.rightEdgeCell]:
                            columnIndex === model.columnCoordinates.length - 1 &&
                            measureIndex === model.values.length - 1,
                        })}
                        data-testid={`pivot-cell-${rowIndex}-${columnIndex}-${measureIndex}`}
                        headers={[...rowHeaderIds, ...columnHeaders.idsByCoordinate[columnIndex]].join(' ')}
                        key={`${coordinateIdentity(columnCoordinate)}-${measure}`}
                      >
                        {cell ? formatValue(cell.values, measure) : ''}
                      </td>
                    ));
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rowGroups.length > 0 && request.rows.length > 0 && (
        <button
          aria-expanded={allRowGroupsExpanded}
          aria-label={t(
            allRowGroupsExpanded ? 'pivot_table.table.collapse_all_groups' : 'pivot_table.table.expand_all_groups',
          )}
          className={styles.masterToggleDock}
          data-testid="pivot-master-group-toggle"
          onClick={toggleAllRowGroups}
          ref={masterToggleRef}
          style={{
            left: 5,
            top: Math.max(4, (columnHeaders.rows.length * geometry.headerRowHeight - 32) / 2),
          }}
          title={t(
            allRowGroupsExpanded ? 'pivot_table.table.collapse_all_groups' : 'pivot_table.table.expand_all_groups',
          )}
          type="button"
        >
          <span aria-hidden="true" className={styles.masterToggleIcon}>
            {[0, 1].map((iconIndex) => (
              <Icon
                height={allRowGroupsExpanded ? 7 : 12}
                icon={allRowGroupsExpanded ? icons.arrowDown : icons.arrowRight}
                key={iconIndex}
                width={allRowGroupsExpanded ? 12 : 7}
              />
            ))}
          </span>
        </button>
      )}
      <div
        aria-hidden="true"
        className={clsx(styles.headerDock, { [styles.rowFieldsSticky]: rowFieldsSticky })}
        data-density={geometry.density}
        data-mode="natural"
        data-testid="pivot-header-dock"
        ref={headerDockRef}
      >
        <table className={styles.table} ref={headerDockTableRef} style={{ width: tableWidth }}>
          <colgroup>
            {request.rows.map((key) => (
              <col key={`header-dock-row-field-${key}`} style={{ width: geometry.rowFieldWidth }} />
            ))}
            {Array.from({ length: renderedValueColumnCount }, (_, index) => (
              <col key={`header-dock-value-column-${index}`} style={{ width: geometry.valueColumnWidth }} />
            ))}
          </colgroup>
          <thead>
            {columnHeaders.rows.map((headerRow, headerRowIndex) => (
              <tr
                className={clsx({
                  [styles.headerBoundary]: headerRowIndex === columnHeaders.rows.length - 1,
                })}
                key={`header-dock-column-level-${headerRowIndex}`}
                style={{ height: geometry.headerRowHeight }}
              >
                {headerRowIndex === 0 &&
                  request.rows.map((key, level) => {
                    const label = t(`pivot_table.dimensions.${key}`);
                    return (
                      <th
                        className={clsx(styles.cornerHeader, {
                          [styles.masterCornerHeader]: level === 0 && rowGroups.length > 0,
                          [styles.rowFieldBoundary]: level === request.rows.length - 1,
                        })}
                        data-pivot-dock-row-header="true"
                        key={`header-dock-${key}`}
                        rowSpan={columnHeaders.rows.length}
                        title={label}
                      >
                        {label}
                      </th>
                    );
                  })}
                {headerRow.map(({ colSpan, id, isRightEdge, label, rowSpan }) => (
                  <th
                    className={clsx(styles.columnHeader, { [styles.rightEdgeCell]: isRightEdge })}
                    colSpan={colSpan}
                    key={`header-dock-${id}`}
                    rowSpan={rowSpan}
                    title={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
        </table>
      </div>
      {grandTotalCoordinate && (
        <div
          aria-hidden="true"
          className={clsx(styles.grandTotalDock, { [styles.rowFieldsSticky]: rowFieldsSticky })}
          data-docked="false"
          data-density={geometry.density}
          data-testid="pivot-grand-total-dock"
          ref={grandTotalDockRef}
        >
          <div
            className={styles.grandTotalSurface}
            data-testid="pivot-grand-total-surface"
            style={{ height: geometry.bodyRowHeight }}
          >
            <table
              className={styles.table}
              ref={grandTotalDockTableRef}
              style={{ height: geometry.bodyRowHeight, width: tableWidth }}
            >
              <colgroup>
                {request.rows.map((key) => (
                  <col key={`dock-row-field-${key}`} style={{ width: geometry.rowFieldWidth }} />
                ))}
                {Array.from({ length: renderedValueColumnCount }, (_, index) => (
                  <col key={`dock-value-column-${index}`} style={{ width: geometry.valueColumnWidth }} />
                ))}
              </colgroup>
              <tbody>
                <tr className={styles.grandTotalRow} style={{ height: geometry.bodyRowHeight }}>
                  {request.rows.length > 0 && (
                    <th
                      className={clsx(styles.rowHeader, styles.rowFieldBoundary)}
                      colSpan={request.rows.length}
                      ref={grandTotalDockRowHeaderRef}
                      title={coordinateLabel(grandTotalCoordinate)}
                    >
                      <span className={styles.overflowLabel}>{coordinateLabel(grandTotalCoordinate)}</span>
                    </th>
                  )}
                  {model.columnCoordinates.flatMap((columnCoordinate, columnIndex) => {
                    const cell = model.getCell(grandTotalCoordinate, columnCoordinate);
                    return model.values.map((measure, measureIndex) => (
                      <td
                        className={clsx(styles.valueCell, {
                          [styles.rightEdgeCell]:
                            columnIndex === model.columnCoordinates.length - 1 &&
                            measureIndex === model.values.length - 1,
                        })}
                        key={`dock-${coordinateIdentity(columnCoordinate)}-${measure}`}
                      >
                        {cell ? formatValue(cell.values, measure) : ''}
                      </td>
                    ));
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className={styles.grandTotalClearance} data-testid="pivot-grand-total-clearance" />
        </div>
      )}
    </div>
  );
}

export default PivotMatrix;
