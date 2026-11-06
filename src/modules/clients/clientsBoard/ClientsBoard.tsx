import { useToast } from '@/core/providers/toastProvider';
import noProjectsImage from '@/core/theme/assets/images/projectsComponentImages/teamWorkImage.png';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import NoDataFound from '@/core/theme/noDataFound';
import SortableHeadCell from '@/core/theme/sortableHeadCell';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { useClients } from '@/modules/clients/ClientsProvider';
import {
  getToggleClientArchiveToastKey,
  useToggleClientArchiveMutation,
} from '@/modules/clients/hooks/useToggleClientArchiveMutation';
import { toClient } from '@/modules/clients/modelClient';
import { RawClient } from '@/modules/clients/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import i18n from 'i18next';
import ClientRow from './clientRow';
import styles from './ClientsBoard.module.scss';

const COLUMNS = [SortColumn.Client, SortColumn.DateAdded];

interface ClientsBoardProps {
  clients: RawClient[];
  isStatusArchived: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  updateSort: (column: SortColumn) => void;
}

function ClientsBoard({
  clients,
  isStatusArchived,
  sortColumn,
  sortDirection,
  updateSort,
}: ClientsBoardProps): JSX.Element {
  const { addToast } = useToast();
  const { openAddClientProjectModal } = useClients();
  const { t } = useTranslation();
  const toggleArchiveMutation = useToggleClientArchiveMutation();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isArchiveClientModalOpen, setIsArchiveClientModalOpen] = useState(false);

  const sortedClients = clients.map(toClient).sort((a, b) => {
    let compare = 0;
    if (sortColumn === SortColumn.Client) compare = a.name.localeCompare(b.name);
    if (sortColumn === SortColumn.DateAdded)
      compare = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortDirection === SortDirection.Asc ? -compare : compare;
  });

  const selectedClient = sortedClients.find((c) => c.id === selectedClientId) ?? null;

  const table = (
    <table className={clsx('table', styles.tableCustom, { [styles.tableArchivedClients]: isStatusArchived })}>
      <thead>
        <tr>
          <th data-th="Logo">{t('clients.common.logo')}</th>
          {COLUMNS.map((c) => (
            <SortableHeadCell
              key={c}
              column={c}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              updateSort={updateSort}
            />
          ))}
          <th data-th="Type">{t('common.type')}</th>
          <th></th>
        </tr>
      </thead>

      <tbody>
        {sortedClients.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            onArchive={(clientId) => {
              setSelectedClientId(clientId);
              setIsArchiveClientModalOpen(true);
            }}
            onNewProjectAdd={() => openAddClientProjectModal(c)}
          />
        ))}
      </tbody>
    </table>
  );

  const noDataFound = (
    <NoDataFound withoutButton image={noProjectsImage} label={t('clients.clients_board.text.no_clients_found')} />
  );

  const confirmationActions: ConfirmationAction[] = [
    {
      text: selectedClient?.archived ? t('common.unarchive') : t('common.archive'),
      action: () => {
        if (!selectedClient) return;
        toggleArchiveMutation.mutate(
          { clientId: selectedClient.id, isCurrentlyArchived: selectedClient.archived },
          {
            onSuccess: (_data, { isCurrentlyArchived }) => {
              addToast({ content: i18n.t(getToggleClientArchiveToastKey(isCurrentlyArchived, 'success')) });
            },
            onError: (error, { isCurrentlyArchived }) => {
              showModuleErrorToast(error, {
                default: i18n.t(getToggleClientArchiveToastKey(isCurrentlyArchived, 'failed')),
              });
            },
          },
        );
        setIsArchiveClientModalOpen(false);
        setSelectedClientId(null);
      },
    },
  ];

  const confirmationMessage = selectedClient?.archived
    ? t('confirmation.message.unarchive')
    : t('clients.common.confirmation.message.archive');

  return (
    <>
      {sortedClients.length > 0 ? table : noDataFound}

      <Confirmation
        actionType="archive"
        confirmActions={confirmationActions}
        isOpen={isArchiveClientModalOpen}
        onCancel={() => {
          setIsArchiveClientModalOpen(false);
          setSelectedClientId(null);
        }}
        text={confirmationMessage}
      />
    </>
  );
}

export default ClientsBoard;
