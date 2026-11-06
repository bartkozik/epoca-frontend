import { shouldSendResponseErrorLog } from './responseError';

type AxiosResponseErrorFixture = {
  isAxiosError: true;
  config: Record<string, unknown> | undefined;
  request: Record<string, unknown> | undefined;
  response: {
    config: Record<string, unknown> | undefined;
    request: Record<string, unknown> | undefined;
  };
};

const axiosResponseError = ({
  config,
  request,
  responseConfig,
  responseRequest,
}: {
  config?: Record<string, unknown>;
  request?: Record<string, unknown>;
  responseConfig?: Record<string, unknown>;
  responseRequest?: Record<string, unknown>;
}): AxiosResponseErrorFixture => ({
  isAxiosError: true,
  config,
  request,
  response: {
    config: responseConfig,
    request: responseRequest,
  },
});

describe('shouldSendResponseErrorLog', () => {
  it.each([null, undefined, {}, { isAxiosError: false }])('does not log a non-Axios response error: %p', (error) => {
    expect(shouldSendResponseErrorLog(error)).toBe(false);
  });

  it('does not log an Axios network error without a response', () => {
    expect(
      shouldSendResponseErrorLog({
        isAxiosError: true,
        config: { method: 'get', url: '/work-units' },
      }),
    ).toBe(false);
  });

  it.each([
    ['/api/saml/auth/callback', 'SAML authentication'],
    ['/api/auth/login?redirect=/work-units', 'login'],
    ['/api/auth/refresh-token', 'token refresh'],
    ['/metrics/frontend/error', 'frontend error endpoint'],
  ])('does not log %s response bodies (%s)', (url) => {
    expect(shouldSendResponseErrorLog(axiosResponseError({ config: { method: 'post', url } }))).toBe(false);
  });

  it.each([
    {
      label: 'relative create URL in error config',
      error: axiosResponseError({
        config: { method: 'POST', url: '/organizations/acme/oauth-clients' },
      }),
    },
    {
      label: 'absolute rotate URL in response config',
      error: axiosResponseError({
        responseConfig: {
          method: 'post',
          url: 'https://api.example.test/organizations/acme/oauth-clients/client-1/rotate-secret?audit=true#result',
        },
      }),
    },
    {
      label: 'mixed-case method with an absolute base URL and encoded identifiers',
      error: axiosResponseError({
        config: {
          method: 'PoSt',
          baseURL: 'https://api.example.test/api/v1/',
          url: 'organizations/%61cme/oauth-clients/client%2Fone/rotate-secret?include=secret#fragment',
        },
      }),
    },
    {
      label: 'relative base URL and an encoded slug',
      error: axiosResponseError({
        responseConfig: {
          method: 'POST',
          baseURL: '/api/v1',
          url: '/organizations/acme%2Fdivision/oauth-clients',
        },
      }),
    },
    {
      label: 'XHR responseURL corroborating error config',
      error: axiosResponseError({
        config: {
          method: 'post',
          url: '/organizations/acme/oauth-clients/client%20one/rotate-secret',
        },
        request: {
          responseURL: 'https://api.example.test/organizations/acme/oauth-clients/client%20one/rotate-secret',
        },
      }),
    },
    {
      label: 'fetch Request corroborating response config',
      error: axiosResponseError({
        responseConfig: {
          method: 'POST',
          url: '/organizations/acme/oauth-clients',
        },
        responseRequest: {
          method: 'POST',
          url: 'https://api.example.test/organizations/acme/oauth-clients',
        },
      }),
    },
  ])('does not log an OAuth client secret response for $label', ({ error }) => {
    expect(shouldSendResponseErrorLog(error)).toBe(false);
  });

  it.each([
    ['missing URL', { method: 'get' }],
    ['missing method', { url: '/work-units' }],
    ['malformed method', { method: 42, url: '/work-units' }],
    ['malformed URL', { method: 'get', url: 'https://[invalid' }],
    ['malformed base URL', { method: 'get', baseURL: 'https://[invalid', url: '/work-units' }],
  ])('fails closed for %s metadata', (_label, config) => {
    expect(shouldSendResponseErrorLog(axiosResponseError({ config }))).toBe(false);
  });

  it.each([undefined, '', 12])('excludes OAuth client management responses with an untrusted method: %p', (method) => {
    expect(
      shouldSendResponseErrorLog(
        axiosResponseError({
          config: { method, url: '/organizations/acme/oauth-clients/client-1/rotate-secret' },
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ['GET list', 'GET', '/organizations/acme/oauth-clients'],
    ['GET detail', 'get', '/organizations/acme/oauth-clients/client%2Fone'],
    ['GET audit events', 'GET', '/organizations/acme/oauth-clients/client-1/audit-events?pageNumber=1'],
    ['PATCH detail', 'PaTcH', '/organizations/acme/oauth-clients/client-1'],
    ['POST revoke', 'POST', '/organizations/acme/oauth-clients/client-1/revoke'],
  ])('logs the known-safe OAuth client management route %s', (_label, method, url) => {
    expect(shouldSendResponseErrorLog(axiosResponseError({ config: { method, url } }))).toBe(true);
  });

  it.each([
    ['GET rotate-secret', 'GET', '/organizations/acme/oauth-clients/client-1/rotate-secret'],
    ['POST detail', 'POST', '/organizations/acme/oauth-clients/client-1'],
    ['DELETE detail', 'DELETE', '/organizations/acme/oauth-clients/client-1'],
    ['GET extra segment', 'GET', '/organizations/acme/oauth-clients/client-1/audit-events/extra'],
    ['POST revoke extra segment', 'POST', '/organizations/acme/oauth-clients/client-1/revoke/extra'],
    ['GET missing slug', 'GET', '/organizations/oauth-clients'],
  ])('fails closed for ambiguous OAuth client management metadata: %s', (_label, method, url) => {
    expect(shouldSendResponseErrorLog(axiosResponseError({ config: { method, url } }))).toBe(false);
  });

  it('accepts duplicate coherent Axios config metadata', () => {
    const config = { method: 'GET', url: '/organizations/acme/oauth-clients/client-1' };

    expect(shouldSendResponseErrorLog(axiosResponseError({ config, responseConfig: { ...config } }))).toBe(true);
  });

  it.each([
    {
      label: 'method-only error config next to a complete response config',
      error: axiosResponseError({
        config: { method: 'GET' },
        responseConfig: { method: 'GET', url: '/work-units' },
      }),
    },
    {
      label: 'URL-only response config next to a complete error config',
      error: axiosResponseError({
        config: { method: 'GET', url: '/work-units' },
        responseConfig: { url: '/work-units' },
      }),
    },
    {
      label: 'XHR URL conflicting with its error config URL',
      error: axiosResponseError({
        config: { method: 'GET', url: '/work-units' },
        request: { responseURL: 'https://api.example.test/organizations/acme/oauth-clients' },
      }),
    },
  ])('fails closed for a partial or contradictory metadata candidate: $label', ({ error }) => {
    expect(shouldSendResponseErrorLog(error)).toBe(false);
  });

  it.each([
    {
      label: 'safe config versus sensitive config',
      error: axiosResponseError({
        config: { method: 'GET', url: '/organizations/acme/oauth-clients' },
        responseConfig: { method: 'POST', url: '/organizations/acme/oauth-clients' },
      }),
    },
    {
      label: 'safe config versus a fetch Request with a different method and URL',
      error: axiosResponseError({
        config: { method: 'GET', url: '/work-units' },
        request: { method: 'POST', url: 'https://api.example.test/organizations/acme/oauth-clients' },
      }),
    },
  ])('fails closed for conflicting complete metadata candidates: $label', ({ error }) => {
    expect(shouldSendResponseErrorLog(error)).toBe(false);
  });

  it('logs a safe XHR-shaped response when responseURL corroborates coherent duplicated configs', () => {
    const config = { method: 'GET', baseURL: '/api/v1', url: '/organizations/acme/oauth-clients' };
    const request = { responseURL: 'https://api.example.test/api/v1/organizations/acme/oauth-clients?pageNumber=1' };

    expect(
      shouldSendResponseErrorLog(
        axiosResponseError({ config, request, responseConfig: { ...config }, responseRequest: request }),
      ),
    ).toBe(true);
  });

  it('logs a safe fetch Request-shaped response when method and URL corroborate its config', () => {
    expect(
      shouldSendResponseErrorLog(
        axiosResponseError({
          config: {
            method: 'PATCH',
            baseURL: 'https://api.example.test/api/v1',
            url: '/organizations/acme/oauth-clients/client-1',
          },
          request: {
            method: 'PATCH',
            url: 'https://api.example.test/api/v1/organizations/acme/oauth-clients/client-1',
          },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['malformed XHR responseURL', { responseURL: 'https://[invalid' }, { method: 'GET', url: '/work-units' }],
    [
      'fetch Request method conflict',
      { method: 'POST', url: 'https://api.example.test/work-units' },
      { method: 'GET', url: '/work-units' },
    ],
    [
      'fetch Request URL conflict',
      { method: 'GET', url: 'https://api.example.test/other-work-units' },
      { method: 'GET', url: '/work-units' },
    ],
  ])('fails closed for %s', (_label, request, config) => {
    expect(shouldSendResponseErrorLog(axiosResponseError({ config, request }))).toBe(false);
  });

  it('logs a safe response error using normalized Axios request metadata', () => {
    expect(
      shouldSendResponseErrorLog(
        axiosResponseError({
          config: {
            method: 'GET',
            baseURL: 'https://api.example.test/api/v1',
            url: '/work-units?archived=false#list',
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('invitation response telemetry', () => {
  it.each([
    '/organizations/acme/invitations?version=2',
    '/api/organizations/acme/invitations/id/resend',
    '/invitation-access/exchange',
    '/api/invitation-access/password',
    '/organizations/acme/saml/login',
    '/organizations/acme/saml/login/',
  ])('never reports a response body from %s', (url) => {
    expect(shouldSendResponseErrorLog(axiosResponseError({ config: { method: 'post', url } }))).toBe(false);
  });
});
