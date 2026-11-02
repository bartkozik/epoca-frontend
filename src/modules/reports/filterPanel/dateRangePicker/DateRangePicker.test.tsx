import enTranslation from '@/core/i18n/locales/en/translation.json';
import plTranslation from '@/core/i18n/locales/pl/translation.json';
import type { ReportDateRange } from '@/modules/reports/filterPanel/reportDateRange';
import { StrictMode } from 'react';
import { fireEvent, render, RenderResult, screen } from '@testing-library/react';
import dayjs, { Dayjs } from 'dayjs';
import type { Mock } from 'vitest';
import DateRangePicker from './DateRangePicker';

let mockLanguage = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mockLanguage },
    t: (key: string, options?: { date?: string }) => {
      if (key === 'report.dateRangePicker.input.from_date.value')
        return `${mockLanguage === 'pl' ? 'Od' : 'From'}: ${options?.date ?? ''}`;
      if (key === 'report.dateRangePicker.input.to_date.value')
        return `${mockLanguage === 'pl' ? 'Do' : 'To'}: ${options?.date ?? ''}`;
      if (key === 'report.dateRangePicker.button.prev_month.label')
        return mockLanguage === 'pl' ? 'Poprzedni okres' : 'Previous period';
      if (key === 'report.dateRangePicker.button.next_month.label')
        return mockLanguage === 'pl' ? 'Następny okres' : 'Next period';
      if (key === 'common.reset') return 'Reset';
      if (key === 'report.dateRangePicker.text.select_date') return 'Select date';
      return key;
    },
  }),
}));

vi.mock('@/core/theme/icon', () => ({
  __esModule: true,
  default: () => null,
  icons: { arrowRight: 'arrowRight', x: 'x' },
}));

vi.mock('@/core/utils/helpers', () => ({
  DATE_FORMAT: { DAY_WITH_DOT: 'DD.MM.YYYY' },
}));

vi.mock('@/core/utils/hooks', async () => ({
  ...(await vi.importActual('@/core/utils/hooks/useKeyDown')),
  ...(await vi.importActual('@/core/utils/hooks/useOnClickOutside')),
}));

vi.mock('@/core/theme/dateSelector', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const dayjsModule = await vi.importActual<typeof import('dayjs')>('dayjs');
  const actualDayjs = (dayjsModule as unknown as { default?: typeof dayjsModule }).default ?? dayjsModule;

  return {
    __esModule: true,
    default: function MockDateSelector({
      isDateSelectorOpen,
      onSelectDate,
      setIsDateSelectorOpen,
    }: {
      isDateSelectorOpen: boolean;
      onSelectDate: (date: Dayjs) => void;
      setIsDateSelectorOpen: (isOpen: boolean) => void;
    }) {
      React.useEffect(() => {
        if (!isDateSelectorOpen) return;

        const closeOnEscape = (event: KeyboardEvent): void => {
          if (event.key === 'Escape') setIsDateSelectorOpen(false);
        };

        globalThis.document.addEventListener('keydown', closeOnEscape);
        return () => globalThis.document.removeEventListener('keydown', closeOnEscape);
      }, [isDateSelectorOpen, setIsDateSelectorOpen]);

      return (
        <div data-testid="date-selector">
          <button onClick={() => onSelectDate(actualDayjs('2026-07-05'))}>Select July 5</button>
          <button onClick={() => setIsDateSelectorOpen(false)}>Close selector</button>
        </div>
      );
    },
  };
});

interface PickerSetup extends RenderResult {
  onCommitDateRange: Mock;
  onNavigateDateRange: Mock;
}

const renderPicker = (
  selectedFromDate: Dayjs = dayjs('2026-07-01'),
  selectedToDate: Dayjs | null = dayjs('2026-07-20'),
): PickerSetup => {
  const onCommitDateRange = vi.fn();
  const onNavigateDateRange = vi.fn();
  const view = render(
    <DateRangePicker
      onCommitDateRange={onCommitDateRange}
      onNavigateDateRange={onNavigateDateRange}
      selectedFromDate={selectedFromDate}
      selectedToDate={selectedToDate}
    />,
  );

  return { ...view, onCommitDateRange, onNavigateDateRange };
};

const getFromInput = (): HTMLInputElement => screen.getAllByRole('textbox')[0] as HTMLInputElement;
const getToInput = (): HTMLInputElement => screen.getAllByRole('textbox')[1] as HTMLInputElement;

const expectCommittedRange = (range: ReportDateRange, fromDate: string, toDate: string | null): void => {
  expect(range.fromDate.format('YYYY-MM-DD HH:mm:ss')).toBe(`${fromDate} 00:00:00`);
  expect(range.toDate?.format('YYYY-MM-DD HH:mm:ss') ?? null).toBe(toDate ? `${toDate} 00:00:00` : null);
};

describe('DateRangePicker controlled draft', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockLanguage = 'en';
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
  });

  it('emits the same previous and next directions from buttons and the keyboard while closed', () => {
    const { onNavigateDateRange } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    expect(onNavigateDateRange.mock.calls.map(([direction]) => direction)).toEqual([
      'previous',
      'next',
      'previous',
      'next',
    ]);
  });

  it.each([
    ['previous', 'Previous period'],
    ['next', 'Next period'],
  ] as const)('discards an open dirty draft and navigates %s exactly once from its button', (direction, label) => {
    const { onCommitDateRange, onNavigateDateRange } = renderPicker();
    fireEvent.click(getFromInput());
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: 05.07.2026' } });

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(onCommitDateRange).not.toHaveBeenCalled();
    expect(onNavigateDateRange).toHaveBeenCalledTimes(1);
    expect(onNavigateDateRange).toHaveBeenCalledWith(direction);
    expect(screen.queryByTestId('date-selector')).not.toBeInTheDocument();
    expect(getFromInput()).toHaveValue('From: 01.07.2026');
    expect(getToInput()).toHaveValue('To: 20.07.2026');
  });

  it.each([
    ['From', getFromInput, 'ArrowLeft'],
    ['To', getToInput, 'ArrowRight'],
  ])('does not navigate while the closed-selector %s input is focused', (_name, getInput, key) => {
    const { onNavigateDateRange } = renderPicker();
    const input = getInput();
    input.focus();

    fireEvent.keyDown(document, { key });

    expect(input).toHaveFocus();
    expect(onNavigateDateRange).not.toHaveBeenCalled();
  });

  it('keeps arrow keys local while another keyboard control is focused', () => {
    const { onNavigateDateRange } = renderPicker();
    const keyboardControl = document.createElement('button');
    document.body.append(keyboardControl);
    keyboardControl.focus();

    fireEvent.keyDown(keyboardControl, { key: 'ArrowRight' });

    expect(keyboardControl).toHaveFocus();
    expect(onNavigateDateRange).not.toHaveBeenCalled();
    keyboardControl.remove();
  });

  it('keeps arrow keys local after Enter leaves input focus, while period buttons still navigate', () => {
    const { onCommitDateRange, onNavigateDateRange } = renderPicker();
    const toInput = getToInput();
    toInput.focus();
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: 05.07.2026' } });
    fireEvent.change(toInput, { target: { name: 'to', value: 'To: 10.07.2026' } });

    fireEvent.keyDown(toInput, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    expect(toInput).toHaveFocus();
    expect(onNavigateDateRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    expect(onNavigateDateRange.mock.calls.map(([direction]) => direction)).toEqual(['previous', 'next']);
  });

  it('commits a valid typed range exactly once on Enter', () => {
    const { onCommitDateRange } = renderPicker();

    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: 05.07.2026' } });
    fireEvent.change(getToInput(), { target: { name: 'to', value: 'To: 10.07.2026' } });
    fireEvent.keyDown(getToInput(), { key: 'Enter' });

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expectCommittedRange(onCommitDateRange.mock.calls[0][0], '2026-07-05', '2026-07-10');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expect((onCommitDateRange.mock.calls[0][1] as Dayjs).format('YYYY-MM-DD')).toBe('2026-07-29');
  });

  it('commits a valid dirty range exactly once on outside mousedown', () => {
    const { onCommitDateRange } = renderPicker();
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: 05.07.2026' } });
    fireEvent.change(getToInput(), { target: { name: 'to', value: 'To: 10.07.2026' } });

    fireEvent.mouseDown(document.body);

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expectCommittedRange(onCommitDateRange.mock.calls[0][0], '2026-07-05', '2026-07-10');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expect((onCommitDateRange.mock.calls[0][1] as Dayjs).format('YYYY-MM-DD')).toBe('2026-07-29');
  });

  it('reverts both visible inputs and emits nothing for an invalid or incomplete draft', () => {
    const { onCommitDateRange } = renderPicker();
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: invalid' } });
    fireEvent.change(getToInput(), { target: { name: 'to', value: 'To: ' } });

    fireEvent.keyDown(getFromInput(), { key: 'Enter' });

    expect(onCommitDateRange).not.toHaveBeenCalled();
    expect(getFromInput()).toHaveValue('From: 01.07.2026');
    expect(getToInput()).toHaveValue('To: 20.07.2026');
  });

  it('does not emit on mount or when an unchanged selector closes via visibility or Escape', () => {
    const { onCommitDateRange } = renderPicker();

    expect(onCommitDateRange).not.toHaveBeenCalled();
    fireEvent.click(getFromInput());
    fireEvent.click(screen.getByRole('button', { name: 'Close selector' }));
    fireEvent.click(getToInput());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCommitDateRange).not.toHaveBeenCalled();
  });

  it('displays captured today for an open committed end without committing during a StrictMode open and close', () => {
    const onCommitDateRange = vi.fn();
    const onNavigateDateRange = vi.fn();

    render(
      <StrictMode>
        <DateRangePicker
          onCommitDateRange={onCommitDateRange}
          onNavigateDateRange={onNavigateDateRange}
          selectedFromDate={dayjs('2026-07-01')}
          selectedToDate={null}
        />
      </StrictMode>,
    );

    expect(getToInput()).toHaveValue('To: 29.07.2026');
    fireEvent.click(getToInput());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCommitDateRange).not.toHaveBeenCalled();
  });

  it('resets an open dirty draft once without first committing that draft', () => {
    const { onCommitDateRange } = renderPicker(dayjs('2026-06-01'), dayjs('2026-06-30'));
    fireEvent.click(getFromInput());
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: 05.06.2026' } });
    const resetButton = screen.getByRole('button', { name: 'Reset' });

    fireEvent.mouseDown(resetButton);
    fireEvent.click(resetButton);

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expectCommittedRange(onCommitDateRange.mock.calls[0][0], '2026-07-01', '2026-07-31');
    expect(getFromInput()).toHaveValue('From: 01.07.2026');
    expect(getToInput()).toHaveValue('To: 31.07.2026');
  });

  it('uses a fresh action-boundary day when a long-mounted picker resets across a month boundary', () => {
    vi.setSystemTime(new Date('2026-07-31T23:59:00'));
    const { onCommitDateRange } = renderPicker(dayjs('2026-06-01'), dayjs('2026-06-30'));
    fireEvent.click(getFromInput());
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: 05.06.2026' } });

    vi.setSystemTime(new Date('2026-08-01T00:01:00'));
    const resetButton = screen.getByRole('button', { name: 'Reset' });
    fireEvent.mouseDown(resetButton);
    fireEvent.click(resetButton);

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expectCommittedRange(onCommitDateRange.mock.calls[0][0], '2026-08-01', '2026-08-31');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expect((onCommitDateRange.mock.calls[0][1] as Dayjs).format('YYYY-MM-DD')).toBe('2026-08-01');
    expect(getFromInput()).toHaveValue('From: 01.08.2026');
    expect(getToInput()).toHaveValue('To: 31.08.2026');
  });

  it('refreshes the effective end when a clean committed open range is opened after midnight', () => {
    vi.setSystemTime(new Date('2026-07-31T23:59:00'));
    const { onCommitDateRange } = renderPicker(dayjs('2026-07-01'), null);
    expect(getToInput()).toHaveValue('To: 31.07.2026');

    vi.setSystemTime(new Date('2026-08-01T00:01:00'));
    fireEvent.click(getToInput());

    expect(getToInput()).toHaveValue('To: 01.08.2026');
    expect(onCommitDateRange).not.toHaveBeenCalled();
  });

  it('uses a fresh effective end when reverting an invalid open-range draft after midnight', () => {
    vi.setSystemTime(new Date('2026-07-31T23:59:00'));
    const { onCommitDateRange } = renderPicker(dayjs('2026-07-01'), null);
    fireEvent.change(getToInput(), { target: { name: 'to', value: 'To: invalid' } });

    vi.setSystemTime(new Date('2026-08-01T00:01:00'));
    fireEvent.keyDown(getToInput(), { key: 'Enter' });

    expect(getFromInput()).toHaveValue('From: 01.07.2026');
    expect(getToInput()).toHaveValue('To: 01.08.2026');
    expect(onCommitDateRange).not.toHaveBeenCalled();
  });

  it('synchronizes a clean draft when committed parent props change', () => {
    const { onCommitDateRange, onNavigateDateRange, rerender } = renderPicker();

    rerender(
      <DateRangePicker
        onCommitDateRange={onCommitDateRange}
        onNavigateDateRange={onNavigateDateRange}
        selectedFromDate={dayjs('2026-08-01')}
        selectedToDate={dayjs('2026-08-31')}
      />,
    );

    expect(getFromInput()).toHaveValue('From: 01.08.2026');
    expect(getToInput()).toHaveValue('To: 31.08.2026');
    expect(onCommitDateRange).not.toHaveBeenCalled();
  });

  it('preserves a dirty edit across prop changes, then invalid close reverts to the latest committed props', () => {
    const { onCommitDateRange, onNavigateDateRange, rerender } = renderPicker();
    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'From: invalid' } });

    rerender(
      <DateRangePicker
        onCommitDateRange={onCommitDateRange}
        onNavigateDateRange={onNavigateDateRange}
        selectedFromDate={dayjs('2026-08-01')}
        selectedToDate={dayjs('2026-08-31')}
      />,
    );

    expect(getFromInput()).toHaveValue('From: invalid');
    fireEvent.mouseDown(document.body);
    expect(getFromInput()).toHaveValue('From: 01.08.2026');
    expect(getToInput()).toHaveValue('To: 31.08.2026');
    expect(onCommitDateRange).not.toHaveBeenCalled();
  });

  it('keeps calendar selection local until a commit boundary', () => {
    const { onCommitDateRange } = renderPicker();
    fireEvent.click(getFromInput());

    fireEvent.click(screen.getByRole('button', { name: 'Select July 5' }));

    expect(onCommitDateRange).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expectCommittedRange(onCommitDateRange.mock.calls[0][0], '2026-07-05', '2026-07-20');
  });

  it('strictly parses and commits Polish input prefixes', () => {
    mockLanguage = 'pl';
    const { onCommitDateRange } = renderPicker();

    fireEvent.change(getFromInput(), { target: { name: 'from', value: 'Od: 05.07.2026' } });
    fireEvent.change(getToInput(), { target: { name: 'to', value: 'Do: 10.07.2026' } });
    fireEvent.keyDown(getFromInput(), { key: 'Enter' });

    expect(onCommitDateRange).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expectCommittedRange(onCommitDateRange.mock.calls[0][0], '2026-07-05', '2026-07-10');
  });

  it('uses accurate period labels in both supported locale files', () => {
    expect(enTranslation['report.dateRangePicker.button.prev_month.label']).toBe('Previous period');
    expect(enTranslation['report.dateRangePicker.button.next_month.label']).toBe('Next period');
    expect(plTranslation['report.dateRangePicker.button.prev_month.label']).toBe('Poprzedni okres');
    expect(plTranslation['report.dateRangePicker.button.next_month.label']).toBe('Następny okres');
  });
});
