import type { ToastInput } from '@/core/providers/toastProvider/types';
import { isAxiosError, showToastForError } from '@/core/utils/helpers';
import i18n from 'i18next';

export function showReportExportError(error: unknown, addToast: (toast: ToastInput) => void): void {
  const errorMessage = i18n.t('toast_message.report.report_export_failed');
  if (isAxiosError(error)) {
    const statusCode = error.response?.status;
    showToastForError({
      errorMessageMap: {
        default: errorMessage,
        ...(statusCode === undefined
          ? {}
          : { [statusCode]: statusCode === 413 ? i18n.t('toast_message.report.report_export_too_large') : errorMessage }),
      },
      error,
    });
  } else {
    addToast({ content: errorMessage, type: 'error' });
  }
}
