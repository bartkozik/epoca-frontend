import { isAxiosError } from './is-axios-error';

export interface PaginatedResult<T> {
  count: number;
  results: T[];
}

function isIncompletePage(page: PaginatedResult<unknown>): boolean {
  return page.results.length < page.count;
}

// A retry may fall back to partial data on network/5xx errors, but 4xx errors must still reach the caller.
function isTransientRetryFailure(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) return true;
  return error.response.status >= 500;
}

export async function fetchPaginatedWithRetry<TResult>(
  fetchAndParse: () => Promise<TResult>,
  getPage: (result: TResult) => PaginatedResult<unknown>,
  onIncomplete: () => void,
): Promise<TResult> {
  let result = await fetchAndParse();

  if (isIncompletePage(getPage(result))) {
    try {
      result = await fetchAndParse();
    } catch (error) {
      if (!isTransientRetryFailure(error)) throw error;
    }
  }

  if (isIncompletePage(getPage(result))) {
    onIncomplete();
  }

  return result;
}
