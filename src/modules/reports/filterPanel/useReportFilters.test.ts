import { OrganizationUserRole } from '@/modules/organizations/types';
import { act, renderHook } from '@testing-library/react';
import { useReportFilters } from './useReportFilters';

vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => ({ clients: [client] }) }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ reportedProjects: [project] }),
}));
vi.mock('@/modules/reports/hooks/useReportUsers', () => ({ useReportUsers: () => reportUsers }));

const project = { id: 'project-1', name: 'Epoca' };
const client = { id: 'client-1', name: 'Iterators' };
const eligibleUser = { id: 'user-1', fullName: 'Eligible User', organizationRoles: [] };
const externalUser = { id: 'user-2', fullName: 'External User', organizationRoles: [OrganizationUserRole.External] };
const reportUsers = [eligibleUser, externalUser];

describe('useReportFilters', () => {
  it('excludes external organization members from areAllUsersSelected, fixing the dead fetchUsers gap', () => {
    const { result } = renderHook(() => useReportFilters());

    expect(result.current.areAllUsersSelected).toBe(false);
    act(() => result.current.setSelectedUsers({ 'user-1': 'Eligible User' }));
    expect(result.current.areAllUsersSelected).toBe(true);
  });

  it('always offers the full option lists, whatever is selected', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => result.current.setSelectedFilters({ clients: {}, projects: { 'project-1': 'Epoca' }, users: {} }));

    expect(result.current.projectsSearchOptions).toEqual([
      { value: 'project-1', label: 'Epoca', archivedStatus: undefined },
    ]);
    expect(result.current.contextOrganizationUserSearchOptions.map(({ value }) => value)).toEqual(['user-1']);
    expect(result.current.clientsSearchOptions.map(({ value }) => value)).toEqual(['client-1']);
  });

  it('replaces all three selections at once', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() =>
      result.current.setSelectedFilters({
        clients: { 'client-1': 'Iterators' },
        projects: { 'project-1': 'Epoca' },
        users: {},
      }),
    );
    act(() => result.current.setSelectedFilters({ clients: {}, projects: {}, users: {} }));

    expect(result.current.selectedClients).toEqual({});
    expect(result.current.selectedProjects).toEqual({});
  });
});
