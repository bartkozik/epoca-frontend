import canonicalResponse from '@/modules/reports/models/__fixtures__/work-unit-pivot-query-canonical-response.json';
import { parsePivotResponse } from '@/modules/reports/models/pivotTableQuery.model';
import { createRef } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compile } from 'sass';
import type { Mock } from 'vitest';
import { PIVOT_KEY, PIVOT_VALUE, type PivotKey } from '../constants';
import type { PivotFilterValue, WorkUnitPivotQueryRequest, WorkUnitPivotQueryResponse } from '../types';
import PivotMatrix from './PivotMatrix';
import {
  BODY_ROW_HEIGHT,
  COMPACT_BODY_ROW_HEIGHT,
  COMPACT_HEADER_ROW_HEIGHT,
  COMPACT_ROW_FIELD_WIDTH,
  COMPACT_VALUE_COLUMN_WIDTH,
  HEADER_ROW_HEIGHT,
} from './pivotMatrixGeometry';

const pivotMatrixCss = compile('src/modules/reports/pivotTable/matrix/PivotMatrix.module.scss', {
  loadPaths: ['src'],
}).css;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      `${key}${params?.label ? `:${params.label}` : ''}${params?.value ? `:${params.value}` : ''}`,
  }),
}));

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const labels = new Map<PivotFilterValue, string>([
  [USER, 'Alice'],
  [PROJECT_A, 'Project A'],
  [PROJECT_B, 'Project B'],
  ['2026-07', 'July 2026'],
  ['2026-08', 'August 2026'],
  [2026, '2026'],
]);
const resolveLabel = (key: PivotKey, value: PivotFilterValue): string => {
  if (key === PIVOT_KEY.MONTH_YEAR && typeof value === 'string') {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC', year: 'numeric' }).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );
  }
  return labels.get(value) ?? '';
};
const canonicalRequest: WorkUnitPivotQueryRequest = {
  rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT],
  filters: [],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
};
const canonicalParsedResponse = (): WorkUnitPivotQueryResponse =>
  parsePivotResponse(canonicalResponse, canonicalRequest);

describe('PivotMatrix', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalResizeObserver = window.ResizeObserver;
  let resizeObservers: Array<{ active: boolean; callback: ResizeObserverCallback }>;
  let disconnectResizeObserver: Mock;
  let observeResizeTarget: Mock;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600, writable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000, writable: true });
    resizeObservers = [];
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    disconnectResizeObserver = vi.fn();
    observeResizeTarget = vi.fn();
    // A regular `function` (not an arrow function) is required here: `window.ResizeObserver` is
    // invoked with `new`, and arrow functions aren't constructible.
    window.ResizeObserver = vi.fn(function MockResizeObserver(callback: ResizeObserverCallback) {
      const observer = { active: true, callback };
      resizeObservers.push(observer);
      return {
        disconnect: () => {
          observer.active = false;
          disconnectResizeObserver();
        },
        observe: observeResizeTarget,
        unobserve: vi.fn(),
      };
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
      writable: true,
    });
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: originalResizeObserver,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders a semantic sparse 4 × 3 × 3 matrix with stable headers and blank missing intersections', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    expect(screen.getByRole('table', { name: 'pivot_table.table.label' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(6); // two column-header rows plus four data rows
    expect(screen.getByTestId('pivot-cell-2-1-0')).toBeEmptyDOMElement();
    expect(screen.getByTestId('pivot-cell-1-0-0')).toHaveTextContent('02:00');
    expect(screen.getByTestId('pivot-cell-1-0-2')).toHaveTextContent('1');
    expect(screen.getByTestId('pivot-cell-1-0-0')).toHaveAttribute('headers', expect.stringContaining('pivot-row'));
    expect(screen.getByTestId('pivot-cell-1-0-0')).toHaveAttribute('headers', expect.stringContaining('pivot-value'));
    expect(screen.getAllByRole('columnheader').some((header) => header.getAttribute('scope') === 'colgroup')).toBe(
      true,
    );
  });

  it('exposes the compact grid geometry and deterministic sticky-layer boundaries', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const table = screen.getByRole('table', { name: 'pivot_table.table.label' });
    const headerRows = screen.getAllByTestId('pivot-matrix-header-row');
    const bodyRows = screen.getAllByTestId('pivot-matrix-body-row');
    expect(within(table).getAllByRole('columnheader')).not.toHaveLength(0);
    expect(within(table).getAllByRole('rowheader')).not.toHaveLength(0);
    headerRows.forEach((row) => expect(row).toHaveStyle({ height: `${HEADER_ROW_HEIGHT}px` }));
    bodyRows.forEach((row) => expect(row).toHaveStyle({ height: `${BODY_ROW_HEIGHT}px` }));
    expect(headerRows[headerRows.length - 1]).toHaveClass('headerBoundary');

    expect(screen.getByRole('columnheader', { name: 'pivot_table.dimensions.UserKey' })).not.toHaveClass(
      'rowFieldBoundary',
    );
    expect(screen.getByRole('columnheader', { name: 'pivot_table.dimensions.ProjectKey' })).toHaveClass(
      'rowFieldBoundary',
    );
    expect(screen.getByRole('rowheader', { name: 'Project A' })).toHaveClass('rowFieldBoundary');
    expect(screen.getByRole('rowheader', { name: 'pivot_table.table.grand_total' })).toHaveClass('rowFieldBoundary');
  });

  it('uses a denser laptop geometry while keeping the matrix at its natural height', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1512, writable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 982, writable: true });

    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const region = screen.getByRole('region', { name: 'pivot_table.table.scroll_region' });
    const dock = screen.getByTestId('pivot-grand-total-dock');
    const table = screen.getByRole('table', { name: 'pivot_table.table.label' });
    const columns = screen.getAllByTestId('pivot-matrix-column');
    expect(region).toHaveAttribute('data-density', 'compact');
    expect(dock).toHaveAttribute('data-density', 'compact');
    expect(region.style.maxHeight).toBe('');
    expect(screen.getByTestId('pivot-matrix-shell').style.maxHeight).toBe('');
    expect(pivotMatrixCss).toMatch(/\.container\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/);
    expect(table).toHaveStyle({ width: '1360px' });
    expect(columns[0]).toHaveStyle({ width: `${COMPACT_ROW_FIELD_WIDTH}px` });
    expect(columns[2]).toHaveStyle({ width: `${COMPACT_VALUE_COLUMN_WIDTH}px` });
    screen
      .getAllByTestId('pivot-matrix-header-row')
      .forEach((row) => expect(row).toHaveStyle({ height: `${COMPACT_HEADER_ROW_HEIGHT}px` }));
    screen
      .getAllByTestId('pivot-matrix-body-row')
      .forEach((row) => expect(row).toHaveStyle({ height: `${COMPACT_BODY_ROW_HEIGHT}px` }));
    expect(screen.getByRole('columnheader', { name: 'pivot_table.dimensions.ProjectKey' })).toHaveStyle({
      left: `${COMPACT_ROW_FIELD_WIDTH}px`,
    });
  });

  it('keeps semantic rows authoritative and renders inert presentation docks', () => {
    const verticalScrollContainerRef = createRef<HTMLDivElement>();

    render(
      <div ref={verticalScrollContainerRef}>
        <PivotMatrix
          locale="en"
          request={canonicalRequest}
          resolveLabel={resolveLabel}
          response={canonicalParsedResponse()}
          verticalScrollContainerRef={verticalScrollContainerRef}
        />
      </div>,
    );

    const headerDock = screen.getByTestId('pivot-header-dock');
    const grandTotalDock = screen.getByTestId('pivot-grand-total-dock');

    expect(screen.getByRole('row', { name: 'pivot_table.table.grand_total' })).toHaveClass('grandTotalRow');
    expect(headerDock).toHaveAttribute('aria-hidden', 'true');
    expect(grandTotalDock).toHaveAttribute('aria-hidden', 'true');
    expect(within(headerDock).getAllByRole('row', { hidden: true })).toHaveLength(2);
    within(headerDock)
      .getAllByRole('columnheader', { hidden: true })
      .forEach((header) => {
        expect(header).not.toHaveAttribute('id');
        expect(header).not.toHaveAttribute('scope');
        expect(header).not.toHaveAttribute('headers');
      });
    within(grandTotalDock)
      .getAllByRole('cell', { hidden: true })
      .forEach((cell) => expect(cell).not.toHaveAttribute('headers'));
    within(grandTotalDock)
      .getAllByRole('columnheader', { hidden: true })
      .forEach((header) => {
        expect(header).not.toHaveAttribute('id');
        expect(header).not.toHaveAttribute('scope');
        expect(header).not.toHaveAttribute('headers');
      });
    expect(pivotMatrixCss).toMatch(/\.headerDock\s*\{[^}]*position:\s*fixed;[^}]*visibility:\s*hidden;/);
  });

  it('delegates vertical scrolling and keeps the conditional horizontal rail outside the table surface', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const scrollRegion = screen.getByRole('region', { name: 'pivot_table.table.scroll_region' });
    const tableSurface = screen.getByTestId('pivot-matrix-surface');
    const grandTotalDock = screen.getByTestId('pivot-grand-total-dock');
    const grandTotalSurface = screen.getByTestId('pivot-grand-total-surface');
    const grandTotalClearance = screen.getByTestId('pivot-grand-total-clearance');

    expect(scrollRegion).toContainElement(tableSurface);
    expect(grandTotalDock).toContainElement(grandTotalSurface);
    expect(grandTotalDock).toContainElement(grandTotalClearance);
    const scrollRegionRule = pivotMatrixCss.match(/\.container\s*\{[^}]*\}/)?.[0];
    const viewportShellRule = pivotMatrixCss.match(/\.viewportShell\s*\{[^}]*\}/)?.[0];
    expect(viewportShellRule).toContain('--pivot-grand-total-clearance: 24px');
    expect(viewportShellRule).toContain('padding-bottom: var(--pivot-grand-total-clearance)');
    expect(scrollRegionRule).toContain('overflow-x: auto');
    expect(scrollRegionRule).toContain('overflow-y: hidden');
    expect(scrollRegionRule).not.toContain('padding-bottom');
    expect(scrollRegionRule).not.toContain('scrollbar-gutter');
    expect(pivotMatrixCss).toMatch(
      /\.tableSurface\s*\{[^}]*overflow:\s*clip;[^}]*border-radius:\s*8px;[^}]*box-shadow:/,
    );
    expect(pivotMatrixCss).toMatch(
      /\.grandTotalClearance\s*\{[^}]*height:\s*calc\(var\(--pivot-grand-total-clearance\) \+ var\(--pivot-sticky-bottom-inset\)\);[^}]*background:\s*#ffffff/,
    );
  });

  it('completes the accepted Month-only range with blank early cells and laptop horizontal overflow', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1512, writable: true });
    const projection = { dateFrom: '2026-02-01', effectiveDateTo: '2026-08-20' };

    render(
      <PivotMatrix
        locale="en"
        projection={projection}
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const region = screen.getByRole('region', { name: 'pivot_table.table.scroll_region' });
    const table = screen.getByRole('table', { name: 'pivot_table.table.label' });
    expect(screen.getByRole('columnheader', { name: 'February 2026' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'March 2026' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'April 2026' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'August 2026' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'pivot_table.table.grand_total' })).toBeInTheDocument();
    expect(screen.getByTestId('pivot-cell-1-0-0')).toBeEmptyDOMElement();
    expect(screen.getByTestId('pivot-cell-1-1-0')).toBeEmptyDOMElement();
    expect(screen.getByTestId('pivot-cell-1-2-0')).toBeEmptyDOMElement();
    expect(screen.getByTestId('pivot-cell-1-5-0')).toHaveTextContent('02:00');
    expect(table).toHaveStyle({ width: '3040px' });
    Object.defineProperty(region, 'scrollWidth', { configurable: true, value: 3040 });
    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 1000 });
    expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
  });

  it('does not attach unconditional native tooltips and uses an icon-backed group control', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'pivot_table.dimensions.ProjectKey' })).not.toHaveAttribute(
      'title',
    );
    expect(screen.getByRole('columnheader', { name: 'July 2026' })).not.toHaveAttribute('title');
    expect(screen.getByRole('rowheader', { name: 'Project A' })).not.toHaveAttribute('title');

    const collapse = screen.getByRole('button', { name: 'pivot_table.table.collapse_group:Alice' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(within(collapse).getByTestId('pivot-group-toggle-icon')).toBeInTheDocument();
    expect(collapse).not.toHaveTextContent('−');
  });

  it('collapses and expands every row group with one master chevron', async () => {
    const user = userEvent.setup();
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const collapseAll = screen.getByRole('button', { name: 'pivot_table.table.collapse_all_groups' });
    const initialRows = screen.getAllByTestId('pivot-matrix-body-row').length;
    expect(screen.getAllByRole('button', { name: 'pivot_table.table.collapse_all_groups' })).toHaveLength(1);
    expect(collapseAll).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(screen.getByTestId('pivot-header-dock')).queryByRole('button', {
        hidden: true,
        name: 'pivot_table.table.collapse_all_groups',
      }),
    ).not.toBeInTheDocument();

    await user.click(collapseAll);
    const expandAll = screen.getByRole('button', { name: 'pivot_table.table.expand_all_groups' });
    expect(expandAll).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByTestId('pivot-matrix-body-row').length).toBeLessThan(initialRows);
    expect(screen.queryByRole('rowheader', { name: 'Project A' })).not.toBeInTheDocument();

    await user.click(expandAll);
    expect(screen.getByRole('button', { name: 'pivot_table.table.collapse_all_groups' })).toBe(collapseAll);
    expect(screen.getAllByTestId('pivot-matrix-body-row')).toHaveLength(initialRows);

    await user.click(screen.getByRole('button', { name: 'pivot_table.table.collapse_group:Alice' }));
    expect(screen.getByRole('button', { name: 'pivot_table.table.expand_all_groups' })).toBe(collapseAll);
    await user.click(collapseAll);
    expect(screen.getByRole('button', { name: 'pivot_table.table.collapse_all_groups' })).toBe(collapseAll);
    expect(screen.getAllByTestId('pivot-matrix-body-row')).toHaveLength(initialRows);
  });

  it('labels each subtotal group with only its dimension value and omits repeated ancestor labels', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const bodyRows = screen.getAllByTestId('pivot-matrix-body-row');
    expect(bodyRows.slice(0, 3).map((row) => row.getAttribute('aria-label'))).toEqual([
      'Alice',
      'Alice Project A',
      'Alice Project B',
    ]);
    const subtotalGroupHeader = within(bodyRows[0]).getByRole('rowheader', { name: 'Alice' });
    expect(subtotalGroupHeader).toHaveTextContent('Alice');
    expect(subtotalGroupHeader).not.toHaveTextContent('pivot_table.table.subtotal');
    expect(within(bodyRows[0]).getByRole('button', { name: 'pivot_table.table.collapse_group:Alice' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(bodyRows[1]).getAllByRole('rowheader')[0]).toBeEmptyDOMElement();
    expect(within(bodyRows[1]).getAllByRole('rowheader')[0]).toHaveAttribute('aria-label', 'Alice');
    expect(within(bodyRows[1]).getAllByRole('rowheader')[1]).toHaveTextContent('Project A');
  });

  it('only renders full-label tooltips for text that is actually truncated', () => {
    expect(pivotMatrixCss).toMatch(/\.cornerHeader,\s*\.columnHeader,\s*\.rowHeader\s*\{[^}]*overflow:\s*visible;/);
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get');
    scrollWidth.mockReturnValue(0);
    const view = render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();

    view.unmount();
    scrollWidth.mockReturnValue(2000);
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    expect(
      screen.getAllByRole('tooltip', { hidden: true }).some((tooltip) => tooltip.textContent === 'Project A'),
    ).toBe(true);
  });

  it('uses a fixed semantic colgroup and exact geometry without the global report table class', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const table = screen.getByRole('table', { name: 'pivot_table.table.label' });
    const columns = screen.getAllByTestId('pivot-matrix-column');
    expect(table).toHaveClass('table', 'tableSurface');
    expect(table).toHaveStyle({ width: '1544px' });
    expect(columns).toHaveLength(11);
    expect(columns[0]).toHaveStyle({ width: '196px' });
    expect(columns[2]).toHaveStyle({ width: '128px' });
    expect(screen.getByRole('columnheader', { name: 'pivot_table.dimensions.ProjectKey' })).toHaveStyle({
      left: '196px',
    });
  });

  it('gives spare container width to descriptive row fields before truncating them', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    act(() => {
      resizeObservers
        .filter(({ active }) => active)
        .forEach(({ callback }) =>
          callback([{ contentRect: { width: 1800 } } as ResizeObserverEntry], {} as ResizeObserver),
        );
    });

    const table = screen.getByRole('table', { name: 'pivot_table.table.label' });
    const columns = screen.getAllByTestId('pivot-matrix-column');
    expect(table).toHaveStyle({ width: '1800px' });
    expect(columns[0]).toHaveStyle({ width: '324px' });
    expect(columns[1]).toHaveStyle({ width: '324px' });
    expect(columns[2]).toHaveStyle({ width: '128px' });
  });

  it('bases row-field freezing on minimum widths when descriptive columns stretch', () => {
    const request = { ...canonicalRequest, values: [PIVOT_VALUE.DURATION_SUM] };

    render(
      <PivotMatrix locale="en" request={request} resolveLabel={resolveLabel} response={canonicalParsedResponse()} />,
    );

    const region = screen.getByRole('region', { name: 'pivot_table.table.scroll_region' });
    const columns = screen.getAllByTestId('pivot-matrix-column');
    expect(columns[0]).toHaveStyle({ width: '308px' });
    expect(region).toHaveAttribute('data-row-fields-sticky', 'true');
  });

  it('tracks the measured matrix width and viewport when deciding whether row fields are frozen', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );

    const region = screen.getByRole('region', { name: 'pivot_table.table.scroll_region' });
    const projectCornerHeader = screen.getByRole('columnheader', {
      name: 'pivot_table.dimensions.ProjectKey',
    });
    const projectRowHeader = screen.getAllByRole('rowheader').find(({ textContent }) => textContent === 'Project A');
    expect(observeResizeTarget).toHaveBeenCalledWith(region);
    expect(region).toHaveAttribute('data-row-fields-sticky', 'true');
    expect(region).toHaveClass('rowFieldsSticky');
    expect(projectCornerHeader).toHaveStyle({ left: '196px' });
    expect(projectRowHeader).toHaveStyle({ left: '196px' });

    act(() => {
      resizeObservers
        .filter(({ active }) => active)
        .forEach(({ callback }) =>
          callback([{ contentRect: { width: 780 } } as ResizeObserverEntry], {} as ResizeObserver),
        );
    });
    expect(region).toHaveAttribute('data-row-fields-sticky', 'false');
    expect(region).not.toHaveClass('rowFieldsSticky');
    expect(projectCornerHeader).not.toHaveStyle({ left: '196px' });
    expect(projectRowHeader).not.toHaveStyle({ left: '196px' });
    expect(screen.getByRole('columnheader', { name: 'July 2026' })).toHaveStyle({ top: '0px' });

    act(() => {
      resizeObservers
        .filter(({ active }) => active)
        .forEach(({ callback }) =>
          callback([{ contentRect: { width: 1000 } } as ResizeObserverEntry], {} as ResizeObserver),
        );
    });
    expect(region).toHaveAttribute('data-row-fields-sticky', 'true');
    expect(projectCornerHeader).toHaveStyle({ left: '196px' });
    expect(projectRowHeader).toHaveStyle({ left: '196px' });

    act(() => {
      window.innerWidth = 767;
      window.dispatchEvent(new Event('resize'));
    });
    expect(region).toHaveAttribute('data-row-fields-sticky', 'false');

    act(() => {
      window.innerWidth = 1600;
      window.dispatchEvent(new Event('resize'));
    });
    expect(region).toHaveAttribute('data-row-fields-sticky', 'true');
  });

  it('does not freeze seven row fields in a 1600px matrix container', () => {
    const sevenRowFieldsRequest: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      rows: [
        PIVOT_KEY.USER,
        PIVOT_KEY.PROJECT,
        PIVOT_KEY.CLIENT,
        PIVOT_KEY.YEAR,
        PIVOT_KEY.MONTH_YEAR,
        PIVOT_KEY.DATE,
        PIVOT_KEY.ENTRY_TYPE,
      ],
    };

    render(
      <PivotMatrix
        locale="en"
        request={sevenRowFieldsRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );
    const region = screen.getByRole('region', { name: 'pivot_table.table.scroll_region' });

    act(() => {
      resizeObservers
        .filter(({ active }) => active)
        .forEach(({ callback }) =>
          callback([{ contentRect: { width: 1600 } } as ResizeObserverEntry], {} as ResizeObserver),
        );
    });
    expect(region).toHaveAttribute('data-row-fields-sticky', 'false');
  });

  it('disconnects matrix measurement and removes its window resize listener on unmount', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const view = render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={resolveLabel}
        response={canonicalParsedResponse()}
      />,
    );
    const resizeListener = addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1];

    expect(resizeListener).toEqual(expect.any(Function));
    view.unmount();

    expect(disconnectResizeObserver).toHaveBeenCalledTimes(resizeObservers.length);
    expect(removeEventListener).toHaveBeenCalledWith('resize', resizeListener);
  });

  it('renders a null requested average as an em dash on structural empty axes', () => {
    const request: WorkUnitPivotQueryRequest = {
      rows: [],
      columns: [],
      values: [PIVOT_VALUE.DURATION_AVG],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [
        {
          row: { kind: 'Leaf', path: [] },
          column: { kind: 'Leaf', path: [] },
          values: { durationAvg: null },
        },
      ],
      filterMembers: [],
      result: { cellCount: 1, displayValueCellCount: 1, maxDisplayValueCellCount: 9_600 },
    };

    render(<PivotMatrix locale="en" request={request} resolveLabel={resolveLabel} response={response} />);
    expect(screen.getByTestId('pivot-cell-0-0-0')).toHaveTextContent('—');
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'pivot_table.table.collapse_all_groups' })).not.toBeInTheDocument();
  });

  it('renders two-level grouped column headers and measures as the innermost level', () => {
    const request: WorkUnitPivotQueryRequest = {
      rows: [],
      columns: [PIVOT_KEY.YEAR, PIVOT_KEY.MONTH_YEAR],
      values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [
        {
          row: { kind: 'Leaf', path: [] },
          column: {
            kind: 'Leaf',
            path: [
              { key: PIVOT_KEY.YEAR, value: 2026 },
              { key: PIVOT_KEY.MONTH_YEAR, value: '2026-07' },
            ],
          },
          values: { durationSum: { seconds: 7200, nanoseconds: 0 }, entriesCount: 1 },
        },
        {
          row: { kind: 'Leaf', path: [] },
          column: { kind: 'Subtotal', path: [{ key: PIVOT_KEY.YEAR, value: 2026 }] },
          values: { durationSum: { seconds: 7200, nanoseconds: 0 }, entriesCount: 1 },
        },
        {
          row: { kind: 'Leaf', path: [] },
          column: { kind: 'GrandTotal', path: [] },
          values: { durationSum: { seconds: 7200, nanoseconds: 0 }, entriesCount: 1 },
        },
      ],
      filterMembers: [],
      result: { cellCount: 3, displayValueCellCount: 6, maxDisplayValueCellCount: 9_600 },
    };

    render(<PivotMatrix locale="en" request={request} resolveLabel={resolveLabel} response={response} />);
    expect(screen.getByRole('columnheader', { name: '2026' })).toHaveAttribute('colspan', '4');
    expect(screen.getByRole('columnheader', { name: 'July 2026' })).toHaveAttribute('colspan', '2');
    const subtotalHeader = screen.getByRole('columnheader', { name: 'pivot_table.table.subtotal' });
    const grandTotalHeader = screen.getByRole('columnheader', { name: 'pivot_table.table.grand_total' });
    expect(subtotalHeader).toHaveAttribute('colspan', '2');
    expect(subtotalHeader).not.toHaveClass('rightEdgeCell');
    expect(grandTotalHeader).toHaveAttribute('rowspan', '2');
    expect(grandTotalHeader).toHaveClass('rightEdgeCell');
    expect(screen.getByTestId('pivot-cell-0-2-1')).toHaveClass('rightEdgeCell');
    expect(
      within(screen.getByRole('table', { name: 'pivot_table.table.label' })).getAllByText(
        'pivot_table.values.DurationSum',
      ),
    ).toHaveLength(3);
  });

  it('collapses row descendants locally, preserves state on refresh, and resets it for a new signature', async () => {
    const user = userEvent.setup();
    const response = canonicalParsedResponse();
    const view = render(
      <PivotMatrix locale="en" request={canonicalRequest} resolveLabel={resolveLabel} response={response} />,
    );
    const collapse = screen.getByRole('button', {
      name: 'pivot_table.table.collapse_group:Alice',
    });

    await user.click(collapse);
    expect(collapse).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('row', { name: /Project A/ })).not.toBeInTheDocument();
    view.rerender(
      <PivotMatrix locale="en" request={canonicalRequest} resolveLabel={resolveLabel} response={{ ...response }} />,
    );
    expect(screen.queryByRole('row', { name: /Project A/ })).not.toBeInTheDocument();

    const changedRequest = { ...canonicalRequest, values: [PIVOT_VALUE.DURATION_SUM] };
    const changedResponse = {
      ...response,
      cells: response.cells.map((cell) => ({ ...cell, values: { durationSum: cell.values.durationSum } })),
    };
    view.rerender(
      <PivotMatrix locale="en" request={changedRequest} resolveLabel={resolveLabel} response={changedResponse} />,
    );
    expect(screen.getByRole('row', { name: /Project A/ })).toBeInTheDocument();
  });

  it('falls back to a safe raw UUID label and keeps the scroll container named', () => {
    render(
      <PivotMatrix
        locale="en"
        request={canonicalRequest}
        resolveLabel={() => ''}
        response={canonicalParsedResponse()}
      />,
    );
    expect(screen.getAllByText(`pivot_table.table.unknown_value:${USER}`).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'pivot_table.table.scroll_region' })).toBeInTheDocument();
  });
});
