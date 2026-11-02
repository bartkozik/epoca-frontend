import type { MockMethod, MockRequest, MockResponse } from './handlers/types';

const BODY_PREVIEW_LIMIT = 2_000;
const REDACTED = '[REDACTED]';
const scrubCredentialText = (value: string): string =>
  value
    .replace(/epc_secret_v1_[A-Za-z0-9._~-]+/gi, REDACTED)
    .replace(/(?:OAUTH_CLIENT|CT[-_]?521)[-_](?:SECRET|CREDENTIAL)[-_]SENTINEL(?:[-_][A-Za-z0-9._~-]+)?/gi, REDACTED)
    .replace(/\bBasic\s+[^\s"']+/gi, `Basic ${REDACTED}`)
    .replace(/\bBearer\s+[^\s"']+/gi, `Bearer ${REDACTED}`)
    .replace(
      /((?:client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|password|authorization)["']?\s*[:=]\s*["']?)[^&\s,"'}\]]+/gi,
      `$1${REDACTED}`
    );

const isSecretKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'set-cookie' ||
    normalized === 'password' ||
    normalized === 'secrethash' ||
    normalized.endsWith('secret') ||
    normalized.endsWith('token')
  );
};

const redactString = (value: string, contentType = ''): unknown => {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes('json') || /^\s*(?:\{|\[)/.test(value)) {
    try {
      return redactValue(JSON.parse(value) as unknown);
    } catch {
      // Fall through to the conservative raw-string redactor.
    }
  }
  if (normalizedType.includes('application/x-www-form-urlencoded')) {
    const redacted = new URLSearchParams();
    for (const [key, nested] of new URLSearchParams(value)) {
      redacted.append(scrubCredentialText(key), isSecretKey(key) ? REDACTED : scrubCredentialText(nested));
    }
    return redacted.toString();
  }
  return scrubCredentialText(value);
};

const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactValue);
  if (Buffer.isBuffer(value)) return redactString(value.toString('utf8'));
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      scrubCredentialText(key),
      isSecretKey(key) ? REDACTED : redactValue(nested),
    ])
  );
};

const normalizeHeaders = (headers: Readonly<Record<string, string>> | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers ?? {})
      .map(([key, value]) => [
        scrubCredentialText(key.toLowerCase()),
        isSecretKey(key) ? REDACTED : scrubCredentialText(value),
      ] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );

const contentType = (headers: Readonly<Record<string, string>> | undefined): string =>
  Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';

const boundedBody = (body: unknown, headers?: Readonly<Record<string, string>>): unknown => {
  if (body === undefined) return undefined;
  const redacted =
    typeof body === 'string' || Buffer.isBuffer(body)
      ? redactString(Buffer.isBuffer(body) ? body.toString('utf8') : body, contentType(headers))
      : redactValue(body);
  if (typeof redacted === 'string') return redacted.slice(0, BODY_PREVIEW_LIMIT);

  const serialized = JSON.stringify(redacted);
  return serialized.length <= BODY_PREVIEW_LIMIT ? redacted : serialized.slice(0, BODY_PREVIEW_LIMIT);
};

const redactQuery = (query: Readonly<Record<string, readonly string[]>>): Record<string, readonly string[]> =>
  Object.fromEntries(
    Object.entries(query).map(([key, values]) => [
      scrubCredentialText(key),
      isSecretKey(key) ? [REDACTED] : values.map(scrubCredentialText),
    ])
  );

export interface RequestJournalEntry {
  sequence: number;
  handlerId: string | null;
  method: MockMethod;
  path: string;
  query: Readonly<Record<string, readonly string[]>>;
  requestHeaders: Readonly<Record<string, string>>;
  requestBody?: unknown;
  responseStatus?: number;
  responseHeaders?: Readonly<Record<string, string>>;
  responseBody?: unknown;
  abort?: MockResponse['abort'];
  error?: string;
}

export interface JournalRecord {
  handlerId: string | null;
  request: MockRequest;
  response?: MockResponse;
  error?: string;
}

export interface RequestJournal {
  readonly entries: readonly RequestJournalEntry[];
  record(record: JournalRecord): RequestJournalEntry;
  last(method: MockMethod, path: string): RequestJournalEntry | undefined;
}

export const createRequestJournal = (): RequestJournal => {
  const entries: RequestJournalEntry[] = [];

  return {
    entries,
    record({ handlerId, request, response, error }) {
      const entry: RequestJournalEntry = {
        sequence: entries.length + 1,
        handlerId: handlerId === null ? null : scrubCredentialText(handlerId),
        method: request.method,
        path: scrubCredentialText(request.path),
        query: redactQuery(request.query),
        requestHeaders: normalizeHeaders(request.headers),
        requestBody: boundedBody(request.body, request.headers),
        responseStatus: response?.status,
        responseHeaders: response ? normalizeHeaders(response.headers) : undefined,
        responseBody: response ? boundedBody(response.json ?? response.body, response.headers) : undefined,
        abort: response?.abort,
        error: error === undefined ? undefined : scrubCredentialText(error).slice(0, BODY_PREVIEW_LIMIT),
      };
      entries.push(entry);
      return entry;
    },
    last(method, path) {
      return [...entries].reverse().find((entry) => entry.method === method && entry.path === path);
    },
  };
};
