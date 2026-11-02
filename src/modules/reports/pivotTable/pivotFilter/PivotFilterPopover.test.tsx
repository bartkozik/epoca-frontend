import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compile } from 'sass';
import type { Mock } from 'vitest';
import { PIVOT_KEY } from '../constants';
import type { PivotFilter, PivotFilterMember, PivotFilterValue } from '../types';
import PivotFilterPopover from './PivotFilterPopover';

vi.mock('react-i18next', () => ({
  initReactI18next: { init: vi.fn(), type: '3rdParty' },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, params?: Record<string, string | number>) => `${key}${params?.field ? `:${params.field}` : ''}`,
  }),
}));

const UUID_A = '00000000-0000-0000-0000-000000000001';
const UUID_B = '00000000-0000-0000-0000-000000000002';
const UUID_MISSING = '00000000-0000-0000-0000-000000000003';
const labels = new Map<PivotFilterValue, string>([
  [UUID_A, 'Alice'],
  [UUID_B, 'Bob'],
  [UUID_MISSING, 'Former user'],
]);
const members: PivotFilterMember[] = [
  { value: UUID_B, available: true },
  { value: UUID_MISSING, available: false },
  { value: UUID_A, available: true },
];
const filter: PivotFilter = { key: PIVOT_KEY.USER, includedValues: [UUID_A, UUID_MISSING] };
const popoverCss = compile('src/modules/reports/pivotTable/pivotFilter/PivotFilterPopover.module.scss', {
  loadPaths: ['src'],
}).css;
const triggerRule = popoverCss.match(/\.trigger\s*\{([^}]*)\}/)?.[1] ?? '';

const renderPopover = (onApply = vi.fn(), onOpenChange?: Mock): { onApply: Mock } => {
  render(
    <PivotFilterPopover
      filter={filter}
      members={members}
      onApply={onApply}
      onOpenChange={onOpenChange}
      resolveLabel={(value) => labels.get(value) ?? String(value)}
    />,
  );
  return { onApply };
};

describe('PivotFilterPopover', () => {
  it('keeps the filter trigger visibly inset inside the 40px field chip', () => {
    expect(triggerRule).toContain('height: 32px;');
    expect(triggerRule).toContain('min-height: 0;');
    expect(triggerRule).toContain('padding: 0 10px;');
    expect(triggerRule).toContain('font-size: 12px;');
    expect(triggerRule).toContain('font-weight: 500;');
  });

  it('keeps changes in a draft, cancels them, and applies exactly once', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPopover();
    const trigger = screen.getByRole('button', { name: 'pivot_table.filter.configure:pivot_table.dimensions.UserKey' });

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'pivot_table.filter.title:pivot_table.dimensions.UserKey' });
    expect(within(dialog).getByRole('checkbox', { name: 'Alice' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Bob' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Former user' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Bob' }));
    expect(onApply).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'common.cancel' }));

    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole('checkbox', { name: 'Bob' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Bob' }));
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith([UUID_A, UUID_MISSING, UUID_B]);
  });

  it('represents Select all as null and prevents applying an empty selection', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPopover();
    await user.click(
      screen.getByRole('button', { name: 'pivot_table.filter.configure:pivot_table.dimensions.UserKey' }),
    );
    await user.click(screen.getByRole('button', { name: 'common.clear' }));
    expect(screen.getByRole('button', { name: 'common.apply' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'common.select_all' }));
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it('keeps selected unavailable values in a trailing group and lets the user remove them', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPopover();
    await user.click(
      screen.getByRole('button', { name: 'pivot_table.filter.configure:pivot_table.dimensions.UserKey' }),
    );
    const available = screen.getByRole('group', { name: 'pivot_table.filter.available' });
    const unavailable = screen.getByRole('group', { name: 'pivot_table.filter.unavailable' });
    expect(within(available).queryByText('Former user')).not.toBeInTheDocument();
    expect(within(unavailable).getByText('Former user')).toBeInTheDocument();
    await user.click(within(unavailable).getByRole('checkbox', { name: 'Former user' }));
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onApply).toHaveBeenCalledWith([UUID_A]);
  });

  it('filters only the presentation and Escape restores the trigger without applying', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPopover();
    const trigger = screen.getByRole('button', { name: 'pivot_table.filter.configure:pivot_table.dimensions.UserKey' });
    await user.click(trigger);
    await user.type(screen.getByRole('searchbox', { name: 'common.search' }), 'bob');
    expect(screen.getByRole('checkbox', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Alice' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('reports open state to the parent on open and on cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderPopover(vi.fn(), onOpenChange);
    const trigger = screen.getByRole('button', { name: 'pivot_table.filter.configure:pivot_table.dimensions.UserKey' });

    await user.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reports open state to the parent on open and on apply', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderPopover(vi.fn(), onOpenChange);
    const trigger = screen.getByRole('button', { name: 'pivot_table.filter.configure:pivot_table.dimensions.UserKey' });

    await user.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
