import api from '@/core/api';
import { ClientType, ProjectUserRole } from '@/core/models/enums';
import { addToast } from '@/core/providers/toastProvider';
import type { MockedFunction } from 'vitest';
import { editProject, getProjects } from './requests';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    patch: vi.fn(),
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
const patchMock = api.patch as MockedFunction<typeof api.patch>;
const addToastMock = addToast as MockedFunction<typeof addToast>;

const validClient = {
  color: '#000000',
  id: 'client-1',
  name: 'Acme',
  texture: 'texture-1',
  type: ClientType.External,
};

const validProjectUser = {
  avatar: '',
  firstName: 'Jane',
  id: 'user-1',
  lastName: 'Doe',
  role: ProjectUserRole.Owner,
};

const validRawProject = {
  archivedAt: '',
  client: validClient,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: 'A project',
  id: 'project-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Website Redesign',
  organizationId: 'org-1',
  projectUsers: [validProjectUser],
  userCount: 1,
  userIds: ['user-1'],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('projects requests', () => {
  describe('getProjects', () => {
    it('validates and returns the parsed results', async () => {
      getMock.mockResolvedValueOnce({
        data: { count: 1, results: [{ ...validRawProject, futureField: 'ignored' }] },
      });

      const { data } = await getProjects({ organizationSlug: 'acme', includeArchived: true });

      expect(getMock).toHaveBeenCalledTimes(1);
      expect(getMock).toHaveBeenCalledWith('/organizations/acme/projects', { params: { includeArchived: true } });
      expect(data).toEqual({ count: 1, results: [validRawProject] });
    });

    it('drops a project with a malformed load-bearing field instead of rejecting the whole list', async () => {
      // mockResolvedValue (not Once): the page stays incomplete after the drop, so getProjects retries.
      const { client: _client, ...projectWithoutClient } = validRawProject;
      getMock.mockResolvedValue({
        data: { count: 2, results: [validRawProject, { ...projectWithoutClient, id: 'project-2' }] },
      });

      const { data } = await getProjects({ organizationSlug: 'acme' });

      expect(data.results).toEqual([validRawProject]);
    });

    describe('incomplete page retry', () => {
      it('retries once and returns the complete page without a toast when the retry succeeds', async () => {
        getMock.mockResolvedValueOnce({ data: { count: 2, results: [validRawProject] } }).mockResolvedValueOnce({
          data: { count: 2, results: [validRawProject, { ...validRawProject, id: 'project-2' }] },
        });

        const { data } = await getProjects({ organizationSlug: 'acme' });

        expect(getMock).toHaveBeenCalledTimes(2);
        expect(data).toEqual({ count: 2, results: [validRawProject, { ...validRawProject, id: 'project-2' }] });
        expect(addToastMock).not.toHaveBeenCalled();
      });

      it('retries once, shows a non-blocking warning toast, and still returns the partial data when still incomplete', async () => {
        getMock.mockResolvedValue({ data: { count: 2, results: [validRawProject] } });

        const { data } = await getProjects({ organizationSlug: 'acme' });

        expect(getMock).toHaveBeenCalledTimes(2);
        expect(data).toEqual({ count: 2, results: [validRawProject] });
        expect(addToastMock).toHaveBeenCalledTimes(1);
        expect(addToastMock).toHaveBeenCalledWith({
          content: 'toast_message.projects.incomplete_list',
          type: 'warning',
        });
      });
    });
  });

  // Regression guard: PATCH /organizations/:slug/projects/:id (ProjectRouter ->
  // ProjectUpdateResult.Updated) returns the flat Project domain object -- clientId, not a nested
  // client -- unlike GET/POST which return the list/get DTO shape. Parsing this against
  // RawProjectSchema (which requires client) would throw despite the HTTP 200, leaving the edit
  // form stuck open. This exercises the real requests.ts boundary, not a mocked requests.editProject.
  it('edits a project and parses the flat PATCH response shape', async () => {
    patchMock.mockResolvedValueOnce({
      data: {
        id: 'project-1',
        name: 'Website Renamed',
        description: 'Updated',
        organizationId: 'org-1',
        clientId: 'client-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'user-1',
        modifiedAt: '2024-01-02T00:00:00.000Z',
        modifiedBy: 'user-1',
        archivedAt: null,
        archivedBy: null,
      },
    });

    const { data } = await editProject({
      organizationSlug: 'acme',
      projectId: 'project-1',
      name: 'Website Renamed',
      description: 'Updated',
      memberIds: [],
      ownerIds: [],
    });

    expect(patchMock).toHaveBeenCalledWith('organizations/acme/projects/project-1', {
      name: 'Website Renamed',
      description: 'Updated',
      memberIds: [],
      ownerIds: [],
    });
    expect(data).toEqual({
      id: 'project-1',
      name: 'Website Renamed',
      description: 'Updated',
      organizationId: 'org-1',
      clientId: 'client-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'user-1',
      modifiedAt: '2024-01-02T00:00:00.000Z',
      modifiedBy: 'user-1',
      archivedAt: '',
      archivedBy: '',
    });
  });
});
