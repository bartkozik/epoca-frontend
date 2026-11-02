import api from '@/core/api';
import { addToast } from '@/core/providers/toastProvider';
import { useSamlAuthCheckQuery } from '@/modules/ssoAuth/hooks/useSamlAuthCheckQuery';
import { SamlAuthCheckSchema } from '@/modules/ssoAuth/models/samlDto.model';
import { fetchSamlAuthCheck } from '@/modules/ssoAuth/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { MockedFunction } from 'vitest';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: { get: vi.fn() },
}));

vi.mock('@/core/providers/toastProvider', () => ({ addToast: vi.fn() }));

const addToastMock = vi.mocked(addToast);

// eslint-disable-next-line vitest/unbound-method -- api.get is a vi.fn() mock, see vi.mock above.
const getMock = api.get as MockedFunction<typeof api.get>;

// The hook calls i18n.t() directly (not through react-i18next's useTranslation), and nothing in
// this test imports @/core/i18n/i18n to initialize the real singleton -- stub it to return the
// key, matching how Login.test.tsx stubs useTranslation's t for the same reason.
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

// A dedicated QueryClient per test (rather than one shared instance) so remount/retry cases can
// control cache lifetime and retryDelay independently.
const createWrapper = (queryClient: QueryClient): (({ children }: { children: ReactNode }) => ReactElement) => {
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
};

const wrapper = createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

// The hook's own `retry` option always overrides a client's defaultOptions.queries.retry, so
// retries below are driven purely by the hook -- this client only needs retryDelay:0 to avoid the
// real exponential backoff slowing the test down. A fresh QueryClient per call so an earlier
// test's cached error can't leak into a later test.
const newFastRetryWrapper = (): ReturnType<typeof createWrapper> =>
  createWrapper(new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } }));

const axiosError = (status: number): Error =>
  Object.assign(new Error(`status ${status}`), {
    isAxiosError: true,
    response: { status, config: { headers: {} } },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('SamlAuthCheckSchema', () => {
  it('parses a well-formed response', () => {
    const result = SamlAuthCheckSchema.parse({ samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' });

    expect(result).toEqual({ samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' });
  });

  it('tolerates missing/malformed samlRequest and ssoUrl instead of throwing', () => {
    const result = SamlAuthCheckSchema.parse({ samlRequest: null, ssoUrl: 42 });

    expect(result).toEqual({ samlRequest: '', ssoUrl: '' });
  });
});

describe('fetchSamlAuthCheck', () => {
  it('requests the given organization slug', async () => {
    getMock.mockResolvedValueOnce({ data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' } });

    await fetchSamlAuthCheck('acme');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/saml/authn', {
      skipConnectionErrorToast: true,
      withCredentials: true,
    });
  });

  it('parses the response through SamlAuthCheckSchema', async () => {
    getMock.mockResolvedValueOnce({ data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' } });

    const result = await fetchSamlAuthCheck('acme');

    expect(result).toEqual({ samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' });
  });
});

describe('useSamlAuthCheckQuery', () => {
  it('does not show a toast on success', async () => {
    getMock.mockResolvedValueOnce({ data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' } });

    const { result } = renderHook(() => useSamlAuthCheckQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it('retries once on a 5xx failure, then shows exactly one toast', async () => {
    getMock.mockRejectedValue(axiosError(500));

    const { result } = renderHook(() => useSamlAuthCheckQuery(), { wrapper: newFastRetryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getMock).toHaveBeenCalledTimes(2); // initial attempt + one retry
    expect(addToastMock).toHaveBeenCalledTimes(1);
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'toast_message.saml.auth_check_temporarily_unavailable', type: 'error' }),
    );
  });

  it('shows the unavailable toast on a 4xx failure without retrying', async () => {
    getMock.mockRejectedValue(axiosError(404));

    const { result } = renderHook(() => useSamlAuthCheckQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getMock).toHaveBeenCalledTimes(1); // no retry for a definitive 4xx
    expect(addToastMock).toHaveBeenCalledTimes(1);
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'toast_message.saml.auth_check_unavailable', type: 'error' }),
    );
  });

  it('shows the temporary toast, exactly once, for a network error with no response', async () => {
    const error = Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
    getMock.mockRejectedValue(error);

    const { result } = renderHook(() => useSamlAuthCheckQuery(), { wrapper: newFastRetryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(addToastMock).toHaveBeenCalledTimes(1);
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'toast_message.saml.auth_check_temporarily_unavailable', type: 'error' }),
    );
  });

  it('still shows a toast for a ZodError from a malformed 200 body', async () => {
    // Top-level shape failure (not one of the tolerant/.catch() fields), so SamlAuthCheckSchema
    // throws a ZodError -- a non-AxiosError, which showModuleErrorToast must still surface.
    getMock.mockResolvedValue({ data: null });

    const { result } = renderHook(() => useSamlAuthCheckQuery(), { wrapper: newFastRetryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(addToastMock).toHaveBeenCalledTimes(1);
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'toast_message.saml.auth_check_temporarily_unavailable', type: 'error' }),
    );
  });

  it('re-checks on remount without re-toasting the cached failure', async () => {
    getMock.mockRejectedValueOnce(axiosError(404));
    getMock.mockResolvedValueOnce({ data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' } });
    const queryClient = new QueryClient();
    const sharedWrapper = createWrapper(queryClient);

    const { result: firstResult, unmount: unmountFirst } = renderHook(() => useSamlAuthCheckQuery(), {
      wrapper: sharedWrapper,
    });
    await waitFor(() => expect(firstResult.current.isError).toBe(true));
    expect(addToastMock).toHaveBeenCalledTimes(1);

    unmountFirst();

    const { result: secondResult } = renderHook(() => useSamlAuthCheckQuery(), { wrapper: sharedWrapper });
    await waitFor(() => expect(secondResult.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(addToastMock).toHaveBeenCalledTimes(1);
  });

  it('pauses without a toast when the network drops mid-request, then retries once back online', async () => {
    const networkError = Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
    let rejectFirstRequest: (error: Error) => void = () => undefined;
    getMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirstRequest = reject;
        }),
    );
    getMock.mockRejectedValueOnce(networkError);

    const { result } = renderHook(() => useSamlAuthCheckQuery(), { wrapper: newFastRetryWrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('fetching'));

    onlineManager.setOnline(false);
    rejectFirstRequest(networkError);

    await waitFor(() => expect(result.current.fetchStatus).toBe('paused'));
    expect(result.current.isPending).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(addToastMock).not.toHaveBeenCalled();

    onlineManager.setOnline(true);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(addToastMock).toHaveBeenCalledTimes(1);
  });
});
