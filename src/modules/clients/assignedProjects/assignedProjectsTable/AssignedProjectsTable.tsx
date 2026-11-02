import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import SortableHeadCell from '@/core/theme/sortableHeadCell';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import {
  getToggleProjectArchiveToastKey,
  useToggleProjectArchiveMutation,
} from '@/modules/projects/hooks/useToggleProjectArchiveMutation';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useArchiveProjectModal } from '@/modules/projects/useArchiveProjectModal';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import i18n from 'i18next';
import styles from './AssignedProjectsTable.module.scss';
import { useAssignedProjectsSortURLParams } from './useAssignedProjectsSortURLParams';

interface ArchivableProject {
  id: string;
  archived: boolean;
}

function AssignedMemberRow(): JSX.Element | null {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const projectsContext = useProjects();
  const auth = useAuth();
  const { hasAccess } = auth;
  const { client, openAddClientProjectModal } = useClients();
  const { openEditProjectModal } = projectsContext;
  const { projectToArchive, isOpen, openArchiveModal, closeArchiveModal } = useArchiveProjectModal<ArchivableProject>();
  const toggleArchiveMutation = useToggleProjectArchiveMutation();

  const { sortColumn, sortDirection, updateSort } = useAssignedProjectsSortURLParams();

  if (!client) return null;

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const sortedClientProjects = client.projects
    .filter((project) => !project.archived)
    .slice()
    .sort((a, b) => {
      const compare = a.name.localeCompare(b.name);
      return sortDirection === SortDirection.Asc ? -compare : compare;
    });

  const assignedProjectsRows = sortedClientProjects.map((project) => {
    const { id, name, archived, archivedDate } = project;
    const displayedName = archived
      ? t('clients.assigned_projects.assigned_projects_table.displayed_name', { name, archivedDate })
      : name;

    return (
      <tr key={id}>
        <td data-th="Name">{displayedName}</td>
        <td data-th="Action">
          <div className={styles.btnBox}>
            <IconButton
              icon={<Icon icon={icons.pencil} width={16} height={16} />}
              label={t('common.edit')}
              onClick={() => openEditProjectModal(id)}
              variant="contained"
              disabled={archived}
              hidden={restrictedAccess}
            />
            <IconButton
              icon={<Icon icon={icons.archive} width={15} height={19} />}
              label={t('common.archive')}
              onClick={() => openArchiveModal({ id, archived })}
              variant="contained"
              disabled={archived}
              hidden={restrictedAccess}
            />
          </div>
        </td>
      </tr>
    );
  });

  const handleRemove = (): void => {
    if (!projectToArchive) return;
    const { id: projectId, archived: isCurrentlyArchived } = projectToArchive;

    toggleArchiveMutation.mutate(
      { projectId, isCurrentlyArchived, clientId: client.id },
      {
        onSuccess: () => {
          addToast({ content: i18n.t(getToggleProjectArchiveToastKey(isCurrentlyArchived, 'success')) });
        },
        onError: (error) => {
          showModuleErrorToast(error, {
            403: i18n.t('toast_message.projects.not_authorized_edit'),
            404: i18n.t('toast_message.projects.project_id_not_found'),
            default: i18n.t(getToggleProjectArchiveToastKey(isCurrentlyArchived, 'failed')),
          });
        },
      },
    );
    closeArchiveModal();
  };

  const confirmationActions: ConfirmationAction[] = [{ text: t('common.remove'), action: handleRemove }];

  return (
    <div className={styles.root}>
      <Button
        onClick={() => openAddClientProjectModal(client)}
        label={`${t('common.add_new_project').toLowerCase()}`}
        variant="contained"
        className={styles.addProjectButton}
        disabled={client.archived}
        hidden={restrictedAccess}
      />
      <table className={clsx('table', styles.tableCustom)}>
        <thead>
          <tr>
            <SortableHeadCell
              column={SortColumn.Project}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              updateSort={updateSort}
            />
            <th></th>
          </tr>
        </thead>
        <tbody>{assignedProjectsRows}</tbody>
      </table>

      <Confirmation
        actionType="delete"
        confirmActions={confirmationActions}
        isOpen={isOpen}
        onCancel={closeArchiveModal}
        text={t('clients.assigned_projects.assigned_projects_table.confirmation.message.discard_draft')}
      />
    </div>
  );
}

export default AssignedMemberRow;
