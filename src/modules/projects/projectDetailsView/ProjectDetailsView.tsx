import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import { Input } from '@/core/theme/inputs';
import { readFromListSearch, showModuleErrorToast } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import {
  getToggleProjectArchiveToastKey,
  useToggleProjectArchiveMutation,
} from '@/modules/projects/hooks/useToggleProjectArchiveMutation';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import type { Project } from '@/modules/projects/types';
import { useArchiveProjectModal } from '@/modules/projects/useArchiveProjectModal';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import i18n from 'i18next';
import { projectsPaths } from '../routes';
import styles from './ProjectDetailsView.module.scss';

function ProjectDetailsView(): JSX.Element | null {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const projectsContext = useProjects();
  const auth = useAuth();
  const { hasAccess } = auth;
  const { openEditProjectModal, selectedProject } = projectsContext;
  const { projectToArchive, isOpen, openArchiveModal, closeArchiveModal } = useArchiveProjectModal<Project>();
  const toggleArchiveMutation = useToggleProjectArchiveMutation();

  if (!selectedProject) return null;

  const handleStatusChange = (): void => {
    if (!projectToArchive) return;
    const { id: projectId, archived: isCurrentlyArchived, client } = projectToArchive;

    toggleArchiveMutation.mutate(
      { projectId, isCurrentlyArchived, clientId: client.id },
      {
        onSuccess: () => {
          addToast({ content: i18n.t(getToggleProjectArchiveToastKey(isCurrentlyArchived, 'success')) });
          navigate(`${projectsPaths.main}${readFromListSearch(location.state)}`);
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

  const { description, client, archived, archivedDate, name, formattedCreatedAt } = selectedProject;

  const inputFields = [
    { label: t('common.project_name'), value: name },
    {
      label: t('projects.common.project_description'),
      value: description,
      tooltipText: t('projects.project_details_view.input.project_description.tooltip'),
    },
    {
      label: t('projects.project_details_view.input.client_or_category.label'),
      value: client?.name || t('projects.project_details_view.input.client_or_category.value'),
      color: client?.color,
    },
    { label: t('projects.project_details_view.input.created_at.label'), value: formattedCreatedAt },
  ];

  const confirmationArchived = projectToArchive?.archived ?? archived;

  const confirmationActions: ConfirmationAction[] = [
    { text: confirmationArchived ? t('common.unarchive') : t('common.archive'), action: handleStatusChange },
  ];
  const confirmationMessage = confirmationArchived
    ? t('projects.project_details_view.confirmation.message.project_unarchive')
    : t('projects.project_details_view.confirmation.message.project_archive');

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  return (
    <div className="details-view">
      <div className={styles.inputsBox}>
        {inputFields.map(({ label, value, color, tooltipText }, index) => (
          <Input
            key={index}
            readOnly
            className={styles.input}
            color={color}
            infoText={tooltipText}
            label={label}
            name={label}
            type="text"
            value={value}
            shouldDisplayLinkCreator
          />
        ))}
      </div>
      <Button
        className={styles.editButton}
        disabled={archived}
        hidden={restrictedAccess}
        label={t('common.edit')}
        onClick={() => openEditProjectModal()}
        size="large"
        variant="contained"
      />
      <div className={styles.stateBox}>
        <span className={styles.title}>{t('projects.project_details_view.text.state')}</span>
        <div className={styles.stateBoxContent}>
          <span className={clsx(styles.stateDot, styles[archived ? 'red' : 'green'])}></span>
          <span className={styles.state}>
            {archived ? t('projects.project_details_view.text.archived_on', { archivedDate }) : t('common.active')}
          </span>
        </div>
        <Button
          label={
            archived
              ? t('projects.project_details_view.button.unarchive_project.label')
              : t('projects.project_details_view.button.archive_project.label')
          }
          onClick={() => openArchiveModal(selectedProject)}
          size="large"
          variant="contained"
          hidden={restrictedAccess}
        />
      </div>

      <Confirmation
        actionType="archive"
        confirmActions={confirmationActions}
        isOpen={isOpen}
        onCancel={closeArchiveModal}
        text={confirmationMessage}
      />
    </div>
  );
}

export default ProjectDetailsView;
