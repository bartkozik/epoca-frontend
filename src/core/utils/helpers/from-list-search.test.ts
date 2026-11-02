import { readFromListSearch, withFromListSearch } from './from-list-search';

describe('readFromListSearch', () => {
  it('reads fromListSearch off router state', () => {
    expect(readFromListSearch({ fromListSearch: '?status=Archived' })).toBe('?status=Archived');
  });

  it('returns an empty string when state has no fromListSearch', () => {
    expect(readFromListSearch({})).toBe('');
  });

  it('returns an empty string for null/undefined/non-object state', () => {
    expect(readFromListSearch(null)).toBe('');
    expect(readFromListSearch(undefined)).toBe('');
    expect(readFromListSearch('not state')).toBe('');
  });
});

describe('withFromListSearch', () => {
  it('builds a FromListSearchLocationState from a search string', () => {
    expect(withFromListSearch('?status=Archived')).toEqual({ fromListSearch: '?status=Archived' });
  });
});
