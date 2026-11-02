import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { checkClientType } from '@/core/models/checkClientType';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import DataTableLayout from '@/core/theme/dataTableLayout';
import Modal from '@/core/theme/modal';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import { normalizedString, showModuleErrorToast, withFromListSearch } from '@/core/utils/helpers';
import { useTitle } from '@/core/utils/hooks';
import { getClientFilterTypeOptions, getClientStatusOptions } from '@/core/utils/options';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useClientsQuery } from '@/modules/clients/hooks/useClientsQuery';
import { toClient } from '@/modules/clients/modelClient';
import { ClientFilterType, ClientStatus, RawClient } from '@/modules/clients/types';
import { useClientsURLParams } from '@/modules/clients/useClientsURLParams';
import ProjectForm from '@/modules/projects/projectForm';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ClientForm from './clientForm';
import styles from './Clients.module.scss';
import ClientsBoard from './clientsBoard/ClientsBoard';
import { clientsPaths } from './routes';

const TAB_VALUE = {
  clientDetails: 'client-details',
};

function Clients(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { hasAccess } = auth;
  const clientsQuery = useClientsQuery();
  const { setSelectedProject } = useProjects();
  const {
    selectedClient,
    isAddClientProjectModalOpen,
    closeAddClientProjectModal,
    openAddClientProjectModal,
    setSelectedClient,
  } = useClients();

  const {
    query,
    selectedStatus,
    selectedFilterType,
    sortColumn,
    sortDirection,
    setQuery,
    setSelectedStatus,
    setSelectedFilterType,
    updateSort,
    resetFilters,
  } = useClientsURLParams();
  const [isAddNewClientModalOpen, setIsAddNewClientModalOpen] = useState(false);
  const [addedClientId, setAddedClientId] = useState<string | null>(null);
  const [isAddClientProjectConfirmationOpen, setIsAddClientProjectConfirmationOpen] = useState(false);

  useTitle(t('common.clients'));

  // useClientsQuery has no error toast of its own, and an HTTP 500 isn't a network error the api
  // interceptor already handles -- without this a failed fetch looked like an empty list.
  useEffect(() => {
    if (clientsQuery.isError)
      showModuleErrorToast(clientsQuery.error, { default: t('toast_message.clients.data_fetch_error') });
  }, [clientsQuery.error, clientsQuery.isError, t]);

  const clients: RawClient[] = clientsQuery.data?.results ?? [];

  const filteredClients = useMemo(() => {
    const normalizedQuery = normalizedString(query);
    return clients.filter((client) => {
      const isQueryMatch = normalizedString(client.name).includes(normalizedQuery);
      const isStatusMatch = selectedStatus === ClientStatus.Active ? !client.archivedAt : Boolean(client.archivedAt);
      return isQueryMatch && isStatusMatch && checkClientType(client, selectedFilterType);
    });
  }, [clients, query, selectedStatus, selectedFilterType]);

  const isResetVisible =
    selectedStatus !== ClientStatus.Active || selectedFilterType !== ClientFilterType.All || Boolean(query);

  const handleDetailsClick = (): void => {
    if (addedClientId)
      navigate(clientsPaths.details(addedClientId, TAB_VALUE.clientDetails), {
        state: withFromListSearch(location.search),
      });
    setIsAddClientProjectConfirmationOpen(false);
  };

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const searchBarProps = {
    buttonLabel: t('clients.button.add_new_client.label'),
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    handleInputReset: resetFilters,
    handleStatusSelect: (option: { value: ClientStatus }) => setSelectedStatus(option.value),
    handleTypeSelect: (option: { value: ClientFilterType }) => setSelectedFilterType(option.value),
    isAddBtnHidden: restrictedAccess,
    isNoSearchItem: filteredClients.length === 0,
    isResetBtnVisible: isResetVisible,
    openNewItemForm: () => setIsAddNewClientModalOpen(true),
    query,
    selectedStatusOption: getClientStatusOptions().find(({ value }) => value === selectedStatus),
    selectedTypeOption: getClientFilterTypeOptions().find(({ value }) => value === selectedFilterType),
    selectStatusItems: getClientStatusOptions(),
    selectTypeItems: getClientFilterTypeOptions(),
    withSearchInput: true,
    withTypeSelect: true,
  };

  const confirmationActions: ConfirmationAction[] = [
    {
      text: t('common.add_new_project'),
      action: () => {
        setIsAddClientProjectConfirmationOpen(false);
        setSelectedProject(null);
        // selectedClient was set by ClientForm's onCreated handler right after client creation,
        // just above -- guard rather than assert non-null in case that assumption ever breaks.
        if (selectedClient) openAddClientProjectModal(selectedClient);
      },
      buttonType: 'outlined',
      isFocused: true,
    },
    { text: t('clients.common.client_details'), action: handleDetailsClick },
  ];

  return (
    <>
      <ScrolledContainer>
        <DataTableLayout
          btnLabel={t('clients.button.add_new_client.label')}
          headerClassName={styles.headerCustomHeight}
          isSearchBarVisible={!clientsQuery.isLoading && clients.length !== 0}
          noDataFoundWithoutButton={restrictedAccess}
          loading={clientsQuery.isLoading}
          noItemsLabel={t('clients.data_table.no_data.no_client_added')}
          onBtnClick={() => setIsAddNewClientModalOpen(true)}
          searchBarProps={searchBarProps}
          title={t('common.clients')}
        >
          <ClientsBoard
            clients={filteredClients}
            isStatusArchived={selectedStatus === ClientStatus.Archived}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            updateSort={updateSort}
          />
        </DataTableLayout>
      </ScrolledContainer>

      <Modal className={styles.modal} close={() => setIsAddNewClientModalOpen(false)} isOpen={isAddNewClientModalOpen}>
        <ClientForm
          onCancel={() => setIsAddNewClientModalOpen(false)}
          onCreated={(client) => {
            setIsAddNewClientModalOpen(false);
            setAddedClientId(client.id);
            setSelectedClient(toClient(client));
            setIsAddClientProjectConfirmationOpen(true);
          }}
        />
      </Modal>

      <Confirmation
        isOpen={isAddClientProjectConfirmationOpen}
        actionType="success_add"
        confirmActions={confirmationActions}
        cancelBtnText={t('clients.confirmation.text.later')}
        title={t('clients.confirmation.title.client_added_successfully')}
        text={t('clients.confirmation.message.add_project')}
        onCancel={() => setIsAddClientProjectConfirmationOpen(false)}
      />

      <Modal close={closeAddClientProjectModal} className={styles.projectModal} isOpen={isAddClientProjectModalOpen}>
        <ProjectForm onCancel={closeAddClientProjectModal} withoutClientSelect />
      </Modal>
    </>
  );
}

export default Clients;
