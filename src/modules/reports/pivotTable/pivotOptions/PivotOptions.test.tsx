import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PivotOptions from './PivotOptions';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/core/theme/toggle', () => ({
  __esModule: true,
  default: ({ isChecked, label, onClick }: { isChecked: boolean; label: string; onClick: () => void }) => (
    <button aria-checked={isChecked} onClick={onClick} role="switch">
      {label}
    </button>
  ),
}));

describe('PivotOptions', () => {
  it('exposes three independent switches and sends only the toggled option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PivotOptions onChange={onChange} options={{ rowSubtotals: true, columnSubtotals: false, grandTotals: true }} />,
    );

    expect(screen.getByRole('switch', { name: 'pivot_table.options.rowSubtotals' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'pivot_table.options.columnSubtotals' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await user.click(screen.getByRole('switch', { name: 'pivot_table.options.columnSubtotals' }));
    expect(onChange).toHaveBeenCalledWith('columnSubtotals', true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
