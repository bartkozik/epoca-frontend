import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export function useSyncedState<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(value);

  useEffect(() => setState(value), [value]);

  return [state, setState];
}
