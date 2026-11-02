import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PIVOT_KEY } from '../constants';
import PivotShapeSelect from './PivotShapeSelect';
import type { PivotShapeOption } from './usePivotShapeURL';

const labels: Record<string, string> = {
  'pivot_table.shapes.levels.ClientKey': 'klienci',
  'pivot_table.shapes.levels.MonthYearKey': 'miesiące',
  'pivot_table.shapes.levels.ProjectKey': 'projekty',
  'pivot_table.shapes.levels.UserKey': 'ludzie',
};
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => labels[key] ?? key }) }));

const options: PivotShapeOption[] = [
  {
    levels: [PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.USER],
    columns: [],
    url: '/pivot-table?rows=MonthYearKey&rows=UserKey&values=DurationSum',
  },
  {
    levels: [PIVOT_KEY.CLIENT, PIVOT_KEY.PROJECT, PIVOT_KEY.USER],
    columns: [],
    url: '/pivot-table?rows=ClientKey&rows=ProjectKey&rows=UserKey&values=DurationSum',
  },
  {
    levels: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
    columns: [PIVOT_KEY.MONTH_YEAR],
    url: '/pivot-table?rows=UserKey&rows=ProjectKey&columns=MonthYearKey&values=DurationSum',
  },
];

describe('PivotShapeSelect', () => {
  it('names each option after its row levels and column fields and opens the chosen URL', async () => {
    const onSelect = vi.fn();
    render(<PivotShapeSelect options={options} selectedURL={options[0].url} onSelect={onSelect} />);
    const select = screen.getByRole('combobox', { name: 'pivot_table.shapes.label' });

    expect(select).toHaveValue(options[0].url);
    expect(screen.getByRole('option', { name: 'Miesiące → ludzie' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ludzie → projekty × miesiące' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'pivot_table.shapes.custom' })).not.toBeInTheDocument();

    await userEvent.selectOptions(select, 'Klienci → projekty → ludzie');
    expect(onSelect).toHaveBeenCalledWith(options[1].url);
  });

  it('names a layout that matches no option as custom', () => {
    render(<PivotShapeSelect options={options} selectedURL={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'pivot_table.shapes.label' })).toHaveValue('custom');
    expect(screen.getByRole('option', { name: 'pivot_table.shapes.custom' })).toBeDisabled();
  });
});
