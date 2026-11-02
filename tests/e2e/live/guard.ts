import type { LiveRunManifest } from './metadata';
import { boundedFetch } from './network';

export interface LiveTarget {
  baseURL: string;
  allowedHosts: string[];
  allowedApiHosts: string[];
  apiBaseURL: string;
  allowedOrganizationId: string;
  organizationId: string;
}

export interface RequiredLiveEnvironment {
  archivedUserId: string;
  archivedWorkUnitId: string;
  frontendSha: string;
  backendSha: string;
}

const DEFAULT_PRODUCTION_DOMAINS = ['epoca.company-5897fee414.example.invalid'];

interface CanonicalHttpsAuthority {
  host: string;
  hostname: string;
}

const canonicalHttpsAuthority = (url: URL, label: string): CanonicalHttpsAuthority => {
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!hostname || hostname.split('.').some((labelPart) => labelPart === '')) {
    throw new Error(`${label} host entry is malformed`);
  }
  url.hostname = hostname;
  return { hostname, host: url.port ? `${hostname}:${url.port}` : hostname };
};

const canonicalConfiguredHost = (entry: string): CanonicalHttpsAuthority => {
  const value = entry.trim();
  if (!value || /[/@?#]/.test(value)) throw new Error('Configured host entry is malformed');
  const colon = value.lastIndexOf(':');
  if (!value.startsWith('[') && colon >= 0 && !/^\d+$/.test(value.slice(colon + 1))) {
    throw new Error('Configured host entry has a malformed port');
  }
  let url: URL;
  try {
    url = new URL(`https://${value}`);
  } catch {
    throw new Error('Configured host entry is malformed');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Configured host entry is malformed');
  }
  return canonicalHttpsAuthority(url, 'Configured');
};

export const parseHostList = (value: string | undefined): string[] => {
  if (!value?.trim()) return [];
  const entries = value.split(',');
  if (entries.some((entry) => !entry.trim())) throw new Error('Configured host entry is malformed');
  return entries.map((entry) => canonicalConfiguredHost(entry).host);
};

const configuredProductionDomains = (): string[] => {
  const configured = [
    ...parseHostList(process.env.PLAYWRIGHT_PRODUCTION_DOMAINS),
    ...parseHostList(process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS),
    ...parseHostList(process.env.PLAYWRIGHT_LOCAL_PROXY_PRODUCTION_DOMAINS),
  ];
  return [
    ...new Set([...DEFAULT_PRODUCTION_DOMAINS, ...configured].map((entry) => canonicalConfiguredHost(entry).hostname)),
  ];
};

const parseHttpsUrl = (value: string, label: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  if (url.search || url.hash) throw new Error(`${label} must not contain query parameters or fragments`);
  canonicalHttpsAuthority(url, label);
  return url;
};

const assertExactAllowlistedHost = (url: URL, allowedHosts: string[], label: string): void => {
  const normalizedAllowlist = allowedHosts.map((host) => canonicalConfiguredHost(host).host);
  if (normalizedAllowlist.length === 0) throw new Error(`${label} allowlist must not be empty`);
  if (!normalizedAllowlist.includes(canonicalHttpsAuthority(url, label).host)) {
    throw new Error(`${label} hostname is outside the exact allowlist`);
  }
};

const assertNonProductionHost = (url: URL, label: string): void => {
  const hostname = canonicalHttpsAuthority(url, label).hostname;
  if (configuredProductionDomains().some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error(`${label} production hostname is forbidden`);
  }
};

const assertExactOrganization = (target: LiveTarget): void => {
  if (!target.allowedOrganizationId.trim() || target.organizationId !== target.allowedOrganizationId) {
    throw new Error('Live organization does not match the exact allowed organization');
  }
};

export const assertSafeLiveTarget = (target: LiveTarget): URL => {
  const url = parseHttpsUrl(target.baseURL, 'Live frontend target');
  assertExactAllowlistedHost(url, target.allowedHosts, 'Live frontend target');
  assertNonProductionHost(url, 'Live frontend target');
  assertExactOrganization(target);
  return url;
};

export const assertSafeApiTarget = (target: LiveTarget): URL => {
  const url = parseHttpsUrl(target.apiBaseURL, 'Live API target');
  assertExactAllowlistedHost(url, target.allowedApiHosts, 'Live API target');
  assertNonProductionHost(url, 'Live API target');
  assertExactOrganization(target);
  return url;
};

export const assertRuntimeApiTarget = (target: LiveTarget, runtimeApiBaseURL: string): URL => {
  if (!runtimeApiBaseURL.trim()) throw new Error('Runtime API_BASE_URL is missing');
  if (!runtimeApiBaseURL.startsWith('/') && !/^[a-z][a-z\d+.-]*:\/\//i.test(runtimeApiBaseURL)) {
    throw new Error('Runtime API_BASE_URL is malformed');
  }

  const frontend = assertSafeLiveTarget(target);
  let runtimeUrl: URL;
  try {
    runtimeUrl = new URL(runtimeApiBaseURL, frontend.origin);
  } catch {
    throw new Error('Runtime API_BASE_URL is malformed');
  }

  const validatedRuntime = assertSafeApiTarget({ ...target, apiBaseURL: runtimeUrl.href });
  const configuredApi = assertSafeApiTarget(target);
  if (validatedRuntime.href !== configuredApi.href) {
    throw new Error('Runtime API origin or base path differs from the approved API target');
  }
  return validatedRuntime;
};

export const extractRuntimeApiBaseURL = (script: string): string => {
  const objectMatch = script.match(/API_BASE_URL\s*:\s*(['"])(.*?)\1/);
  const assignmentMatch = script.match(/\[['"]API_BASE_URL['"]\]\s*=\s*(['"])(.*?)\1/);
  const value = objectMatch?.[2] ?? assignmentMatch?.[2];
  if (!value?.trim()) throw new Error('Frontend env.js does not define API_BASE_URL');
  return value;
};

export const fetchAndValidateRuntimeApi = async (
  target: LiveTarget,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<URL> => {
  const frontend = assertSafeLiveTarget(target);
  const response = await boundedFetch(
    new URL('/assets/env.js', frontend.origin),
    {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/javascript,text/javascript' },
      signal,
    },
    fetcher
  );
  if (!response.ok) throw new Error('Unable to read frontend env.js');
  return assertRuntimeApiTarget(target, extractRuntimeApiBaseURL(await response.text()));
};

const EXACT_GIT_SHA = /^[0-9a-f]{40}$/;

export const fetchAndValidateFrontendVersion = async (
  target: LiveTarget,
  expectedSha: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<string> => {
  const expected = expectedSha.trim();
  if (!EXACT_GIT_SHA.test(expected)) throw new Error('Expected frontend SHA must be an exact 40-character commit');
  const frontend = assertSafeLiveTarget(target);
  const response = await boundedFetch(
    new URL('/frontend-version', frontend.origin),
    {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'text/plain' },
      signal,
    },
    fetcher
  );
  if (!response.ok) throw new Error('Unable to read deployed frontend SHA');
  if (response.headers.get('content-type')?.split(';', 1)[0] !== 'text/plain') {
    throw new Error('Deployed frontend SHA endpoint must return text/plain');
  }
  const deployed = (await response.text()).trim();
  if (!EXACT_GIT_SHA.test(deployed) || deployed !== expected) {
    throw new Error(`Deployed frontend SHA differs from expected ${expected}`);
  }
  return deployed;
};

export const assertRequiredLiveEnvironment = (environment: RequiredLiveEnvironment): void => {
  if (!environment.archivedUserId.trim() || !environment.archivedWorkUnitId.trim()) {
    throw new Error('Dedicated archived fixture IDs are required');
  }
  if (!environment.frontendSha.trim() || !environment.backendSha.trim()) {
    throw new Error('Exact frontend and backend SHA values are required');
  }
};

export const loadLiveTarget = (
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): LiveTarget => {
  const allowedOrganizationId = env.PLAYWRIGHT_LIVE_ALLOWED_ORG_ID ?? '';
  return {
    baseURL: env.PLAYWRIGHT_LIVE_BASE_URL ?? '',
    allowedHosts: parseHostList(env.PLAYWRIGHT_LIVE_ALLOWED_HOSTS),
    allowedApiHosts: parseHostList(env.PLAYWRIGHT_LIVE_ALLOWED_API_HOSTS),
    apiBaseURL: env.PLAYWRIGHT_LIVE_API_BASE_URL ?? '',
    allowedOrganizationId,
    organizationId: allowedOrganizationId,
  };
};

export const assertManifestOwnership = (manifest: LiveRunManifest, target: LiveTarget): void => {
  const frontend = assertSafeLiveTarget(target);
  const api = assertSafeApiTarget(target);
  const manifestApi = assertSafeApiTarget({ ...target, apiBaseURL: manifest.apiBaseURL });
  if (manifest.organizationId !== target.allowedOrganizationId || manifest.organizationId !== target.organizationId) {
    throw new Error('Manifest organization is not owned by this live target');
  }
  if (
    manifest.frontendOrigin !== frontend.origin ||
    manifest.apiOrigin !== api.origin ||
    manifestApi.href !== api.href
  ) {
    throw new Error('Manifest origin is not owned by this live target');
  }
};
