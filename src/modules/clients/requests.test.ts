import api from '@/core/api';
import { ClientType } from '@/core/models/enums';
import { addToast } from '@/core/providers/toastProvider';
import type { MockedFunction, MockInstance } from 'vitest';
import { addNewClient, editClient, getClient, getClients } from './requests';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/core/providers/toastProvider', () => ({ addToast: vi.fn() }));

// requests.ts calls i18n.t() directly (not through react-i18next's useTranslation), and nothing in
// this test initializes the real i18n singleton -- stub it to return the key, matching
// useSamlAuthCheckQuery.test.ts's precedent for the same reason.
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

// api mock, see src/modules/integrationClients/requests.test.ts for the full rationale.
// eslint-disable-next-line vitest/unbound-method
const getMock = api.get as MockedFunction<typeof api.get>;
// eslint-disable-next-line vitest/unbound-method
const postMock = api.post as MockedFunction<typeof api.post>;
// eslint-disable-next-line vitest/unbound-method
const patchMock = api.patch as MockedFunction<typeof api.patch>;
const addToastMock = addToast as MockedFunction<typeof addToast>;

const rawClient = {
  archivedAt: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  createdByDetails: { id: 'user-1' },
  id: 'client-1',
  logo: '',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  modifiedByDetails: { id: 'user-1' },
  name: 'Acme',
  organizationId: 'org-1',
  projectCount: 0,
  texture: 'texture-1',
  type: ClientType.External,
};

const editClientArgs = {
  clientId: 'client-1',
  name: 'Acme Renamed',
  color: '#000000',
  texture: 'texture-1',
  logo: '',
  type: ClientType.External,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('clients requests', () => {
  it('parses a paginated client list, stripping unrecognized fields', async () => {
    getMock.mockResolvedValueOnce({ data: { count: 1, results: [{ ...rawClient, futureField: 'ignored' }] } });

    const { data } = await getClients({ organizationSlug: 'acme' });

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/clients', { params: {} });
    expect(data).toEqual({ count: 1, results: [rawClient] });
  });

  it('preserves the full Axios response shape, not just data', async () => {
    getMock.mockResolvedValueOnce({
      data: { count: 1, results: [rawClient] },
      status: 200,
      headers: { 'x-correlation-id': 'abc' },
    });

    const response = await getClients({ organizationSlug: 'acme' });

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'x-correlation-id': 'abc' });
  });

  it('drops a client with a malformed load-bearing field instead of rejecting the whole list', async () => {
    // mockResolvedValue (not Once): the page stays incomplete after the drop, so getClients retries.
    getMock.mockResolvedValue({
      data: { count: 2, results: [rawClient, { ...rawClient, id: undefined }] },
    });

    const { data } = await getClients({ organizationSlug: 'acme' });

    expect(data.results).toEqual([rawClient]);
  });

  describe('incomplete page retry', () => {
    it('retries once and returns the complete page without a toast when the retry succeeds', async () => {
      getMock
        .mockResolvedValueOnce({ data: { count: 2, results: [rawClient] } })
        .mockResolvedValueOnce({ data: { count: 2, results: [rawClient, { ...rawClient, id: 'client-2' }] } });

      const { data } = await getClients({ organizationSlug: 'acme' });

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(data).toEqual({ count: 2, results: [rawClient, { ...rawClient, id: 'client-2' }] });
      expect(addToastMock).not.toHaveBeenCalled();
    });

    it('retries once, shows a non-blocking warning toast, and still returns the partial data when still incomplete', async () => {
      getMock.mockResolvedValue({ data: { count: 2, results: [rawClient] } });

      const { data } = await getClients({ organizationSlug: 'acme' });

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(data).toEqual({ count: 2, results: [rawClient] });
      expect(addToastMock).toHaveBeenCalledTimes(1);
      expect(addToastMock).toHaveBeenCalledWith({
        content: 'toast_message.clients.incomplete_list',
        type: 'warning',
      });
    });
  });

  it('gets and parses a single client by id', async () => {
    getMock.mockResolvedValueOnce({ data: { count: 1, results: [rawClient] } });

    const { data } = await getClient('acme', 'client-1');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/clients', {
      params: { id: 'client-1', includeArchived: true },
    });
    expect(data).toEqual({ count: 1, results: [rawClient] });
  });

  it('creates a client and parses the response', async () => {
    postMock.mockResolvedValueOnce({ data: rawClient });

    const { data } = await addNewClient('acme', 'Acme', '#000000', 'texture-1', '', ClientType.External);

    expect(postMock).toHaveBeenCalledWith('/organizations/acme/clients', {
      name: 'Acme',
      color: '#000000',
      texture: 'texture-1',
      logo: '',
      type: ClientType.External,
    });
    expect(data).toEqual(rawClient);
  });

  // editClient returns Promise<void> (see requests.ts) -- only the PATCH request itself and the
  // boundary validation it triggers matter here.
  describe('editClient response validation', () => {
    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('edits a client, validating the response as a boundary check', async () => {
      patchMock.mockResolvedValueOnce({ data: rawClient });

      await editClient('acme', editClientArgs);

      expect(patchMock).toHaveBeenCalledWith('/organizations/acme/clients/client-1', {
        name: 'Acme Renamed',
        color: '#000000',
        texture: 'texture-1',
        logo: '',
        type: ClientType.External,
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    // Regression guard: an empty/partial PATCH echo (e.g. 204) must not throw and fail an edit the
    // backend actually applied -- see clientUpdate.model.ts. It's still logged, so a persistently
    // malformed echo stays observable.
    it('logs instead of throwing when the response body is empty', async () => {
      patchMock.mockResolvedValueOnce({ data: {} });

      await expect(editClient('acme', editClientArgs)).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
