import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportExportActions from './ReportExportActions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ReportExportActions', () => {
  it('adds an optional context class to the shared root without changing the default contract', () => {
    const props = {
      csvLoading: false,
      disabled: false,
      onCsv: vi.fn(),
      onXlsx: vi.fn(),
      xlsxLoading: false,
    };
    const view = render(<ReportExportActions {...props} className="pivot-compact-actions" />);

    expect(screen.getByTestId('report-export-actions')).toHaveClass('pivot-compact-actions');

    view.rerender(<ReportExportActions {...props} />);
    expect(screen.getByTestId('report-export-actions')).not.toHaveClass('pivot-compact-actions');
  });

  it('keeps translated accessible names on real medium contained buttons during independent loading states', () => {
    const props = {
      csvLoading: false,
      disabled: false,
      onCsv: vi.fn(),
      onXlsx: vi.fn(),
      xlsxLoading: true,
    };
    const { rerender } = render(<ReportExportActions {...props} />);

    expect(screen.getByTestId('report-export-actions')).toBeVisible();
    expect(screen.getByText('report.report_board.text.download_report')).toBeVisible();

    const xlsxButton = screen.getByRole('button', { name: 'report.report_board.button.xls.label' });
    const csvButton = screen.getByRole('button', { name: 'report.report_board.button.csv.label' });

    expect(xlsxButton).toBeDisabled();
    expect(xlsxButton).not.toHaveTextContent('report.report_board.button.xls.label');
    expect(csvButton).toBeEnabled();
    expect(csvButton).toHaveTextContent('report.report_board.button.csv.label');

    for (const button of [xlsxButton, csvButton]) {
      expect(button).toHaveClass('size-medium', 'contained');
    }

    rerender(<ReportExportActions {...props} csvLoading xlsxLoading={false} />);

    expect(screen.getByRole('button', { name: 'report.report_board.button.xls.label' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'report.report_board.button.xls.label' })).toHaveTextContent(
      'report.report_board.button.xls.label',
    );
    expect(screen.getByRole('button', { name: 'report.report_board.button.csv.label' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'report.report_board.button.csv.label' })).not.toHaveTextContent(
      'report.report_board.button.csv.label',
    );
  });

  it('combines the shared disabled state with each loading state', () => {
    render(<ReportExportActions csvLoading={false} disabled onCsv={vi.fn()} onXlsx={vi.fn()} xlsxLoading={false} />);

    expect(screen.getByRole('button', { name: 'report.report_board.button.xls.label' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'report.report_board.button.csv.label' })).toBeDisabled();
  });

  it('calls each export handler once', async () => {
    const user = userEvent.setup();
    const onCsv = vi.fn();
    const onXlsx = vi.fn();
    render(
      <ReportExportActions csvLoading={false} disabled={false} onCsv={onCsv} onXlsx={onXlsx} xlsxLoading={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'report.report_board.button.xls.label' }));
    await user.click(screen.getByRole('button', { name: 'report.report_board.button.csv.label' }));

    expect(onXlsx).toHaveBeenCalledTimes(1);
    expect(onCsv).toHaveBeenCalledTimes(1);
  });
});
