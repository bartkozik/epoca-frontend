import type { ReactNode } from 'react';
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compile } from 'sass';
import { PIVOT_KEY, PIVOT_VALUE } from '../constants';
import type { PivotLayout } from '../layout/types';
import PivotFieldBuilder from './PivotFieldBuilder';

const pivotFieldBuilderCss = compile('src/modules/reports/pivotTable/pivotFieldBuilder/PivotFieldBuilder.module.scss', {
  loadPaths: ['src'],
}).css;

let handleDragEnd: ((event: DragEndEvent) => void) | undefined;
let handleDragCancel: ((event: DragCancelEvent) => void) | undefined;
let handleDragOver: ((event: DragOverEvent) => void) | undefined;
let handleDragStart: ((event: DragStartEvent) => void) | undefined;
const mockSensorCalls: unknown[][] = [];

vi.mock('@dnd-kit/core', () => ({
  closestCenter: vi.fn(),
  DndContext: ({
    children,
    onDragCancel,
    onDragEnd,
    onDragOver,
    onDragStart,
  }: {
    children: ReactNode;
    onDragCancel: (event: DragCancelEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
    onDragOver: (event: DragOverEvent) => void;
    onDragStart: (event: DragStartEvent) => void;
  }) => {
    handleDragCancel = onDragCancel;
    handleDragEnd = onDragEnd;
    handleDragOver = onDragOver;
    handleDragStart = onDragStart;
    return <>{children}</>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  KeyboardSensor: vi.fn(),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  useSensor: (...arguments_: unknown[]) => {
    mockSensorCalls.push(arguments_);
    return {};
  },
  useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock('@dnd-kit/sortable', () => ({
  rectSortingStrategy: vi.fn(),
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: vi.fn(() => undefined) } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => `${key}${params?.field ? `:${params.field}` : ''}`,
  }),
}));

const layout = (): PivotLayout => ({
  rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM],
  filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: null }],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
});

describe('PivotFieldBuilder', () => {
  beforeEach(() => {
    handleDragEnd = undefined;
    handleDragCancel = undefined;
    handleDragOver = undefined;
    handleDragStart = undefined;
    mockSensorCalls.length = 0;
  });

  it('renders Available and all four named pivot areas with persistent instructions', () => {
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    ['available', 'rows', 'columns', 'values', 'filters'].forEach((area) => {
      const region = screen.getByRole('region', { name: `pivot_table.areas.${area}` });
      expect(region).toBeInTheDocument();
      expect(within(region).getByText(`pivot_table.areas.${area}_instruction`)).toBeInTheDocument();
    });
    expect(screen.getByText('pivot_table.dimensions.ClientKey')).toBeInTheDocument();
    expect(screen.getByText('pivot_table.values.DurationAvg')).toBeInTheDocument();
  });

  it('separates the Available shelf from the four assignment areas', () => {
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    const availableShelf = screen.getByTestId('pivot-available-shelf');
    expect(within(availableShelf).getByRole('region', { name: 'pivot_table.areas.available' })).toBeInTheDocument();

    const assignmentGrid = screen.getByTestId('pivot-assignment-grid');
    expect(
      within(assignmentGrid)
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label')),
    ).toEqual([
      'pivot_table.areas.filters',
      'pivot_table.areas.rows',
      'pivot_table.areas.columns',
      'pivot_table.areas.values',
    ]);
    expect(
      within(assignmentGrid).queryByRole('region', { name: 'pivot_table.areas.available' }),
    ).not.toBeInTheDocument();
  });

  it('makes the final Available insertion marker span the shelf row', () => {
    const availableInsertionRule =
      pivotFieldBuilderCss.match(/\.availableShelf \.fieldList > \.insertionBar\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(availableInsertionRule).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('groups the four areas under a table layout heading and marks only empty areas as drop places', () => {
    render(<PivotFieldBuilder layout={{ ...layout(), filters: [] }} onMove={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 3, name: 'pivot_table.configurator.layout_heading' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'pivot_table.areas.filters' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'pivot_table.areas.filters' })).getByText(
        'pivot_table.areas.drop_here',
      ),
    ).toBeInTheDocument();
    ['pivot_table.areas.rows', 'pivot_table.areas.available'].forEach((name) =>
      expect(within(screen.getByRole('region', { name })).queryByText('pivot_table.areas.drop_here')).toBeNull(),
    );
  });

  it('exposes a labelled drag surface, remove action, and non-drag destinations for a dimension', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<PivotFieldBuilder layout={layout()} onMove={onMove} />);

    const dragActivator = screen.getByRole('button', {
      name: 'pivot_table.field.drag:pivot_table.dimensions.UserKey',
    });
    expect(within(dragActivator).getByTestId('pivot-drag-dots')).toBeInTheDocument();
    expect(within(dragActivator).getByText('pivot_table.dimensions.UserKey')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.dimensions.UserKey' }));

    const menu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.dimensions.UserKey' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .filter((item) => item.textContent?.startsWith('pivot_table.areas.'))
        .map((item) => item.textContent),
    ).toEqual([
      'pivot_table.areas.available',
      'pivot_table.areas.rows',
      'pivot_table.areas.columns',
      'pivot_table.areas.filters',
    ]);

    await user.click(within(menu).getByRole('menuitem', { name: 'pivot_table.areas.columns' }));
    expect(onMove).toHaveBeenCalledWith({ field: PIVOT_KEY.USER, destination: 'columns', index: 1 });
  });

  it('moves an assigned field later from the menu and disables moving the first field earlier', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<PivotFieldBuilder layout={layout()} onMove={onMove} />);

    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.dimensions.UserKey' }));
    const menu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.dimensions.UserKey' });
    expect(within(menu).getByRole('menuitem', { name: 'pivot_table.field.move_earlier' })).toBeDisabled();

    await user.click(within(menu).getByRole('menuitem', { name: 'pivot_table.field.move_later' }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({ field: PIVOT_KEY.USER, destination: 'rows', index: 1 });
  });

  it('disables the destination that already contains the field', async () => {
    const user = userEvent.setup();
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' }));
    const menu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' });

    expect(within(menu).getByRole('menuitem', { name: 'pivot_table.areas.values' })).toBeDisabled();
    expect(within(menu).getByRole('menuitem', { name: 'pivot_table.areas.available' })).toBeEnabled();
  });

  it('closes an open field menu after a pointer interaction outside its chip', async () => {
    const user = userEvent.setup();
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' }));
    expect(screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' })).toBeVisible();

    await user.click(screen.getByRole('heading', { name: 'pivot_table.areas.values' }));

    expect(screen.queryByRole('menu', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' })).toBeNull();
  });

  it('disables moving the last assigned field later while keeping moving it earlier available', async () => {
    const user = userEvent.setup();
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.dimensions.ProjectKey' }));
    const menu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.dimensions.ProjectKey' });
    expect(within(menu).getByRole('menuitem', { name: 'pivot_table.field.move_earlier' })).toBeEnabled();
    expect(within(menu).getByRole('menuitem', { name: 'pivot_table.field.move_later' })).toBeDisabled();
  });

  it('does not offer ordering actions for an Available field', async () => {
    const user = userEvent.setup();
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.dimensions.ClientKey' }));
    const menu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.dimensions.ClientKey' });
    expect(within(menu).queryByRole('menuitem', { name: 'pivot_table.field.move_earlier' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'pivot_table.field.move_later' })).not.toBeInTheDocument();
  });

  it('routes mouse and touch input to distinct sensors and announces the active field', () => {
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    expect(mockSensorCalls).toEqual([
      [MouseSensor, { activationConstraint: { distance: 5 } }],
      [TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      [KeyboardSensor, { coordinateGetter: expect.any(Function) }],
    ]);
    act(() => handleDragStart?.({ active: { id: `field:${PIVOT_KEY.USER}` } } as DragStartEvent));
    expect(screen.getByText('pivot_table.drag.picked_up:pivot_table.dimensions.UserKey')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    act(() =>
      handleDragOver?.({
        active: { id: `field:${PIVOT_KEY.USER}` },
        over: { id: 'area:columns' },
      } as DragOverEvent),
    );
    expect(screen.getByText('pivot_table.drag.destination:pivot_table.dimensions.UserKey')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'pivot_table.areas.columns' })).getByTestId('pivot-insertion'),
    ).toBeInTheDocument();

    act(() => handleDragCancel?.({ active: { id: `field:${PIVOT_KEY.USER}` } } as DragCancelEvent));
    expect(screen.getByText('pivot_table.drag.cancelled:pivot_table.dimensions.UserKey')).toBeInTheDocument();
  });

  it('reports active-drag state to the parent on drag start and on drag cancel', () => {
    const onDraggingChange = vi.fn();
    render(<PivotFieldBuilder layout={layout()} onDraggingChange={onDraggingChange} onMove={vi.fn()} />);

    act(() => handleDragStart?.({ active: { id: `field:${PIVOT_KEY.USER}` } } as DragStartEvent));
    expect(onDraggingChange).toHaveBeenCalledWith(true);

    act(() => handleDragCancel?.({ active: { id: `field:${PIVOT_KEY.USER}` } } as DragCancelEvent));
    expect(onDraggingChange).toHaveBeenCalledWith(false);
  });

  it('reports active-drag state to the parent on drag start and on drag end', () => {
    const onDraggingChange = vi.fn();
    render(<PivotFieldBuilder layout={layout()} onDraggingChange={onDraggingChange} onMove={vi.fn()} />);

    act(() => handleDragStart?.({ active: { id: `field:${PIVOT_KEY.USER}` } } as DragStartEvent));
    expect(onDraggingChange).toHaveBeenCalledWith(true);

    act(() =>
      handleDragEnd?.({
        active: { id: `field:${PIVOT_KEY.USER}` },
        over: { id: 'area:columns' },
      } as DragEndEvent),
    );
    expect(onDraggingChange).toHaveBeenCalledWith(false);
  });

  it('offers only Values and Available for a measure and protects the final measure remove action', async () => {
    const user = userEvent.setup();
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} />);

    const remove = screen.getByRole('button', { name: 'pivot_table.field.remove:pivot_table.values.DurationSum' });
    expect(remove).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' }));
    const assignedMenu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.values.DurationSum' });
    expect(within(assignedMenu).getByRole('menuitem', { name: 'pivot_table.field.move_earlier' })).toBeDisabled();
    expect(within(assignedMenu).getByRole('menuitem', { name: 'pivot_table.field.move_later' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'pivot_table.field.menu:pivot_table.values.DurationAvg' }));
    const menu = screen.getByRole('menu', { name: 'pivot_table.field.menu:pivot_table.values.DurationAvg' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .filter((item) => item.textContent?.startsWith('pivot_table.areas.'))
        .map((item) => item.textContent),
    ).toEqual(['pivot_table.areas.available', 'pivot_table.areas.values']);
  });

  it('renders an applied-filter control inside the Filters chip without changing the move contract', () => {
    const renderFilterControl = vi.fn((field: string) => <button>filter:{field}</button>);
    render(<PivotFieldBuilder layout={layout()} onMove={vi.fn()} renderFilterControl={renderFilterControl} />);

    const filters = screen.getByRole('region', { name: 'pivot_table.areas.filters' });
    expect(within(filters).getByRole('button', { name: `filter:${PIVOT_KEY.ENTRY_TYPE}` })).toBeInTheDocument();
    expect(renderFilterControl).toHaveBeenCalledWith(PIVOT_KEY.ENTRY_TYPE);
  });

  it('turns a cross-zone drop and in-zone reorder into one exact atomic move', () => {
    const onMove = vi.fn();
    render(<PivotFieldBuilder layout={layout()} onMove={onMove} />);

    act(() =>
      handleDragEnd?.({
        active: { id: `field:${PIVOT_KEY.PROJECT}` },
        over: { id: `area:columns` },
      } as DragEndEvent),
    );
    expect(onMove).toHaveBeenCalledWith({ field: PIVOT_KEY.PROJECT, destination: 'columns', index: 1 });
    expect(screen.getByText('pivot_table.drag.completed:pivot_table.dimensions.ProjectKey')).toBeInTheDocument();

    onMove.mockClear();
    act(() =>
      handleDragEnd?.({
        active: { id: `field:${PIVOT_KEY.PROJECT}` },
        over: { id: `field:${PIVOT_KEY.USER}` },
      } as DragEndEvent),
    );
    expect(onMove).toHaveBeenCalledWith({ field: PIVOT_KEY.PROJECT, destination: 'rows', index: 0 });
  });

  it('ignores invalid, cancelled, missing, and no-op drops', () => {
    const onMove = vi.fn();
    render(<PivotFieldBuilder layout={layout()} onMove={onMove} />);

    act(() => handleDragEnd?.({ active: { id: 'field:Unknown' }, over: { id: 'area:rows' } } as DragEndEvent));
    act(() =>
      handleDragEnd?.({
        active: { id: `field:${PIVOT_VALUE.DURATION_SUM}` },
        over: { id: 'area:rows' },
      } as DragEndEvent),
    );
    act(() =>
      handleDragEnd?.({
        active: { id: `field:${PIVOT_KEY.USER}` },
        over: { id: `field:${PIVOT_KEY.USER}` },
      } as DragEndEvent),
    );
    act(() => handleDragEnd?.({ active: { id: `field:${PIVOT_KEY.USER}` }, over: null } as DragEndEvent));

    expect(onMove).not.toHaveBeenCalled();
  });
});
