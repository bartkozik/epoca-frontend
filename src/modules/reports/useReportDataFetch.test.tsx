import { showModuleErrorToast } from '@/core/utils/helpers';
import { renderHook } from '@testing-library/react';
import { useReportDataFetch } from './useReportDataFetch';

const { state } = vi.hoisted(() => ({
  state: {
    contextOrganizationSlug: 'acme',
    isInitialLoadingContextOrganizationUsers: false,
    isLoadingContextOrganizationUsers: false,
    isLoadingClients: false,
    clientsLoadError: null as Error | null,
  },
}));

vi.mock('@/core/utils/helpers', () => ({ showModuleErrorToast: vi.fn() }));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => state }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ isLoadingReportedProjects: false, reportedProjectsLoadError: null }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: () => state }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    contextOrganizationSlug: 'acme',
    isInitialLoadingContextOrganizationUsers: false,
    isLoadingContextOrganizationUsers: false,
    isLoadingClients: false,
    clientsLoadError: null,
  });
});

it('shows loading until the first metadata attempt settles', () => {
  state.isInitialLoadingContextOrganizationUsers = true;
  const { result, rerender } = renderHook(useReportDataFetch);
  expect(result.current.isLoadingData).toBe(true);
  state.isInitialLoadingContextOrganizationUsers = false;
  rerender();
  expect(result.current.isLoadingData).toBe(false);
});

it('keeps report content mounted when an errored users query retries without cached data', () => {
  state.isLoadingContextOrganizationUsers = true;
  const { result, rerender } = renderHook(useReportDataFetch);
  expect(result.current.isLoadingData).toBe(false);
  state.isInitialLoadingContextOrganizationUsers = true;
  rerender();
  expect(result.current.isLoadingData).toBe(false);
});

it('preserves error reporting and mounted content through a retry after an initial metadata failure', () => {
  state.isLoadingClients = true;
  const { result, rerender } = renderHook(useReportDataFetch);
  expect(result.current.isLoadingData).toBe(true);
  const error = new Error('metadata unavailable');
  state.isLoadingClients = false;
  state.clientsLoadError = error;
  rerender();
  expect(result.current.isLoadingData).toBe(false);
  expect(showModuleErrorToast).toHaveBeenCalledWith(error, { default: 'toast_message.common.data_fetch_error' });
  state.isLoadingClients = true;
  state.clientsLoadError = null;
  rerender();
  expect(result.current.isLoadingData).toBe(false);
  expect(showModuleErrorToast).toHaveBeenCalledTimes(1);
});

it('starts a new loading lifecycle on each organization switch', () => {
  const { result, rerender } = renderHook(useReportDataFetch);
  expect(result.current.isLoadingData).toBe(false);
  state.contextOrganizationSlug = 'other';
  state.isInitialLoadingContextOrganizationUsers = true;
  rerender();
  expect(result.current.isLoadingData).toBe(true);
  state.isInitialLoadingContextOrganizationUsers = false;
  rerender();
  expect(result.current.isLoadingData).toBe(false);
  state.contextOrganizationSlug = 'acme';
  state.isInitialLoadingContextOrganizationUsers = true;
  rerender();
  expect(result.current.isLoadingData).toBe(true);
});
