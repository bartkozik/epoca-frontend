import { createContext, useContext } from 'react';
import type { IToast, ToastInput } from './types';

interface ToastContextValue {
  toasts: IToast[];
  addToast: (toast: ToastInput) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
