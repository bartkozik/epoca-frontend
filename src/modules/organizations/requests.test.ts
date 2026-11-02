import api from '@/core/api';
import { OrganizationUserRole } from '@/core/models/enums';
import { addToast } from '@/core/providers/toastProvider';
import type { MockedFunction } from 'vitest';
import {
  addNewOrganization,
  assignUserToOrganization,
  deassignUserFromOrganization,
  deleteOrganization,
  editOrganization,
  getOrganizationBySlug,
  getOrganizations,
  getOrganizationUserProjects,
  getOrganizationUsers,
} from './requests';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/core/providers/toastProvider', () => ({ addToast: vi.fn() }));

// requests.ts calls i18n.t() (via notifyIncompleteList) directly, and nothing in this test
// initializes the real i18n singleton -- stub it to return the key, matching
// clients/requests.test.ts's precedent for the same reason.
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

// api mock, see src/modules/integrationClients/requests.test.ts for the full rationale.
// eslint-disable-next-line vitest/unbound-method
const getMock = api.get as MockedFunction<typeof api.get>;
// eslint-disable-next-line vitest/unbound-method
const postMock = api.post as MockedFunction<typeof api.post>;
// eslint-disable-next-line vitest/unbound-method
const patchMock = api.patch as MockedFunction<typeof api.patch>;
// eslint-disable-next-line vitest/unbound-method
const deleteMock = api.delete as MockedFunction<typeof api.delete>;
const addToastMock = addToast as MockedFunction<typeof addToast>;

const rawOrganization = {
  archivedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: { id: 'user-1' },
  id: 'org-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: { id: 'user-1' },
  name: 'Acme',
  slug: 'acme',
};

const rawOrganizationUser = {
  avatar: '',
  firstName: 'Ada',
  id: 'user-1',
  identities: [],
  lastName: 'Lovelace',
  organizationRoles: [OrganizationUserRole.Owner],
  archived: false,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('organizations requests', () => {
  it('gets and parses the organizations list', async () => {
    getMock.mockResolvedValueOnce({ data: { count: 1, results: [{ ...rawOrganization, futureField: 'ignored' }] } });

    const { data } = await getOrganizations();

    expect(getMock).toHaveBeenCalledWith('/organizations');
    expect(data).toEqual({ count: 1, results: [rawOrganization] });
  });

  it('drops an organization with a malformed load-bearing field instead of rejecting the whole list', async () => {
    // mockResolvedValue (not Once): count (2) still exceeds the one valid result after the
    // malformed entry is dropped, so getOrganizations retries once against the same data.
    getMock.mockResolvedValue({
      data: { count: 2, results: [rawOrganization, { ...rawOrganization, slug: undefined }] },
    });

    const { data } = await getOrganizations();

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(data.results).toEqual([rawOrganization]);
  });

  describe('incomplete page retry', () => {
    it('retries once and returns the complete page without a toast when the retry succeeds', async () => {
      getMock.mockResolvedValueOnce({ data: { count: 2, results: [rawOrganization] } }).mockResolvedValueOnce({
        data: { count: 2, results: [rawOrganization, { ...rawOrganization, id: 'org-2', slug: 'acme-2' }] },
      });

      const { data } = await getOrganizations();

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(data).toEqual({
        count: 2,
        results: [rawOrganization, { ...rawOrganization, id: 'org-2', slug: 'acme-2' }],
      });
      expect(addToastMock).not.toHaveBeenCalled();
    });

    it('retries once, shows a non-blocking warning toast, and still returns the partial data when still incomplete', async () => {
      getMock.mockResolvedValue({ data: { count: 2, results: [rawOrganization] } });

      const { data } = await getOrganizations();

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(data).toEqual({ count: 2, results: [rawOrganization] });
      expect(addToastMock).toHaveBeenCalledTimes(1);
      expect(addToastMock).toHaveBeenCalledWith({
        content: 'toast_message.organizations.incomplete_list',
        type: 'warning',
      });
    });
  });

  it('gets and parses a single organization by slug', async () => {
    getMock.mockResolvedValueOnce({ data: rawOrganization });

    const { data } = await getOrganizationBySlug('acme');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme');
    expect(data).toEqual(rawOrganization);
  });

  it('creates an organization and parses the response', async () => {
    postMock.mockResolvedValueOnce({ data: rawOrganization });

    const { data } = await addNewOrganization('Acme', 'acme');

    expect(postMock).toHaveBeenCalledWith('/organizations', { name: 'Acme', slug: 'acme' });
    expect(data).toEqual(rawOrganization);
  });

  // editOrganization returns Promise<void> -- no caller reads the response body today, only the
  // PATCH request itself and the boundary validation it triggers matter here.
  it('edits an organization, validating the response as a boundary check', async () => {
    patchMock.mockResolvedValueOnce({ data: rawOrganization });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await editOrganization('acme', 'Acme Renamed');

    expect(patchMock).toHaveBeenCalledWith('/organizations/acme', { name: 'Acme Renamed' });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('logs instead of throwing when the edit response body is empty', async () => {
    patchMock.mockResolvedValueOnce({ data: {} });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(editOrganization('acme', 'Acme Renamed')).resolves.not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('deletes an organization', async () => {
    deleteMock.mockResolvedValueOnce({ data: undefined });

    await deleteOrganization('acme');

    expect(deleteMock).toHaveBeenCalledWith('/organizations/acme');
  });

  it('excludes archived users by default', async () => {
    getMock.mockResolvedValueOnce({ data: [rawOrganizationUser] });

    const { data } = await getOrganizationUsers('acme');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/users', {
      params: { includeArchived: false },
    });
    expect(data).toEqual([rawOrganizationUser]);
  });

  it('can request archived users for historical reports', async () => {
    getMock.mockResolvedValueOnce({ data: [rawOrganizationUser] });

    const { data } = await getOrganizationUsers('acme', true);

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/users', {
      params: { includeArchived: true },
    });
    expect(data).toEqual([rawOrganizationUser]);
  });

  it('gets and parses an organization user’s projects', async () => {
    const rawProject = {
      clientId: 'client-1',
      clientName: 'Client',
      projectId: 'project-1',
      projectName: 'Project',
      role: OrganizationUserRole.Owner,
    };
    getMock.mockResolvedValueOnce({ data: [rawProject] });

    const { data } = await getOrganizationUserProjects('acme', 'user-1');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/users/user-1/details');
    expect(data).toEqual([rawProject]);
  });

  it('assigns a user to an organization', async () => {
    postMock.mockResolvedValueOnce({ data: undefined });

    await assignUserToOrganization('acme', 'user-1', [OrganizationUserRole.Manager]);

    expect(postMock).toHaveBeenCalledWith('/organizations/acme/users/assign', {
      userId: 'user-1',
      roles: [OrganizationUserRole.Manager],
    });
  });

  it('deassigns a user from an organization', async () => {
    postMock.mockResolvedValueOnce({ data: undefined });

    await deassignUserFromOrganization('acme', 'user-1');

    expect(postMock).toHaveBeenCalledWith('/organizations/acme/users/deassign', { userId: 'user-1' });
  });
});
