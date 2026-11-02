import { orderMultiSearchItems } from './orderMultiSearchItems';

const items = [
  { label: 'Zulu', value: 'z' },
  { label: 'alpha', value: 'a' },
  { label: 'Łódź', value: 'l' },
  { label: 'Old', value: 'o', archivedStatus: true },
  { label: 'Beta', value: 'b' },
];

describe('orderMultiSearchItems', () => {
  it('orders selected, then the rest, then archived, each alphabetically for the locale', () => {
    expect(orderMultiSearchItems(items, new Set(['z']), 'pl')).toEqual([
      { value: 'z', group: 'selected' },
      { value: 'a', group: 'active' },
      { value: 'b', group: 'active' },
      { value: 'l', group: 'active' },
      { value: 'o', group: 'archived' },
    ]);
  });

  it('moves options without data to the inactive group and keeps archived options that have data', () => {
    const meta = { a: { inactive: true }, o: { inactive: false }, b: { inactive: true } };
    expect(orderMultiSearchItems(items, new Set(['b']), 'en', meta)).toEqual([
      { value: 'b', group: 'selected' },
      { value: 'l', group: 'active' },
      { value: 'o', group: 'active' },
      { value: 'z', group: 'active' },
      { value: 'a', group: 'inactive' },
    ]);
  });

  it('keeps a selected archived option among the selected ones', () => {
    expect(orderMultiSearchItems(items, new Set(['o']), 'en')[0]).toEqual({ value: 'o', group: 'selected' });
  });
});
