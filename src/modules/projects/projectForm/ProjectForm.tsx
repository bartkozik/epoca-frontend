import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import FormHeader from '@/core/theme/FormHeader';
import { Input, SelectOption, TextArea } from '@/core/theme/inputs';
import LoadingArea from '@/core/theme/loadingArea';
import Search from '@/core/theme/search';
import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { extractUserIds, handleValidationErrors, showModuleErrorToast } from '@/core/utils/helpers';
import { KeyBoardEventType, useFocusOnFirstChildAfterTitle, useKeyDown } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import { organizationUserToUser } from '@/modules/organizations/modelOrganizationUser';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useCreateProjectMutation } from '@/modules/projects/hooks/useCreateProjectMutation';
import { useUpdateProjectMutation } from '@/modules/projects/hooks/useUpdateProjectMutation';
import { ProjectFormSchema } from '@/modules/projects/models/projectForm.model';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import ProjectUserSearch from '@/modules/projects/projectUserSearch';
import { Project, ProjectUserRole } from '@/modules/projects/types';
import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

interface ProjectFormProps {
  onCancel: () => void;
  project?: Project | null;
  withoutClientSelect?: boolean;
}

function ProjectForm({ onCancel, project, withoutClientSelect = false }: ProjectFormProps): JSX.Element {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const projectsContext = useProjects();
  const { loggedInUser } = useAuth();

  const workspace = useWorkspace();
  const { clients, clientsOptions, selectedClient, setSelectedClient } = useClients();
  const { fetchContextOrganizationUsers, isInitialLoadingContextOrganizationUsers } = workspace;
  const {
    handleUserAction,
    initializeProjectData,
    projects,
    selectedProjectMembers,
    selectedProjectOwners,
    setSelectedProjectMembers,
    setSelectedProjectOwners,
  } = projectsContext;
  const createProjectMutation = useCreateProjectMutation();
  const updateProjectMutation = useUpdateProjectMutation();
  const isSubmitting = project ? updateProjectMutation.isPending : createProjectMutation.isPending;

  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectNameError, setProjectNameError] = useState<{ message?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const projectNameInputWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) setSelectedProjectMembers([]);
    void fetchContextOrganizationUsers().then((users) => {
      if (project) {
        setProjectName(project.name);
        setProjectDescription(project.description);
        initializeProjectData(project);
      } else {
        const currentUser = users.find(({ id }) => id === loggedInUser?.id);
        setSelectedProjectOwners(currentUser ? [organizationUserToUser(currentUser)] : []);
      }
    });
  }, [
    fetchContextOrganizationUsers,
    initializeProjectData,
    loggedInUser?.id,
    project?.id,
    setSelectedProjectMembers,
    setSelectedProjectOwners,
  ]);

  useFocusOnFirstChildAfterTitle({
    childRef: projectNameInputRef,
    wrapperRef: projectNameInputWrapperRef,
    parentRef: formRef,
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ESC,
    action: onCancel,
    isListening: true,
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ENTER,
    action: () => formRef.current?.requestSubmit(),
    isListening: true,
    options: { ctrlKey: true },
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newName = e.target.value;
    setProjectName(newName);
    if (!projectNameError?.message) return;
    setProjectNameError(undefined);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmedProjectName = projectName.trim();
    const trimmedProjectDescription = projectDescription.trim();

    const schema = ProjectFormSchema(projects, project?.id);
    const validationResult = schema.safeParse({ projectName: trimmedProjectName });

    if (!validationResult.success) {
      setProjectNameError(handleValidationErrors(validationResult.error).projectName);
      return;
    }

    const memberIds = extractUserIds(selectedProjectMembers);
    const ownerIds = extractUserIds(selectedProjectOwners);

    if (project) {
      updateProjectMutation.mutate(
        {
          projectId: project.id,
          name: trimmedProjectName,
          description: trimmedProjectDescription,
          memberIds,
          ownerIds,
        },
        {
          onSuccess: () => {
            addToast({ content: i18n.t('toast_message.projects.edit_success') });
            onCancel();
          },
          onError: (error) => showModuleErrorToast(error, { default: i18n.t('toast_message.projects.edit_failed') }),
        },
      );
    } else if (selectedClient) {
      createProjectMutation.mutate(
        {
          name: trimmedProjectName,
          clientId: selectedClient.id,
          description: trimmedProjectDescription,
          memberIds,
          ownerIds,
        },
        {
          onSuccess: () => {
            addToast({ content: i18n.t('toast_message.projects.project_added') });
            onCancel();
          },
          onError: (error) => showModuleErrorToast(error, { default: i18n.t('toast_message.projects.add_failed') }),
        },
      );
    }
  };

  const handleProjectDescription = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setProjectDescription(e.target.value);
  };

  const handleOnSelect = (selectedOption: SelectOption): void => {
    const client = clients.find((c) => c.id === selectedOption.value);
    if (client) setSelectedClient(client);
  };

  const submitDisabled = useMemo(
    () =>
      (!project && (!projectName || isSubmitting || Boolean(projectNameError?.message))) ||
      (!!project && Boolean(projectNameError?.message)),
    [project, projectName, isSubmitting, projectNameError],
  );

  const formHeaderTitle = !project
    ? t('projects.project_form.header.add_new_project')
    : t('projects.project_form.header.edit_project');

  const isClientSearchDisplayed = !withoutClientSelect && !project;

  return (
    <LoadingArea loading={isInitialLoadingContextOrganizationUsers}>
      <form className="form" onSubmit={handleSubmit} ref={formRef}>
        <FormHeader title={formHeaderTitle} />
        {isClientSearchDisplayed && (
          <Search
            withCheckbox
            items={clientsOptions}
            label={t('projects.project_form.search.client_name.label')}
            name="Client name"
            onSelect={handleOnSelect}
            placeholder={t('projects.project_form.search.client_name.placeholder')}
            value={selectedClient?.name}
          />
        )}
        <Input
          error={projectNameError}
          helperText={t('projects.project_form.input.project_name.helper_text', { maxLength: MAX_NAME_LENGTH })}
          label={t('common.project_name')}
          name="Project name"
          onChange={handleNameChange}
          type="text"
          value={projectName}
          ref={projectNameInputRef}
          inputWrapperRef={projectNameInputWrapperRef}
        />
        <ProjectUserSearch
          handleUserAction={handleUserAction}
          infoText={t('projects.project_form.search.project_owner.info_text')}
          label={ProjectUserRole.Owner}
          placeholder={t('projects.common.search_users')}
          selectedUsers={selectedProjectOwners}
        />
        <ProjectUserSearch
          handleUserAction={handleUserAction}
          infoText={t('projects.project_form.search.project_member.info_text')}
          label={ProjectUserRole.Member}
          placeholder={t('projects.common.search_users')}
          selectedUsers={selectedProjectMembers}
        />
        <TextArea
          infoText={t('projects.project_form.text_area.project_description.info_text')}
          label={t('projects.common.project_description')}
          name="Project description"
          onChange={handleProjectDescription}
          secondaryLabel={t('common.optional')}
          value={projectDescription}
        />
        <div>
          <Button label={t('common.cancel')} onClick={onCancel} variant="text" />
          <Button
            disabled={submitDisabled}
            label={t('common.save')}
            loading={isSubmitting}
            type="submit"
            variant="contained"
          />
        </div>
      </form>
    </LoadingArea>
  );
}

export default ProjectForm;
