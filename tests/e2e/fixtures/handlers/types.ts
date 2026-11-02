import type { WorldRuntime } from '../../worlds/runtime';

export type MockMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface MockRequest {
  method: MockMethod;
  url: string;
  path: string;
  query: Readonly<Record<string, readonly string[]>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface MockResponse {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: string | Buffer;
  abort?: 'failed' | 'timedout';
}

export interface MockHandler {
  id: string;
  method: MockMethod;
  path: RegExp;
  query?: Readonly<Record<string, readonly string[]>>;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
  handle(request: MockRequest, runtime: WorldRuntime): Promise<MockResponse> | MockResponse;
}
