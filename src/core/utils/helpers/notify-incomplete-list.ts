import { addToast } from '@/core/providers/toastProvider';
import i18n from 'i18next';

export function notifyIncompleteList(key: string): void {
  addToast({ content: i18n.t(key), type: 'warning' });
}
