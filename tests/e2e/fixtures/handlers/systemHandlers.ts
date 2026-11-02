import type { MockHandler } from './types';

export const systemHandlers: MockHandler[] = [
  {
    id: 'saml-authn',
    method: 'GET',
    path: /^\/organizations\/iterators\/saml\/authn$/,
    handle: () => ({ status: 200, json: { samlRequest: '', ssoUrl: '' } }),
  },
  {
    id: 'frontend-error-telemetry',
    method: 'POST',
    path: /^\/metrics\/frontend\/error$/,
    handle: () => ({ status: 204 }),
  },
];
