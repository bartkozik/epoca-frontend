// Shared "fromListSearch" router-state pattern: a list page passes `state: { fromListSearch:
// location.search }` when navigating to a details page, so the details page's back link can
// restore the filters/sort the user came from -- a plain href can't, since it constructs a fresh
// location instead of replaying history. Used by clients and projects details pages.
export interface FromListSearchLocationState {
  fromListSearch?: string;
}

export const readFromListSearch = (state: unknown): string =>
  (state as FromListSearchLocationState | null)?.fromListSearch ?? '';

export const withFromListSearch = (search: string): FromListSearchLocationState => ({ fromListSearch: search });
