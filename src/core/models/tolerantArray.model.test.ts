import { z } from 'zod';
import { tolerantArray } from './tolerantArray.model';

describe('tolerantArray', () => {
  const schema = tolerantArray(z.object({ id: z.string() }));

  it('parses a well-formed array unchanged', () => {
    expect(schema.parse([{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('drops only the malformed entry, keeping the rest', () => {
    expect(schema.parse([{ id: 'a' }, { id: 1 }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('falls back to an empty array when the input is not an array at all', () => {
    expect(schema.parse('not-an-array')).toEqual([]);
  });

  it('falls back to an empty array when the input is missing', () => {
    expect(schema.parse(undefined)).toEqual([]);
  });
});
