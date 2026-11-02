import { useEffect, useRef } from 'react';

export const useInactivityDataPolling = (
  fetchData: () => void,
  inactivityDelay = 30000,
  pollingInterval = 60000,
  dependencies: unknown[] = [],
): void => {
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimeout = (): void => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    inactivityTimeoutRef.current = setTimeout(() => {
      startPolling();
    }, inactivityDelay);
  };

  const startPolling = (): void => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(() => {
      fetchData();
    }, pollingInterval);
  };

  const stopPolling = (): void => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    resetInactivityTimeout();

    const handleUserActivity = (): void => {
      stopPolling();
      resetInactivityTimeout();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);

    return () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      stopPolling();
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
    };
  }, [...dependencies]);
};
