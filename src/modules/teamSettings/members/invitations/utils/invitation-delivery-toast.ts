import type { ToastInput } from '@/core/providers/toastProvider/types';
import type { TFunction } from 'i18next';
import { invitationDelivery } from './invitation-management';

export function invitationDeliveryToast(deliveryStatus: string, t: TFunction): ToastInput {
  const status = invitationDelivery(deliveryStatus);

  return {
    content: t(`invitations.delivery.${status}`),
    type: status === 'Sent' ? 'success' : status === 'Failed' ? 'error' : status === 'Started' ? 'info' : 'warning',
  };
}
