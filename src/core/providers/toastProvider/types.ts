export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface IToast {
  content: string;
  id: string;
  correlationId?: string;
  timeout?: number;
  type?: ToastType;
}

export type ToastInput = {
  content: string;
  correlationId?: string;
  type?: ToastType;
  timeout?: number;
};
