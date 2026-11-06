import { isAxiosError } from '@/core/utils/helpers';

const URL_BASE = 'https://frontend.invalid';
const ABSOLUTE_URL_PATTERN = /^([a-z][a-z\d+\-.]*:)?\/\//i;
const HTTP_METHOD_PATTERN = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;

type RequestConfigMetadata = {
  baseURL?: unknown;
  method?: unknown;
  url?: unknown;
};

type RequestMetadata = {
  method?: unknown;
  responseURL?: unknown;
  url?: unknown;
};

type RequestCandidate = {
  method: string;
  pathname: string;
};

type CandidateResult =
  { status: 'absent' } | { status: 'invalid' } | { status: 'complete'; candidate: RequestCandidate };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeMethod = (method: unknown): string | undefined => {
  if (typeof method !== 'string') return undefined;

  const normalizedMethod = method.trim().toUpperCase();
  return normalizedMethod && HTTP_METHOD_PATTERN.test(normalizedMethod) ? normalizedMethod : undefined;
};

const isHttpUrl = (url: URL): boolean => url.protocol === 'http:' || url.protocol === 'https:';

const validateBaseUrl = (baseURL: unknown): baseURL is string | undefined => {
  if (baseURL === undefined) return true;
  if (typeof baseURL !== 'string' || !baseURL) return false;

  const parsedBaseUrl = new URL(baseURL, URL_BASE);
  return isHttpUrl(parsedBaseUrl);
};

const getPathname = (url: unknown, baseURL?: unknown): string | undefined => {
  if (typeof url !== 'string' || !url || !validateBaseUrl(baseURL)) return undefined;

  const combinedUrl =
    baseURL && !ABSOLUTE_URL_PATTERN.test(url) ? `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}` : url;
  const parsedUrl = new URL(combinedUrl, URL_BASE);

  return isHttpUrl(parsedUrl) ? parsedUrl.pathname : undefined;
};

const getConfigMetadata = (value: unknown): RequestConfigMetadata | undefined => (isRecord(value) ? value : undefined);

const getRequestMetadata = (value: unknown): RequestMetadata | undefined => (isRecord(value) ? value : undefined);

const getConfigCandidate = (value: unknown): RequestCandidate | undefined => {
  if (value === undefined) return undefined;

  const config = getConfigMetadata(value);
  if (!config) return undefined;

  const method = normalizeMethod(config.method);
  const pathname = getPathname(config.url, config.baseURL);

  return method && pathname ? { method, pathname } : undefined;
};

const getOwnedCandidate = (configValue: unknown, requestValue: unknown): CandidateResult => {
  if (configValue === undefined) return requestValue === undefined ? { status: 'absent' } : { status: 'invalid' };

  const candidate = getConfigCandidate(configValue);
  if (!candidate) return { status: 'invalid' };
  if (requestValue === undefined) return { status: 'complete', candidate };

  const request = getRequestMetadata(requestValue);
  if (!request) return { status: 'invalid' };

  const hasResponseUrl = request.responseURL !== undefined;
  const hasFetchUrl = request.url !== undefined;
  if (!hasResponseUrl && !hasFetchUrl)
    return request.method === undefined ? { status: 'complete', candidate } : { status: 'invalid' };

  const adapterPathnames = [
    ...(hasResponseUrl ? [getPathname(request.responseURL)] : []),
    ...(hasFetchUrl ? [getPathname(request.url)] : []),
  ];
  if (adapterPathnames.some((pathname) => !pathname || pathname !== candidate.pathname)) return { status: 'invalid' };

  if (hasFetchUrl) {
    const adapterMethod = normalizeMethod(request.method);
    if (!adapterMethod || adapterMethod !== candidate.method) return { status: 'invalid' };
  } else if (request.method !== undefined) {
    const adapterMethod = normalizeMethod(request.method);
    if (!adapterMethod || adapterMethod !== candidate.method) return { status: 'invalid' };
  }

  return { status: 'complete', candidate };
};

const isLegacyExcludedPath = (pathname: string): boolean =>
  pathname.includes('saml/auth') ||
  pathname.includes('auth/login') ||
  pathname.endsWith('/auth/refresh-token') ||
  pathname.endsWith('/metrics/frontend/error');

const shouldSendOAuthClientResponse = ({ method, pathname }: RequestCandidate): boolean => {
  const segments = pathname.split('/').slice(1);
  const oauthClientIndexes = segments.reduce<number[]>((indexes, segment, index) => {
    if (segment === 'oauth-clients') indexes.push(index);
    return indexes;
  }, []);

  if (!oauthClientIndexes.length) return true;
  if (oauthClientIndexes.length !== 1) return false;

  const oauthClientIndex = oauthClientIndexes[0];
  if (oauthClientIndex < 2 || segments[oauthClientIndex - 2] !== 'organizations') return false;

  const route = segments.slice(oauthClientIndex - 2);
  if (!route[1]) return false;

  if (route.length === 3) return method === 'GET';
  if (route.length === 4) return Boolean(route[3]) && (method === 'GET' || method === 'PATCH');
  if (route.length !== 5 || !route[3]) return false;

  if (route[4] === 'audit-events') return method === 'GET';
  if (route[4] === 'revoke') return method === 'POST';

  return false;
};

const areCandidatesCoherent = (candidates: RequestCandidate[]): boolean => {
  const firstCandidate = candidates[0];
  return candidates.every(
    ({ method, pathname }) => method === firstCandidate.method && pathname === firstCandidate.pathname,
  );
};

const shouldSendCandidateResponse = (candidate: RequestCandidate): boolean => {
  if (isLegacyExcludedPath(candidate.pathname)) return false;
  // Invitation and SAML errors can contain credentials or identity details.
  const segments = candidate.pathname.split('/');
  if (segments.includes('invitations') || segments.includes('invitation-access')) return false;
  if (/\/saml\/login\/?$/.test(candidate.pathname)) return false;

  return shouldSendOAuthClientResponse(candidate);
};

export const shouldSendResponseErrorLog = (error: unknown): boolean => {
  try {
    if (!isAxiosError(error) || !error.response) return false;

    const results = [
      getOwnedCandidate(error.config, error.request),
      getOwnedCandidate(error.response.config, error.response.request),
    ];
    if (results.some(({ status }) => status === 'invalid')) return false;

    const candidates = results.flatMap((result) => (result.status === 'complete' ? [result.candidate] : []));
    if (!candidates.length || !areCandidatesCoherent(candidates)) return false;

    return shouldSendCandidateResponse(candidates[0]);
  } catch {
    return false;
  }
};
