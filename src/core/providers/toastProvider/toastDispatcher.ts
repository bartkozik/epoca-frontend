import type { ToastInput } from './types';

let toastDispatcher: ((toast: ToastInput) => void) | undefined;

export function addToast(toast: ToastInput): void {
  toastDispatcher?.(toast);
}

export function setToastDispatcher(dispatcher: ((toast: ToastInput) => void) | undefined): void {
  toastDispatcher = dispatcher;
}

export function clearToastDispatcher(dispatcher: (toast: ToastInput) => void): void {
  if (toastDispatcher === dispatcher) toastDispatcher = undefined;
}
