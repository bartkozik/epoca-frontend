import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PIVOT_KEY, PIVOT_VALUE } from '../constants';
import type { PivotLayout } from '../layout/types';
import PivotFilterPopover from '../pivotFilter/PivotFilterPopover';
import type { PivotFilter } from '../types';
import PivotConfigurationModal from './PivotConfigurationModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'pivot_table.configurator.summary') {
        return `${params?.rows} rows · ${params?.columns} columns · ${params?.values} values · ${params?.filters} filters`;
      }
      return key;
    },
  }),
}));

// The new nesting-guard tests below (disableClickOutside / disableEscapeClickClose) need the
// real useOnClickOutside/useKeyDown behavior to exercise the actual Modal click-outside and
// Escape handling. Import the individual hook modules directly rather than the '@/core/utils/hooks'
// barrel: the barrel re-exports unrelated hooks (e.g. useDataFetch, useInitializeLanguage)
// that pull in the app's i18n setup and would need a much heavier mock here.
vi.mock('@/core/utils/hooks', async () => {
  const { useOnClickOutside } = await import('@/core/utils/hooks/useOnClickOutside');
  const { useKeyDown, KeyBoardEventType } = await import('@/core/utils/hooks/useKeyDown');
  return { useOnClickOutside, useKeyDown, KeyBoardEventType };
});

vi.mock('../pivotFieldBuilder', () => ({
  __esModule: true,
  default: ({
    onDraggingChange,
    onMove,
    renderFilterControl,
  }: {
    onDraggingChange?: (isDragging: boolean) => void;
    onMove: (move: { field: string; destination: 'columns'; index: number }) => unknown;
    renderFilterControl?: (field: string) => ReactNode;
  }) => (
    <div>
      <button onClick={() => onMove({ field: 'ProjectKey', destination: 'columns', index: 1 })}>move-project</button>
      <button onClick={() => onDraggingChange?.(true)}>start-drag</button>
      <button onClick={() => onDraggingChange?.(false)}>end-drag</button>
      {renderFilterControl?.('EntryTypeKey')}
    </div>
  ),
}));

vi.mock('../pivotOptions', () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (key: string, value: boolean) => unknown }) => (
    <button onClick={() => onChange('rowSubtotals', false)}>row-subtotals</button>
  ),
}));

const layout: PivotLayout = {
  rows: [PIVOT_KEY.USER],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM],
  filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: null }],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
};

describe('PivotConfigurationModal', () => {
  it('renders nothing when closed', () => {
    render(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen={false}
        layout={layout}
        onClose={vi.fn()}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the heading, summary, field builder, and options when open, and wires callbacks through', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMove = vi.fn();
    const onOptionChange = vi.fn();
    const renderFilterControl = vi.fn((field: string) => <span>filter:{field}</span>);

    render(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={onMove}
        onOptionChange={onOptionChange}
        renderFilterControl={renderFilterControl}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'pivot_table.configurator.heading' });
    expect(dialog).toHaveTextContent('1 rows · 1 columns · 1 values · 1 filters');
    expect(renderFilterControl).toHaveBeenCalledWith('EntryTypeKey');
    expect(screen.getByText('filter:EntryTypeKey')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'move-project' }));
    expect(onMove).toHaveBeenCalledWith({ field: 'ProjectKey', destination: 'columns', index: 1 });

    await user.click(screen.getByRole('button', { name: 'row-subtotals' }));
    expect(onOptionChange).toHaveBeenCalledWith('rowSubtotals', false);

    await user.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open on outside click while a filter panel is open, and closes once it is not', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PivotConfigurationModal
        isFilterPanelOpen
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open on Escape while a filter panel is open, and closes once it is not', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PivotConfigurationModal
        isFilterPanelOpen
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open on Escape while a drag is in progress, and closes once the drag ends', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'start-drag' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'end-drag' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open on outside click while a drag is in progress, and closes once the drag ends', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'start-drag' }));
    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'end-drag' }));
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the dragging flag when the modal is closed mid-drag, so a later Escape is not blocked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={onClose}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'start-drag' }));
    await user.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not open a second aria-modal dialog when a nested filter panel is opened', async () => {
    const user = userEvent.setup();
    const filter: PivotFilter = { key: PIVOT_KEY.ENTRY_TYPE, includedValues: null };

    render(
      <PivotConfigurationModal
        isFilterPanelOpen={false}
        isOpen
        layout={layout}
        onClose={vi.fn()}
        onMove={vi.fn()}
        onOptionChange={vi.fn()}
        renderFilterControl={() => (
          <PivotFilterPopover filter={filter} members={[]} onApply={vi.fn()} resolveLabel={(value) => String(value)} />
        )}
      />,
    );

    const modalDialogs = (): HTMLElement[] =>
      screen.getAllByRole('dialog').filter((dialog) => dialog.getAttribute('aria-modal') === 'true');

    expect(modalDialogs()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'pivot_table.filter.configure' }));

    expect(modalDialogs()).toHaveLength(1);
  });
});
