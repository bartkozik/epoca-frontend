import { Dispatch, SetStateAction, useEffect, useState } from 'react';

// Local state that re-syncs whenever `value` changes, but stays independently settable in
// between -- e.g. a dropdown's filterable items arriving asynchronously after mount, while a
// selection made against the current items can still update the state locally before the next
// external change lands.
export function useSyncedState<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(value);

  // Identity-based, not content-based: a new reference clobbers a local override made since the
  // last render, even if it's deep-equal to the previous value (e.g. an unmemoized array/object).
  useEffect(() => setState(value), [value]);

  return [state, setState];
}
