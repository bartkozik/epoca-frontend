import type { ToastInput } from '@/core/providers/toastProvider';
import { ErrorResponse, isAxiosError } from '@/core/utils/helpers';
import i18n from 'i18next';

export function showUnitDeleteErrorToast(
  error: unknown,
  correlationId: string,
  addToast: (toast: ToastInput) => void,
): void {
  if (!isAxiosError(error)) return;

  const responseData = error.response?.data as ErrorResponse | undefined;
  if (responseData?.message === i18n.t('toast_message.working_time.project_is_archived')) {
    addToast({
      content: i18n.t('toast_message.working_time.no_delete_archived_unit'),
      correlationId,
      type: 'error',
    });
  } else {
    addToast({ content: i18n.t('toast_message.working_time.delete_draft_error'), correlationId, type: 'error' });
  }
}
