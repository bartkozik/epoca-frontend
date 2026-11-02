export const LIVE_FETCH_TIMEOUT_MS = 15_000;
export const LIVE_LIFECYCLE_TIMEOUT_MS = 120_000;
export const LIVE_FETCH_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const responseLimitError = (): Error => new Error('Live fetch response body exceeds its byte ceiling');

const bufferResponseBody = async (
  response: Response,
  signal: AbortSignal,
  maxResponseBytes: number
): Promise<Response> => {
  const responseInit: ResponseInit = {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  };
  if (!response.body) {
    signal.throwIfAborted();
    return new Response(null, responseInit);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      await response.body.cancel(responseLimitError()).catch(() => undefined);
      throw new Error('Live fetch response Content-Length is malformed');
    }
    if (Number(contentLength) > maxResponseBytes) {
      await response.body.cancel(responseLimitError()).catch(() => undefined);
      throw responseLimitError();
    }
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let cancellation: Promise<void> | undefined;
  const cancelBody = (): void => {
    cancellation ??= reader.cancel(signal.reason).then(
      () => undefined,
      () => undefined
    );
  };
  signal.addEventListener('abort', cancelBody, { once: true });
  if (signal.aborted) cancelBody();

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxResponseBytes - byteLength) {
        await reader.cancel(responseLimitError()).catch(() => undefined);
        throw responseLimitError();
      }
      chunks.push(value.slice());
      byteLength += value.byteLength;
    }
    if (signal.aborted) {
      await cancellation;
      signal.throwIfAborted();
    }

    let body = chunks[0] ?? new Uint8Array(0);
    if (chunks.length > 1) {
      body = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    return new Response(body, responseInit);
  } catch (error) {
    if (signal.aborted) {
      cancelBody();
      await cancellation;
      signal.throwIfAborted();
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', cancelBody);
    reader.releaseLock();
  }
};

export const boundedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  timeoutMs = LIVE_FETCH_TIMEOUT_MS,
  maxResponseBytes = LIVE_FETCH_MAX_RESPONSE_BYTES
): Promise<Response> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Live fetch timeout must be positive');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new Error('Live fetch response byte ceiling must be a positive safe integer');
  }
  init.signal?.throwIfAborted();
  const controller = new AbortController();
  const callerSignal = init.signal;
  const relayAbort = (): void => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) relayAbort();
  else callerSignal?.addEventListener('abort', relayAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Live fetch timed out', 'TimeoutError')), timeoutMs);
  try {
    const response = await fetcher(input, { ...init, signal: controller.signal });
    return await bufferResponseBody(response, controller.signal, maxResponseBytes);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', relayAbort);
  }
};

export const withLifecycleDeadline = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  label: string,
  timeoutMs = LIVE_LIFECYCLE_TIMEOUT_MS
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Live lifecycle timeout must be positive');
  const controller = new AbortController();
  const deadlineError = new Error(`${label} exceeded its hard deadline`);
  let deadlineReached = false;
  const timer = setTimeout(() => {
    deadlineReached = true;
    controller.abort(deadlineError);
  }, timeoutMs);
  try {
    const result = await operation(controller.signal);
    if (deadlineReached) throw deadlineError;
    return result;
  } catch (error) {
    if (deadlineReached) {
      if (error instanceof AggregateError && error.errors.includes(deadlineError)) throw error;
      throw deadlineError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
