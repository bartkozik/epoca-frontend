import { useCallback, useInsertionEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ToastContext } from './ToastContext';
import { clearToastDispatcher, setToastDispatcher } from './toastDispatcher';
import type { IToast, ToastInput } from './types';

export function ToastProvider({ children }: React.PropsWithChildren): JSX.Element {
  const [toasts, setToasts] = useState<IToast[]>([]);

  const addToastToState = useCallback(({ content, correlationId, type = 'success', timeout }: ToastInput): void => {
    setToasts((current) => [...current, { id: uuidv4(), content, correlationId, type, timeout }]);
  }, []);

  const removeToast = useCallback((id: string): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useInsertionEffect(() => {
    setToastDispatcher(addToastToState);
    return () => {
      clearToastDispatcher(addToastToState);
    };
  }, [addToastToState]);

  const value = useMemo(
    () => ({ addToast: addToastToState, removeToast, toasts }),
    [addToastToState, removeToast, toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
