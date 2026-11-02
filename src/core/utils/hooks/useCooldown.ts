import { useCallback, useEffect, useState } from 'react';

type Cooldown = {
  cooldown: number;
  setCooldown: (seconds: number) => void;
};

export const useCooldown = (initialSeconds = 0): Cooldown => {
  const [deadline, setDeadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [cooldown, setRemainingSeconds] = useState(initialSeconds);
  const setCooldown = useCallback((seconds: number): void => {
    setDeadline(Date.now() + seconds * 1000);
    setRemainingSeconds(seconds);
  }, []);

  useEffect(() => {
    let timer: number | undefined;

    const tick = (): void => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingSeconds(Math.ceil(remaining / 1000));
      if (remaining > 0) timer = window.setTimeout(tick, Math.min(1000, remaining));
    };

    tick();

    return () => window.clearTimeout(timer);
  }, [deadline]);

  return { cooldown, setCooldown };
};
