import { fetchPaginatedWithRetry, type PaginatedResult } from './fetch-paginated-with-retry';

const identity = (page: PaginatedResult<string>): PaginatedResult<string> => page;

const axiosError = (status?: number): Error => {
  const error = new Error('fetch failed') as Error & { isAxiosError: boolean; response?: { status: number } };
  error.isAxiosError = true;
  if (status !== undefined) error.response = { status };
  return error;
};

describe('fetchPaginatedWithRetry', () => {
  it('returns a complete first page without retrying or notifying', async () => {
    const fetchAndParse = vi.fn<() => Promise<PaginatedResult<string>>>().mockResolvedValue({
      count: 2,
      results: ['a', 'b'],
    });
    const onIncomplete = vi.fn();

    const result = await fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete);

    expect(result).toEqual({ count: 2, results: ['a', 'b'] });
    expect(fetchAndParse).toHaveBeenCalledTimes(1);
    expect(onIncomplete).not.toHaveBeenCalled();
  });

  it('retries exactly once when the first page is incomplete, then returns the complete retry without notifying', async () => {
    const fetchAndParse = vi
      .fn<() => Promise<PaginatedResult<string>>>()
      .mockResolvedValueOnce({ count: 2, results: ['a'] })
      .mockResolvedValueOnce({ count: 2, results: ['a', 'b'] });
    const onIncomplete = vi.fn();

    const result = await fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete);

    expect(result).toEqual({ count: 2, results: ['a', 'b'] });
    expect(fetchAndParse).toHaveBeenCalledTimes(2);
    expect(onIncomplete).not.toHaveBeenCalled();
  });

  it('retries exactly once, notifies exactly once, and still returns the incomplete data when both attempts are incomplete', async () => {
    const fetchAndParse = vi.fn<() => Promise<PaginatedResult<string>>>().mockResolvedValue({
      count: 2,
      results: ['a'],
    });
    const onIncomplete = vi.fn();

    const result = await fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete);

    expect(result).toEqual({ count: 2, results: ['a'] });
    expect(fetchAndParse).toHaveBeenCalledTimes(2);
    expect(onIncomplete).toHaveBeenCalledTimes(1);
  });

  it('never throws on an incomplete page -- incompleteness is a degraded-but-valid result, not an error', async () => {
    const fetchAndParse = vi.fn<() => Promise<PaginatedResult<string>>>().mockResolvedValue({
      count: 5,
      results: [],
    });
    const onIncomplete = vi.fn();

    await expect(fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete)).resolves.toEqual({
      count: 5,
      results: [],
    });
  });

  it('falls back to the first attempt and still notifies when the retry itself rejects (e.g. a transient 503)', async () => {
    const fetchAndParse = vi
      .fn<() => Promise<PaginatedResult<string>>>()
      .mockResolvedValueOnce({ count: 2, results: ['a'] })
      .mockRejectedValueOnce(axiosError(503));
    const onIncomplete = vi.fn();

    const result = await fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete);

    expect(result).toEqual({ count: 2, results: ['a'] });
    expect(fetchAndParse).toHaveBeenCalledTimes(2);
    expect(onIncomplete).toHaveBeenCalledTimes(1);
  });

  it('propagates a non-transient retry failure (e.g. a 401) instead of swallowing it', async () => {
    const unauthorized = axiosError(401);
    const fetchAndParse = vi
      .fn<() => Promise<PaginatedResult<string>>>()
      .mockResolvedValueOnce({ count: 2, results: ['a'] })
      .mockRejectedValueOnce(unauthorized);
    const onIncomplete = vi.fn();

    await expect(fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete)).rejects.toBe(unauthorized);
    expect(fetchAndParse).toHaveBeenCalledTimes(2);
    expect(onIncomplete).not.toHaveBeenCalled();
  });

  it('treats a retry failure with no response (network drop) as transient and falls back to the first attempt', async () => {
    const fetchAndParse = vi
      .fn<() => Promise<PaginatedResult<string>>>()
      .mockResolvedValueOnce({ count: 2, results: ['a'] })
      .mockRejectedValueOnce(axiosError());
    const onIncomplete = vi.fn();

    const result = await fetchPaginatedWithRetry(fetchAndParse, identity, onIncomplete);

    expect(result).toEqual({ count: 2, results: ['a'] });
    expect(fetchAndParse).toHaveBeenCalledTimes(2);
    expect(onIncomplete).toHaveBeenCalledTimes(1);
  });

  it('uses the getPage selector to locate a nested page before deciding to retry', async () => {
    interface Nested {
      workUnits: PaginatedResult<string>;
      draftIds: string[];
    }

    const fetchAndParse = vi
      .fn<() => Promise<Nested>>()
      .mockResolvedValueOnce({ workUnits: { count: 2, results: ['a'] }, draftIds: [] })
      .mockResolvedValueOnce({ workUnits: { count: 2, results: ['a', 'b'] }, draftIds: [] });
    const onIncomplete = vi.fn();

    const result = await fetchPaginatedWithRetry(fetchAndParse, (r) => r.workUnits, onIncomplete);

    expect(result).toEqual({ workUnits: { count: 2, results: ['a', 'b'] }, draftIds: [] });
    expect(fetchAndParse).toHaveBeenCalledTimes(2);
    expect(onIncomplete).not.toHaveBeenCalled();
  });
});
