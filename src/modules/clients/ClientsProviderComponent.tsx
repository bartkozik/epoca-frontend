import { queryClient } from '@/core/api';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { getClientFilterTypeOptions } from '@/core/utils/options';
import { clientProjectsQueryKey } from '@/modules/clients/queryKeys';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { toProject } from '@/modules/projects/modelProject';
import { useCallback, useMemo, useState } from 'react';
import i18n from 'i18next';
import { ClientsContext, type ClientsContextValue } from './ClientsContext';
import { useClientsListQuery } from './hooks/useClientsQuery';
import { toClient } from './modelClient';
import * as requests from './requests';
import type { Client } from './types';
import { ClientFilterType } from './types';

export function ClientsProvider({ children }: React.PropsWithChildren): JSX.Element {
  const { contextOrganizationSlug } = useWorkspace();
  const dto = useMemo(
    () => ({ organizationSlug: contextOrganizationSlug, includeArchived: true, includeArchivedConnections: true }),
    [contextOrganizationSlug],
  );
  const clientsQuery = useClientsListQuery(dto, contextOrganizationSlug !== '');
  const clients = useMemo(() => (clientsQuery.data?.results ?? []).map(toClient), [clientsQuery.data]);
  const [client, setClientState] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedFilterTypeMemberProject, setSelectedFilterTypeMemberProjects] = useState(ClientFilterType.All);
  const [isAddClientProjectModalOpen, setAddClientProjectModalOpen] = useState(false);
  const [isLoadingClientDetails, setLoadingClientDetails] = useState(false);

  const setClient = useCallback((nextClient: Client): void => {
    setClientState((current) =>
      current?.id === nextClient.id ? { ...nextClient, projects: current.projects } : nextClient,
    );
  }, []);
  const refetchClients = clientsQuery.refetch;
  const fetchClients = useCallback(async (): Promise<Client[]> => {
    const result = await refetchClients();
    if (result.error) {
      showModuleErrorToast(result.error, { default: i18n.t('toast_message.clients.data_fetch_error') });
      return [];
    }
    return (result.data?.results ?? []).map(toClient);
  }, [refetchClients]);
  const fetchClientProjects = useCallback(
    async (clientId: string): Promise<void> => {
      setLoadingClientDetails(true);
      try {
        const data = await queryClient.fetchQuery({
          queryKey: clientProjectsQueryKey(contextOrganizationSlug, clientId),
          queryFn: () =>
            requests.getClientProjects(contextOrganizationSlug, clientId).then((response) => response.data),
        });
        const projects = data.results.map(toProject).sort((a, b) => a.name.localeCompare(b.name));
        setClientState((current) => (current?.id === clientId ? { ...current, projects } : current));
      } catch (error) {
        showModuleErrorToast(error, { default: i18n.t('toast_message.projects.data_fetch_error') });
      } finally {
        setLoadingClientDetails(false);
      }
    },
    [contextOrganizationSlug],
  );
  const removeAllClients = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['clients'] });
    setClientState(null);
    setSelectedClient(null);
  }, []);
  const value: ClientsContextValue = {
    clients,
    clientsLoadError: clientsQuery.error,
    isLoadingClients: clientsQuery.isLoading,
    client,
    selectedClient,
    selectedFilterTypeMemberProject,
    selectedFilterTypeOptionMembersProjects: getClientFilterTypeOptions().find(
      ({ value }) => value === selectedFilterTypeMemberProject,
    ),
    isAddClientProjectModalOpen,
    isLoadingClientDetails,
    clientsOptions: clients.filter(({ archived }) => !archived).map(({ id, name }) => ({ value: id, label: name })),
    setClient,
    setSelectedClient,
    setSelectedFilterTypeMemberProjects,
    handleFilterTypeSelectMemberProjects: ({ value }) => setSelectedFilterTypeMemberProjects(value),
    resetSelectedFilterType: () => setSelectedFilterTypeMemberProjects(ClientFilterType.All),
    openAddClientProjectModal: (nextClient) => {
      setSelectedClient(nextClient);
      setAddClientProjectModalOpen(true);
    },
    closeAddClientProjectModal: () => {
      setSelectedClient(null);
      setAddClientProjectModalOpen(false);
    },
    fetchClients,
    fetchClientProjects,
    removeAllClients,
  };
  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}
