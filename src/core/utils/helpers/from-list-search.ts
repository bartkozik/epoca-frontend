export interface FromListSearchLocationState {
  fromListSearch?: string;
}

export const readFromListSearch = (state: unknown): string =>
  (state as FromListSearchLocationState | null)?.fromListSearch ?? '';

export const withFromListSearch = (search: string): FromListSearchLocationState => ({ fromListSearch: search });
