import { parseTaskIds } from './parseTaskIds';

describe('parseTaskIds', () => {
  it('returns one trimmed task ID', () => {
    expect(parseTaskIds(' CT-513 ')).toEqual(['CT-513']);
  });

  it('splits comma-separated task IDs and removes empty fragments', () => {
    expect(parseTaskIds(' CT-513, ,CT-426, CT-516 ')).toEqual(['CT-513', 'CT-426', 'CT-516']);
  });

  it.each([undefined, null, '', '   ', ', ,'])('returns an empty list for %p', (value) => {
    expect(parseTaskIds(value)).toEqual([]);
  });

  it('preserves source order and duplicates', () => {
    expect(parseTaskIds('CT-513, CT-426, CT-513')).toEqual(['CT-513', 'CT-426', 'CT-513']);
  });

  it('does not treat separators other than a comma as delimiters', () => {
    expect(parseTaskIds('CT-513; CT-426')).toEqual(['CT-513; CT-426']);
  });
});
