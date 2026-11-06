import type { BrowserContext, Page, Request } from '@playwright/test';
import type { WorldRuntime } from '../worlds/runtime';
import { authHandlers } from './handlers/authHandlers';
import { clientHandlers } from './handlers/clientHandlers';
import { integrationClientHandlers } from './handlers/integrationClientHandlers';
import { invitationHandlers } from './handlers/invitationHandlers';
import { organizationHandlers } from './handlers/organizationHandlers';
import { pivotQueryHandlers } from './handlers/pivotQueryHandlers';
import { projectHandlers } from './handlers/projectHandlers';
import { reportHandlers } from './handlers/reportHandlers';
import { systemHandlers } from './handlers/systemHandlers';
import type { MockHandler, MockMethod, MockRequest, MockResponse } from './handlers/types';
import { userHandlers } from './handlers/userHandlers';
import { workUnitMutationHandlers } from './handlers/workUnitMutationHandlers';
import { workUnitReadHandlers } from './handlers/workUnitReadHandlers';

const API_PREFIX = '/__e2e_api';
const PROXY_PREFIX = '/api';
const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';
const FRONTEND_WS_ORIGIN = FRONTEND_ORIGIN.replace(/^http/, 'ws');
const isViteHmrWebSocket = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}` === FRONTEND_WS_ORIGIN && parsed.pathname === '/';
  } catch {
    return false;
  }
};
const BLOCKED_WEBSOCKET = { code: 1008, reason: 'Mock E2E blocks unexpected WebSocket' } as const;
const FRONTEND_ASSET_TYPES = new Set(['font', 'image', 'script', 'stylesheet']);
const FRONTEND_CONTENT_TYPES: Readonly<Record<string, RegExp>> = {
  font: /^(?:font\/|application\/(?:font-|x-font-))/i,
  image: /^image\//i,
  script: /^(?:(?:application|text)\/(?:java|ecma)script)/i,
  stylesheet: /^text\/css(?:;|$)/i,
};
const envScript = (publicUrl: string): string =>
  `window.env={API_BASE_URL:'/__e2e_api',PUBLIC_URL:${JSON.stringify(publicUrl)}};`;
const defaultHandlers: MockHandler[] = [
  ...systemHandlers,
  ...authHandlers,
  ...organizationHandlers,
  ...userHandlers,
  ...invitationHandlers,
  ...clientHandlers,
  ...integrationClientHandlers,
  ...projectHandlers,
  ...workUnitReadHandlers,
  ...workUnitMutationHandlers,
  ...reportHandlers,
  ...pivotQueryHandlers,
];
const installedContexts = new WeakMap<
  BrowserContext,
  { handlers: readonly MockHandler[]; installation: Promise<void>; runtime: WorldRuntime }
>();

export class UnknownMockRequestError extends Error {
  constructor(request: MockRequest, runtime: WorldRuntime) {
    super(`Unknown API request: ${request.method} ${request.path} (${runtime.worldName}, ${runtime.actor})`);
    this.name = 'UnknownMockRequestError';
  }
}

export class MockRequestMismatchError extends Error {
  constructor(handler: MockHandler, mismatches: readonly string[], runtime: WorldRuntime) {
    super(
      `Mock request did not match ${handler.id}: ${mismatches.join(', ')} (${runtime.worldName}, ${runtime.actor})`,
    );
    this.name = 'MockRequestMismatchError';
  }
}

export const canonicalizeApiPath = (path: string): string => {
  const withoutPrefix = path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
  const normalized = withoutPrefix.replace(/^\/+/, '');
  return normalized ? `/${normalized}` : '/';
};

const canonicalizeQuery = (searchParams: URLSearchParams): Record<string, readonly string[]> => {
  const keys = [...new Set(searchParams.keys())].sort();
  return Object.fromEntries(keys.map((key) => [key, searchParams.getAll(key).sort()]));
};

const normalizeHeaders = (headers: Readonly<Record<string, string>> = {}): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

export interface MockRequestInput {
  method: MockMethod;
  url: string;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
}

export const parseMockRequest = ({ method, url, headers, body }: MockRequestInput): MockRequest => {
  const parsed = new URL(url, FRONTEND_ORIGIN);
  return {
    method,
    url: parsed.toString(),
    path: canonicalizeApiPath(parsed.pathname),
    query: canonicalizeQuery(parsed.searchParams),
    headers: normalizeHeaders(headers),
    body,
  };
};

const resetAndTest = (pattern: RegExp, value: string): boolean => {
  pattern.lastIndex = 0;
  const matches = pattern.test(value);
  pattern.lastIndex = 0;
  return matches;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const equalValues = (left: unknown, right: unknown): boolean => stableJson(left) === stableJson(right);

const canonicalizeExpectedQuery = (
  query: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly string[]> =>
  Object.fromEntries(
    Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, [...values].sort()]),
  );

const mismatchReasons = (handler: MockHandler, request: MockRequest): string[] => {
  const mismatches: string[] = [];
  if (handler.query && !equalValues(canonicalizeExpectedQuery(handler.query), request.query)) {
    mismatches.push('query mismatch');
  }
  if (handler.headers) {
    const expectedHeaders = normalizeHeaders(handler.headers);
    if (Object.entries(expectedHeaders).some(([key, value]) => request.headers[key] !== value)) {
      mismatches.push('headers mismatch');
    }
  }
  if (handler.body !== undefined && !equalValues(handler.body, request.body)) {
    mismatches.push('body mismatch');
  }
  return mismatches;
};

export const validateMockHandlers = (handlers: readonly MockHandler[]): void => {
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const handler of handlers) {
    if (ids.has(handler.id)) throw new Error(`Duplicate mock handler ID: ${handler.id}`);
    ids.add(handler.id);

    const semanticFlags = handler.path.flags.replace(/[dg]/g, '');
    const route = `${handler.method} /${handler.path.source}/${semanticFlags}`;
    if (routes.has(route)) throw new Error(`Duplicate mock route: ${handler.method} ${handler.path.toString()}`);
    routes.add(route);
  }
};

export interface MockApiDispatcher {
  dispatch(request: MockRequest): Promise<MockResponse>;
}

export const createMockApiDispatcher = (runtime: WorldRuntime, handlers: readonly MockHandler[]): MockApiDispatcher => {
  validateMockHandlers(handlers);

  return {
    async dispatch(request) {
      const handler = handlers.find(
        (candidate) => candidate.method === request.method && resetAndTest(candidate.path, request.path),
      );
      if (!handler) {
        const error = new UnknownMockRequestError(request, runtime);
        runtime.journal.record({ handlerId: null, request, error: error.message });
        throw error;
      }

      const mismatches = mismatchReasons(handler, request);
      if (mismatches.length > 0) {
        const error = new MockRequestMismatchError(handler, mismatches, runtime);
        runtime.journal.record({ handlerId: handler.id, request, error: error.message });
        throw error;
      }

      try {
        const response = await handler.handle(request, runtime);
        if (response.abort && (response.json !== undefined || response.body !== undefined)) {
          throw new Error(`Mock handler ${handler.id} cannot return a body and abort the request`);
        }
        if (response.json !== undefined && response.body !== undefined) {
          throw new Error(`Mock handler ${handler.id} cannot return both json and body`);
        }
        runtime.journal.record({ handlerId: handler.id, request, response });
        return response;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        runtime.journal.record({ handlerId: handler.id, request, error: error.message });
        throw error;
      }
    },
  };
};

const parsePlaywrightBody = (request: Request, headers: Readonly<Record<string, string>>): unknown => {
  const body = request.postData();
  if (body === null) return undefined;
  if (headers['content-type']?.toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
};

const fulfillResponse = async (
  route: Parameters<Parameters<Page['route']>[1]>[0],
  response: MockResponse,
): Promise<void> => {
  if (response.abort) {
    await route.abort(response.abort);
    return;
  }
  if (response.json !== undefined) {
    await route.fulfill({ status: response.status, headers: response.headers, json: response.json });
    return;
  }
  await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
};

export const installMockApi = async (
  page: Page,
  runtime: WorldRuntime,
  handlers: readonly MockHandler[] = defaultHandlers,
): Promise<void> => {
  const context = page.context();
  const installed = installedContexts.get(context);
  if (installed) {
    if (installed.runtime !== runtime || installed.handlers !== handlers) {
      throw new Error('Mock API is already installed with another runtime or handler set');
    }
    await installed.installation;
    return;
  }

  const dispatcher = createMockApiDispatcher(runtime, handlers);
  const handleRoute: Parameters<BrowserContext['route']>[1] = async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === FRONTEND_ORIGIN && url.pathname === '/assets/env.js') {
      await route.fulfill({
        body: envScript(runtime.publicUrl),
        contentType: 'application/javascript',
        status: 200,
      });
      return;
    }

    if (url.origin === FRONTEND_ORIGIN && (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`))) {
      const headers = normalizeHeaders(await request.allHeaders());
      const mockRequest = parseMockRequest({
        method: request.method() as MockMethod,
        url: request.url(),
        headers,
        body: parsePlaywrightBody(request, headers),
      });
      try {
        const response = await dispatcher.dispatch(mockRequest);
        await fulfillResponse(route, response);
      } catch (error) {
        await route.abort('failed');
        throw error;
      }
      return;
    }

    if (
      url.origin === FRONTEND_ORIGIN &&
      (url.pathname === PROXY_PREFIX || url.pathname.startsWith(`${PROXY_PREFIX}/`))
    ) {
      await route.abort('failed');
      return;
    }

    if (url.origin === FRONTEND_ORIGIN) {
      const accept = (await request.allHeaders()).accept ?? '';
      const isFrontendNavigation =
        request.method() === 'GET' && request.isNavigationRequest() && accept.toLowerCase().includes('text/html');
      if (isFrontendNavigation) {
        await route.continue();
        return;
      }

      const resourceType = request.resourceType();
      const isFrontendAsset = request.method() === 'GET' && FRONTEND_ASSET_TYPES.has(resourceType);
      const isManifest =
        request.method() === 'GET' &&
        (resourceType === 'manifest' || resourceType === 'other') &&
        url.pathname === '/manifest.json';
      if (isFrontendAsset || isManifest) {
        let response: Awaited<ReturnType<typeof route.fetch>>;
        try {
          response = await route.fetch({ headers: { accept: 'text/html' }, maxRedirects: 0 });
        } catch {
          await route.abort('failed').catch(() => undefined);
          return;
        }
        let snapshot: { body: Buffer; headers: Record<string, string>; status: number } | undefined;
        try {
          const responseUrl = new URL(response.url());
          const headers = response.headers();
          const status = response.status();
          const contentType = headers['content-type'] ?? '';
          const expectedContentType = isManifest
            ? /^application\/(?:manifest\+json|json)(?:;|$)/i
            : FRONTEND_CONTENT_TYPES[resourceType];
          const isExactLocalResource =
            responseUrl.origin === url.origin &&
            responseUrl.pathname === url.pathname &&
            responseUrl.search === url.search &&
            status >= 200 &&
            status < 300 &&
            expectedContentType?.test(contentType);
          if (isExactLocalResource) snapshot = { body: await response.body(), headers, status };
        } catch {
          // A closing page can dispose the fetch response before it is snapshotted.
        } finally {
          await response.dispose().catch(() => undefined);
        }
        if (snapshot) {
          await route.fulfill(snapshot).catch(() => undefined);
          return;
        }
      }

      await route.abort('failed').catch(() => undefined);
      return;
    }

    await route.abort('failed');
  };
  const installation = (async () => {
    await context.route('**/*', handleRoute);
    try {
      await context.routeWebSocket('**/*', async (webSocket) => {
        if (isViteHmrWebSocket(webSocket.url())) {
          webSocket.connectToServer();
          return;
        }
        await webSocket.close(BLOCKED_WEBSOCKET);
      });
    } catch (error) {
      await context.unroute('**/*', handleRoute);
      throw error;
    }
  })();
  installedContexts.set(context, { handlers, installation, runtime });

  try {
    await installation;
  } catch (error) {
    installedContexts.delete(context);
    throw error;
  }
};
