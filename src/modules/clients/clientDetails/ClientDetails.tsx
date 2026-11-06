import GoBack from '@/core/theme/goBack';
import ItemLogo from '@/core/theme/itemLogo';
import LoadingArea from '@/core/theme/loadingArea';
import MainContent from '@/core/theme/mainContent';
import PageLayout from '@/core/theme/pageLayout';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import Tabs from '@/core/theme/tabs';
import { readFromListSearch, showModuleErrorToast } from '@/core/utils/helpers';
import { useTitle } from '@/core/utils/hooks';
import AssignedProjects from '@/modules/clients/assignedProjects';
import ClientDetailsForm from '@/modules/clients/clientsDetailsForm';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useClientQuery } from '@/modules/clients/hooks/useClientQuery';
import { toClient } from '@/modules/clients/modelClient';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { clientsPaths } from '../routes';
import styles from './ClientDetails.module.scss';

function ClientDetails(): JSX.Element | null {
  const { setClient } = useClients();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId, tab } = useParams();
  const clientQuery = useClientQuery(clientId);
  const client = useMemo(() => (clientQuery.data ? toClient(clientQuery.data) : undefined), [clientQuery.data]);

  useEffect(() => {
    if (client) setClient(client);
  }, [client]);

  useEffect(() => {
    if (clientQuery.isError)
      showModuleErrorToast(clientQuery.error, { default: t('toast_message.clients.data_fetch_error') });
  }, [clientQuery.error, clientQuery.isError, t]);

  const TABS = [
    {
      value: 'client-details',
      label: t('clients.common.client_details'),
      element: client ? <ClientDetailsForm client={client} /> : null,
    },
    {
      value: 'assigned-projects',
      label: t('clients.client_details.tabs.assigned_projects'),
      element: <AssignedProjects />,
    },
  ];

  useTitle(TABS.find(({ value }) => value === tab)?.label ?? '');

  const onTabClick = (value: string): void | undefined => {
    if (!clientId) return;
    navigate(
      { pathname: clientsPaths.details(clientId, value), search: location.search },
      { state: location.state as unknown },
    );
  };

  return (
    <ScrolledContainer>
      <MainContent>
        <GoBack
          href={`${clientsPaths.main}${readFromListSearch(location.state)}`}
          label={t('clients.client_details.go_back_back_to_clients_list.label')}
        />
        <LoadingArea loading={clientQuery.isLoading}>
          {client && (
            <PageLayout
              avatar={<ItemLogo item={client} className={styles.clientLogo} dataTestId="clientLogo" />}
              sectionName={client.name}
              title={t('clients.common.client_details')}
            >
              <Tabs onTabClick={onTabClick} tabs={TABS} />
            </PageLayout>
          )}
        </LoadingArea>
      </MainContent>
    </ScrolledContainer>
  );
}

export default ClientDetails;
