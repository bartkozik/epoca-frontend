import { z } from 'zod';
import { PaginatedResultSchema } from './paginatedResult.model';

describe('PaginatedResultSchema', () => {
  const schema = PaginatedResultSchema(z.object({ id: z.string() }));

  it('accepts a count and matching results array', () => {
    const result = schema.parse({ count: 2, results: [{ id: 'a' }, { id: 'b' }] });
    expect(result).toEqual({ count: 2, results: [{ id: 'a' }, { id: 'b' }] });
  });

  it('throws on a malformed count -- a real pagination consumer needs this to fail loudly', () => {
    expect(() => schema.parse({ count: -1, results: [] })).toThrow();
    expect(() => schema.parse({ count: 'not-a-number', results: [] })).toThrow();
  });

  it('drops an item that fails the item schema instead of throwing', () => {
    const result = schema.parse({ count: 2, results: [{ id: 'a' }, { id: 1 }] });
    expect(result.results).toEqual([{ id: 'a' }]);
  });
});
