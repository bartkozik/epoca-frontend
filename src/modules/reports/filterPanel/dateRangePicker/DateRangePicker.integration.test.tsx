import { fireEvent, render, screen } from '@testing-library/react';
import dayjs, { Dayjs } from 'dayjs';
import DateRangePicker from './DateRangePicker';

vi.mock('react-i18next', () => ({
  initReactI18next: { init: vi.fn(), type: '3rdParty' },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: { date?: string }) => {
      if (key === 'report.dateRangePicker.input.from_date.value') return `From: ${options?.date ?? ''}`;
      if (key === 'report.dateRangePicker.input.to_date.value') return `To: ${options?.date ?? ''}`;
      if (key === 'report.dateRangePicker.button.prev_month.label') return 'Previous period';
      if (key === 'report.dateRangePicker.button.next_month.label') return 'Next period';
      if (key === 'common.reset') return 'Reset';
      if (key === 'report.dateRangePicker.text.select_date') return 'Select date';
      return key;
    },
  }),
}));

vi.mock('@/core/i18n/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

vi.mock('@/core/theme/icon', () => ({
  __esModule: true,
  default: () => null,
  icons: { arrowRight: 'arrowRight', x: 'x' },
}));

describe('DateRangePicker calendar keyboard integration', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('keeps real keyboard calendar selection local until outside close commits once', () => {
    const onCommitDateRange = vi.fn();
    const onNavigateDateRange = vi.fn();
    render(
      <DateRangePicker
        onCommitDateRange={onCommitDateRange}
        onNavigateDateRange={onNavigateDateRange}
        selectedFromDate={dayjs('2026-07-01')}
        selectedToDate={dayjs('2026-07-20')}
      />,
    );

    fireEvent.click(screen.getAllByRole('textbox')[0]);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onCommitDateRange).not.toHaveBeenCalled();
    expect(onNavigateDateRange).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    expect(onCommitDateRange.mock.calls[0][0].fromDate.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-01 00:00:00');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    expect(onCommitDateRange.mock.calls[0][0].toDate?.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-07-02 00:00:00');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expect((onCommitDateRange.mock.calls[0][1] as Dayjs).format('YYYY-MM-DD')).toBe('2026-07-29');
  });
});
