import dayjs from 'dayjs';
import type { ReportFilters } from './useReportFilters';

export const buildFilters = (overrides: Partial<ReportFilters> = {}): ReportFilters => ({
  navigationMode: 'fixed-length',
  selectedClients: {},
  selectedProjects: {},
  selectedUsers: {},
  selectedFromDate: dayjs().startOf('month'),
  selectedToDate: null,
  clientsSearchOptions: [],
  contextOrganizationUserSearchOptions: [],
  projectsSearchOptions: [],
  areAllProjectsSelected: false,
  areAllUsersSelected: false,
  areAllClientsSelected: false,
  updatedSelectedProjectsKeys: [],
  updatedSelectedClientsKeys: [],
  updatedSelectedUsersKeys: [],
  setSelectedDateRange: vi.fn(),
  setSelectedProjects: vi.fn(),
  setSelectedUsers: vi.fn(),
  setSelectedClients: vi.fn(),
  setSelectedFilters: vi.fn(),
  ...overrides,
});
