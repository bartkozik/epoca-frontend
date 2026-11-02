import OneTimeCredentialsModal from '@/modules/teamSettings/integrations/OneTimeCredentialsModal';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock, MockInstance } from 'vitest';

vi.mock('axios', async () => ({
  ...(await vi.importActual('axios')),
  __esModule: true,
  default: {
    ...(await vi.importActual<{ default: object }>('axios')).default,
    create: vi.fn(),
  },
}));

vi.mock('@/core/config/env', () => ({
  __esModule: true,
  default: { backendUrl: '/api/v1' },
}));

vi.mock('uuid', () => ({ v4: vi.fn() }));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../core/api/utils', () => ({
  getAPICredentials: vi.fn(),
  getRefreshToken: vi.fn(),
  getDeviceId: vi.fn(),
  isAccessTokenValid: vi.fn(),
  sendErrorLogToServer: vi.fn(),
  handleConnectionError: vi.fn(),
}));

const mockRequestUse = vi.fn();
const mockResponseUse = vi.fn();
const mockApi = {
  interceptors: {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  },
};
// A top-level `await import(...)` isn't supported by this project's `tsconfig.json`
// (`module: commonjs`, frozen for this migration), so these are scoped inside a file-level
// `beforeAll` instead, which still runs once before any test below.
let mockSendErrorLogToServer: Mock;
let mockHandleConnectionError: Mock;
let responseErrorInterceptor: (error: unknown) => Promise<never>;

beforeAll(async () => {
  const mockAxios = (await import('axios')) as unknown as { default: { create: Mock } };
  const mockCreate = mockAxios.default.create;
  ({ sendErrorLogToServer: mockSendErrorLogToServer, handleConnectionError: mockHandleConnectionError } =
    (await import('../../core/api/utils')) as unknown as {
      sendErrorLogToServer: Mock;
      handleConnectionError: Mock;
    });

  mockCreate.mockReturnValue(mockApi);
  await import('../../core/api/Api');
  responseErrorInterceptor = mockResponseUse.mock.calls[0][1] as typeof responseErrorInterceptor;
});

const serializedCalls = (spy: MockInstance): string => JSON.stringify(spy.mock.calls);
const secretRepresentations = (secret: string): string[] => [
  secret,
  encodeURIComponent(secret),
  window.btoa(secret),
  JSON.stringify(secret).slice(1, -1),
  `Bearer ${secret}`,
  `client_secret=${secret}`,
];
const expectNoSecretRepresentation = (spy: MockInstance, secret: string): void => {
  const calls = serializedCalls(spy);
  secretRepresentations(secret).forEach((representation) => expect(calls).not.toContain(representation));
};
let restoreIndexedDb = (): void => undefined;

const installIndexedDbTestDouble = (): {
  restore: () => void;
  writeSpies: Mock[];
  boundarySpies: Mock[];
} => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
  const add = vi.fn();
  const put = vi.fn();
  const objectStore = { add, put };
  const transactionObjectStore = vi.fn(() => objectStore);
  const transaction = vi.fn(() => ({ objectStore: transactionObjectStore }));
  const createObjectStore = vi.fn(() => objectStore);
  const open = vi.fn(() => {
    const request: {
      result: { createObjectStore: typeof createObjectStore; transaction: typeof transaction };
      onerror: ((event: Event) => void) | null;
      onsuccess: ((event: Event) => void) | null;
      onupgradeneeded: ((event: Event) => void) | null;
    } = {
      result: { createObjectStore, transaction },
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      request.onupgradeneeded?.(new Event('upgradeneeded'));
      request.onsuccess?.(new Event('success'));
    });
    return request;
  });
  const deleteDatabase = vi.fn();

  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: { deleteDatabase, open },
  });

  return {
    boundarySpies: [open, deleteDatabase, createObjectStore, transaction, transactionObjectStore],
    restore: () => {
      if (originalDescriptor) Object.defineProperty(window, 'indexedDB', originalDescriptor);
      else Reflect.deleteProperty(window, 'indexedDB');
    },
    writeSpies: [add, put],
  };
};

describe('OAuth client secret telemetry isolation', () => {
  beforeEach(() => {
    // `vi.restoreAllMocks()` below only restores spies created with `vi.spyOn` — it doesn't reset
    // call history on the plain `vi.fn()` mocks from `vi.mock(...)` factories (e.g.
    // `mockHandleConnectionError`), so without this they'd otherwise accumulate calls across
    // `it.each` iterations, which would make a `toHaveBeenCalledTimes(1)` assertion iteration-order
    // dependent instead of a true per-test check.
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreIndexedDb();
    restoreIndexedDb = () => undefined;
    vi.restoreAllMocks();
  });

  it.each([
    ['/organizations/acme/oauth-clients', 'POST', false],
    ['/organizations/acme/oauth-clients/client-1/rotate-secret?audit=true#result', 'post', false],
    ['/organizations/acme/oauth-clients/client-1', 'GET', true],
  ])('does not expose the response body for %s', async (url, method, eligibleBodyFailure) => {
    const secretSentinel = 'OAUTH_CLIENT_SECRET_SENTINEL:/+="quoted"';
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
    const persistenceSpies = [
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(window.history, 'pushState'),
      vi.spyOn(window.history, 'replaceState'),
    ];
    const indexedDb = installIndexedDbTestDouble();
    restoreIndexedDb = indexedDb.restore;
    mockHandleConnectionError.mockImplementationOnce(() => {
      throw new Error(secretSentinel);
    });
    const readResponseBody = vi.fn();
    const responseFixture = {
      config: { method, url },
      data: { clientSecret: secretSentinel },
    };
    const response = new Proxy(responseFixture, {
      get: (target, property, receiver) => {
        if (property === 'data') {
          readResponseBody();
          if (eligibleBodyFailure) throw new Error(secretSentinel);
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const error = Object.assign(new Error('mock axios error'), {
      isAxiosError: true,
      config: response.config,
      response,
    });

    let rejectedOriginalError = false;
    try {
      await responseErrorInterceptor(error);
    } catch (caught) {
      rejectedOriginalError = caught === error;
    }
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(rejectedOriginalError).toBe(true);
    expect(readResponseBody).toHaveBeenCalledTimes(eligibleBodyFailure ? 1 : 0);
    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    // `response.data` is a Proxy trap that can throw on access, so this checks call-argument
    // identity (`toBe`) rather than `toHaveBeenCalledWith`'s deep equality, which would otherwise
    // traverse into `.data` and trip the trap even though the reference matches.
    expect(mockHandleConnectionError).toHaveBeenCalledTimes(1);
    expect(mockHandleConnectionError.mock.calls[0][0]).toBe(error);
    [...consoleSpies, ...persistenceSpies, ...indexedDb.boundarySpies, ...indexedDb.writeSpies].forEach((spy) => {
      expectNoSecretRepresentation(spy, secretSentinel);
    });
    expectNoSecretRepresentation(mockSendErrorLogToServer, secretSentinel);
  });

  it('keeps the visible one-time secret away from persistence, history, console, telemetry, and error channels', async () => {
    const secretSentinel = 'OAUTH_CLIENT_SECRET_SENTINEL_COMPONENT:/+="quoted"';
    const user = userEvent.setup();
    const clipboardWrite = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
    const persistenceSpies = [
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(window.history, 'pushState'),
      vi.spyOn(window.history, 'replaceState'),
    ];
    const indexedDb = installIndexedDbTestDouble();
    restoreIndexedDb = indexedDb.restore;
    const windowError = vi.fn();
    window.addEventListener('error', windowError);
    const onDone = vi.fn();
    const view = render(
      React.createElement(OneTimeCredentialsModal, {
        credentials: { clientId: 'component-client-id', clientSecret: secretSentinel },
        isOpen: true,
        onDone,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'team_seatings.integrations.credentials.copy.client_secret' }));
    expect(clipboardWrite).toHaveBeenCalledWith(secretSentinel);
    await user.click(screen.getByRole('checkbox', { name: 'team_seatings.integrations.credentials.acknowledge' }));
    await user.click(screen.getByRole('button', { name: 'team_seatings.integrations.credentials.done' }));
    view.unmount();
    window.removeEventListener('error', windowError);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    expect(windowError).not.toHaveBeenCalled();
    [...consoleSpies, ...persistenceSpies, ...indexedDb.boundarySpies, ...indexedDb.writeSpies].forEach((spy) => {
      expectNoSecretRepresentation(spy, secretSentinel);
    });
    expectNoSecretRepresentation(mockSendErrorLogToServer, secretSentinel);
    secretRepresentations(secretSentinel).forEach((representation) => {
      expect(window.location.href).not.toContain(representation);
    });
  });
});
