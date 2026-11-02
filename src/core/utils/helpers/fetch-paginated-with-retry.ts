import { isAxiosError } from './is-axios-error';

// A paginated list page can come back with fewer results than its count -- most often a backend
// race where count and results are read via two separate non-transactional queries under
// concurrent writes, confirmed present on these endpoints and normally transient. Rarer
// cause: PaginatedResultSchema/tolerantArray (see core/models/paginatedResult.model.ts) silently
// dropped a genuinely malformed row while the server's count stayed unchanged.
//
// Target UX: never block page rendering on this. Retry the fetch once; if it's still incomplete,
// return the (possibly partial) data anyway and let the caller raise a non-blocking notice via
// onIncomplete. Exactly one retry, fired on the attempt where we give up -- mirrors
// ssoAuth/hooks/useSamlAuthCheckQuery.ts's retry-once-then-notify precedent. This never throws on
// an incomplete page: incompleteness is a degraded-but-valid result, not an error.
export interface PaginatedResult<T> {
  count: number;
  results: T[];
}

function isIncompletePage(page: PaginatedResult<unknown>): boolean {
  return page.results.length < page.count;
}

// A retry failure with no response (network drop) or a 5xx is itself transient/server-side, so
// falling back to the first attempt's data still serves this helper's "never block on an
// incomplete page" goal. A definitive 4xx (401, 403, ...) is a real failure the caller's normal
// error handling must still see (e.g. session-expiry logout), so it is NOT swallowed here.
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
      // transient failure -- keep the first attempt's data; onIncomplete below still fires.
    }
  }

  if (isIncompletePage(getPage(result))) {
    onIncomplete();
  }

  return result;
}
