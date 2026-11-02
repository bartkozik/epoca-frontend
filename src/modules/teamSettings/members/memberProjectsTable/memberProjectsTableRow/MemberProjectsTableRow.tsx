import { useToast } from '@/core/providers/toastProvider';
import TableItemName from '@/core/theme/tableItemName';
import Toggle from '@/core/theme/toggle';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { useToggleProjectAssignmentMutation } from '@/modules/projects/hooks/useToggleAllProjectsAssignmentMutation';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { Project } from '@/modules/projects/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from '../MemberProjectsTable.module.scss';

interface MemberProjectsTableRowProps {
  project: Project;
}

const MemberProjectsTableRow = ({ project }: MemberProjectsTableRowProps): JSX.Element | null => {
  const { addToast } = useToast();
  const { t, i18n } = useTranslation();
  const { id, createdBy, name, client } = project;
  const projectsContext = useProjects();
  const { isUserAssignedToProject, selectedProjectUser, isProjectUserProjectOwner } = projectsContext;
  const toggleMutation = useToggleProjectAssignmentMutation();

  const toggleState = isUserAssignedToProject(id);
  const toggleLoading = toggleMutation.isPending;

  const [isMemberAssigned, setIsMemberAssigned] = useState(toggleState);
  const isPolishLanguage = i18n.language === 'pl';

  const handleToggleClick = (): void | undefined => {
    if (toggleLoading) return;
    const isAssigned = toggleState;
    setIsMemberAssigned(!isAssigned);

    toggleMutation.mutate(
      { project, isAssigned },
      {
        onSuccess: () => {
          addToast({
            content: t(isAssigned ? 'toast_message.projects.user_deleted' : 'toast_message.projects.user_add'),
          });
        },
        onError: (error) => {
          setIsMemberAssigned(isAssigned);
          showModuleErrorToast(error, {
            default: t(
              isAssigned ? 'toast_message.projects.user_delete_failed' : 'toast_message.projects.user_add_error',
            ),
          });
        },
      },
    );
  };

  useEffect(() => {
    setIsMemberAssigned(toggleState);
  }, [toggleState]);

  if (!selectedProjectUser) return null;

  return (
    <tr>
      <td data-th="Project">
        <TableItemName name={name} />
      </td>
      <td data-th="Client">
        <TableItemName color={client.color} name={client.name} />
        <div className={styles.clientNameBox}>
          <p>
            <span>`${t('common.project')}:`</span> {name}
          </p>
          <p>
            <span>`${t('common.type')}:`</span> {client.type}
          </p>
        </div>
      </td>
      <td data-th="Type">{client.type}</td>
      <td>
        <Toggle
          isChecked={isMemberAssigned}
          className={clsx({ [styles.tableToggle]: isPolishLanguage })}
          loading={toggleLoading}
          stateLabels={{
            on: t('team_seatings.members.members_projects_table.project_table_row.label.unassign'),
            off: t('team_seatings.members.members_projects_table.project_table_row.label.assign'),
          }}
          onClick={handleToggleClick}
          disabled={isProjectUserProjectOwner(createdBy, selectedProjectUser.id)}
          disabledTooltipText={t(
            'team_seatings.members.members_projects_table.project_table_row.disabled_tooltip.cant_unassign',
          )}
        />
      </td>
    </tr>
  );
};

export default MemberProjectsTableRow;
