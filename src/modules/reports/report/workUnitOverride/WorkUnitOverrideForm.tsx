import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { convertTimeFormat } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import UnitForm from '@/modules/workingTime/Calendar/UnitForm';
import { useWorkUnitSubmission } from '@/modules/workingTime/Calendar/UnitForm/useWorkUnitSubmission';
import { modelUnit } from '@/modules/workingTime/modelUnit';
import type { UnitEditDto } from '@/modules/workingTime/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OverrideLoadingStatus from './OverrideLoadingStatus';
import type { WorkUnitOverrideController } from './useWorkUnitOverride';
import WorkUnitOverrideConflict from './WorkUnitOverrideConflict';
import styles from './WorkUnitOverrideForm.module.scss';

const WorkUnitOverrideForm = ({
  controller: c,
  interactionBlocked,
  onRequestClose,
  onDirtyChange,
  onBusyChange,
}: {
  controller: WorkUnitOverrideController;
  interactionBlocked: () => boolean;
  onRequestClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}): JSX.Element => {
  const auth = useAuth();
  const { t } = useTranslation();
  const projectsContext = useProjects();

  const workspace = useWorkspace();
  const submission = useWorkUnitSubmission();
  // Source edits stay mounted across override refreshes and conflict reconciliation.
  const [initial] = useState(c.base!);
  const [unit] = useState(() =>
    modelUnit(
      {
        ...initial,
        projectClient: initial.projectClient,
        taskId: initial.taskId ?? undefined,
        userFullName: initial.userFullName ?? undefined,
      },
      workspace.contextOrganizationUsers,
    ),
  );
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const inFlight = useRef(false);
  const savedSource = useRef({
    date: initial.date,
    duration: convertTimeFormat({ time: initial.duration }),
    description: initial.description ?? '',
  });
  const sourceSnapshot = useMemo(
    () => ({
      date: c.base!.date,
      duration: convertTimeFormat({ time: c.base!.duration }),
      description: c.base!.description ?? '',
    }),
    [c.base],
  );
  useEffect(() => {
    savedSource.current = sourceSnapshot;
  }, [sourceSnapshot]);
  const canEditSource =
    Boolean(initial.projectClient) &&
    auth.hasAccess(ROLE_PERMISSIONS.Internal) &&
    (auth.loggedInUser?.id === initial.userId || auth.hasAccess(ROLE_PERMISSIONS.Owner));
  const disabled = c.sourceSaveDisabled || saving || submission.isSubmitting || submission.isRetryBlocked;
  const projectId = c.draft.projectId === null ? c.base?.projectClient?.projectId : c.draft.projectId;
  const options = projectsContext.reportedProjects
    .filter((project) => !project.archived && c.base?.override.permissions.allowedProjectIds.includes(project.id))
    .map((project) => ({
      projectId: project.id,
      projectName: project.name,
      clientId: project.client.id,
      clientName: project.client.name,
      clientColor: project.client.color,
    }));
  const sourceProject = c.base?.projectClient;
  if (sourceProject && !options.some((option) => option.projectId === sourceProject.projectId))
    options.push(sourceProject);
  const project =
    options.find((option) => option.projectId === projectId) ??
    [c.base?.projectClient, c.base?.effectiveProjectClient].find((value) => value?.projectId === projectId) ??
    undefined;
  const taskId =
    c.draft.taskId.mode === 'Set'
      ? c.draft.taskId.value
      : c.draft.taskId.mode === 'Clear'
        ? ''
        : (c.base?.taskId ?? '');
  const save = async (dto: UnitEditDto): Promise<void> => {
    if (interactionBlocked() || inFlight.current || disabled) return;
    const source = {
      date: dto.date ?? initial.date,
      duration: convertTimeFormat({ time: dto.duration }),
      description: dto.description,
    };
    const changed = {
      date: source.date !== savedSource.current.date,
      duration: source.duration !== savedSource.current.duration,
      description: source.description !== savedSource.current.description,
    };
    const sourceChanged = canEditSource && Object.values(changed).some(Boolean);
    const overrideChanged = c.dirty;
    if (!sourceChanged && !overrideChanged) return;
    inFlight.current = true;
    onBusyChange(true);
    setSaving(true);
    setSourceError(null);
    try {
      if (overrideChanged && !(await c.save())) return;
      if (workspace.contextOrganizationSlug !== c.organizationSlug) return;
      if (sourceChanged) {
        const current = c.getCurrentSource();
        if (
          !current?.projectClient ||
          !auth.hasAccess(ROLE_PERMISSIONS.Internal) ||
          (auth.loggedInUser?.id !== current.userId && !auth.hasAccess(ROLE_PERMISSIONS.Owner))
        )
          return;
        // Effective project/task never reach the source PATCH; they use the audited API above.
        const sourceDto = {
          projectId: current.projectClient.projectId,
          taskId: current.taskId ?? '',
          date: changed.date ? source.date : current.date,
          duration: changed.duration ? dto.duration : current.duration,
          description: changed.description ? source.description : (current.description ?? ''),
        };
        const succeeded = await submission.submitEdit(initial.id, sourceDto, true);
        if (!c.getCurrentSource()) return;
        if (succeeded !== true) {
          setSourceError(overrideChanged ? 'reports.override.error.partialSave' : 'reports.override.error.sourceSave');
          return;
        }
        savedSource.current = source;
        setSavedVersion((value) => value + 1);
        setSourceDirty(false);
        onDirtyChange(false);
        await c.refreshAfterSourceSave();
      }
    } finally {
      inFlight.current = false;
      onBusyChange(false);
      setSaving(false);
    }
  };
  const projectResolutionMessage = c.projectResolution && (
    <p role="status">{t(`reports.override.project.${c.projectResolution}`)}</p>
  );
  const projectResolutionStatus =
    c.projectResolution === 'resolving' ? (
      <OverrideLoadingStatus>{t('reports.override.project.resolving')}</OverrideLoadingStatus>
    ) : (
      projectResolutionMessage
    );
  return (
    <div className={styles.form}>
      <UnitForm
        date={unit.convertedDate}
        unit={unit}
        isFormInReportView
        submission={submission}
        onRequestClose={onRequestClose}
        onDirtyChange={(dirty) => {
          setSourceDirty(dirty);
          onDirtyChange(dirty);
        }}
        interactionBlocked={() => interactionBlocked() || inFlight.current}
        editAdapter={{
          project,
          projectOptions: options,
          projectDescription:
            projectsContext.reportedProjects.find((value) => value.id === projectId)?.description ?? '',
          onProjectChange: (option) =>
            c.setProjectId(option.projectId === c.base?.projectClient?.projectId ? null : option.projectId!),
          taskId,
          onTaskIdChange: (value) =>
            c.setTaskId(
              value === (c.base?.taskId ?? '')
                ? { mode: 'Inherit' }
                : value === ''
                  ? { mode: 'Clear' }
                  : { mode: 'Set', value },
            ),
          sourceReadOnly: !canEditSource,
          assignmentReadOnly: !c.base?.override.permissions.canEdit,
          disabled,
          saveDisabled: c.dirty ? c.saveDisabled : c.sourceSaveDisabled || !sourceDirty || !canEditSource,
          savedVersion,
          sourceSnapshot,
          onSubmit: save,
        }}
      />
      {projectResolutionStatus}
      {c.taskIdError && <p role="alert">{t(c.taskIdError)}</p>}
      {Object.entries(c.fieldErrors)
        .filter(([field]) => field !== 'taskId')
        .map(([field, error]) => (
          <p role="alert" key={field}>
            {t(error)}
          </p>
        ))}
      {c.submitError && <p role="alert">{t(c.submitError)}</p>}
      {sourceError && <p role="alert">{t(sourceError)}</p>}
      <WorkUnitOverrideConflict controller={c} />
    </div>
  );
};

export default WorkUnitOverrideForm;
