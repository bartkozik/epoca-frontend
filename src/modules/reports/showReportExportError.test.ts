import i18n from '@/core/i18n/i18n';
import { isAxiosError, showToastForError } from '@/core/utils/helpers';
import { showReportExportError } from './showReportExportError';

vi.mock('@/core/utils/helpers', () => ({ isAxiosError: vi.fn(), showToastForError: vi.fn() }));

const isAxiosErrorMock = vi.mocked(isAxiosError);
const showToastForErrorMock = vi.mocked(showToastForError);

describe('showReportExportError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAxiosErrorMock.mockReturnValue(true);
  });

  it.each([
    ['en', 'Report is too large. Shorten the date range or select fewer people.'],
    ['pl', 'Raport jest zbyt duży. Skróć zakres dat lub wybierz mniej osób.'],
  ])('shows recovery guidance for HTTP 413 in %s', async (language, message) => {
    const previousLanguage = i18n.language;
    try {
      await i18n.changeLanguage(language);
      const error = { response: { status: 413 } };
      const addToast = vi.fn();

      showReportExportError(error, addToast);

      expect(showToastForErrorMock).toHaveBeenCalledWith({
        errorMessageMap: {
          default: i18n.t('toast_message.report.report_export_failed'),
          413: message,
        },
        error,
      });
      expect(addToast).not.toHaveBeenCalled();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });

  it('keeps the generic message for other HTTP statuses', () => {
    const error = { response: { status: 500 } };
    showReportExportError(error, vi.fn());

    expect(showToastForErrorMock).toHaveBeenCalledWith({
      errorMessageMap: {
        default: i18n.t('toast_message.report.report_export_failed'),
        500: i18n.t('toast_message.report.report_export_failed'),
      },
      error,
    });
  });
});
