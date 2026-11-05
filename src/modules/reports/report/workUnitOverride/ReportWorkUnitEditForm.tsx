import { isDemo } from '@/core/config/demo';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Button from '@/core/theme/button';
import Confirmation from '@/core/theme/confirmation';
import Modal from '@/core/theme/modal';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import type { WorkUnitOverrideHistoryEntry } from '@/modules/reports/models/workUnitOverride.model';
import UnitForm from '@/modules/workingTime/Calendar/UnitForm';
import { modelUnit } from '@/modules/workingTime/modelUnit';
import type { ReportedUnit } from '@/modules/workingTime/types';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import boardStyles from '../reportBoard/ReportBoard.module.scss';
import OverrideLoadingStatus from './OverrideLoadingStatus';
import { useWorkUnitOverride } from './useWorkUnitOverride';
import WorkUnitOverrideForm from './WorkUnitOverrideForm';
import styles from './WorkUnitOverrideForm.module.scss';
import WorkUnitOverrideHistory from './WorkUnitOverrideHistory';

interface Props {
  unit: ReportedUnit;
  onClose: () => void;
}

const EditSession = ({ unit, onClose }: Props): JSX.Element => {
  const auth = useAuth();
  const { t } = useTranslation();
  const titleId = useId();
  const projectsContext = useProjects();

  const workspace = useWorkspace();
  const [organizationSlug] = useState(workspace.contextOrganizationSlug);
  const correctionAllowed =
    !isDemo && Boolean(unit.override?.permissions.canEdit || unit.override?.permissions.canViewHistory);
  const [pending, setPending] = useState<'close' | null>(null);
  const pendingRef = useRef<'close' | null>(null);
  const sourceDirtyRef = useRef(false);
  const sourceBusyRef = useRef(false);
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const c = useWorkUnitOverride({ isOpen: correctionAllowed, workUnitId: unit.id, onClose });
  const canEditSource =
    auth.hasAccess(ROLE_PERMISSIONS.Internal) &&
    (auth.loggedInUser?.id === (c.base?.userId ?? unit.userId) || auth.hasAccess(ROLE_PERMISSIONS.Owner));
  const sourceUnit = useMemo(() => {
    if (!correctionAllowed) {
      if (!unit.projectClient) return null;
      return { ...unit, projectClient: unit.projectClient, taskId: unit.taskId ?? undefined };
    }
    if (!c.base?.projectClient) return null;
    return modelUnit(
      {
        ...c.base,
        projectClient: c.base.projectClient,
        taskId: c.base.taskId ?? undefined,
        userFullName: c.base.userFullName ?? undefined,
      },
      workspace.contextOrganizationUsers,
    );
  }, [c.base, correctionAllowed, unit, workspace.contextOrganizationUsers]);
  const handleSourceDirtyChange = useCallback((dirty: boolean): void => {
    sourceDirtyRef.current = dirty;
    setSourceDirty(dirty);
  }, []);
  const handleSourceBusyChange = useCallback((isBusy: boolean): void => {
    sourceBusyRef.current = isBusy;
    setSourceBusy(isBusy);
  }, []);
  const busy = (): boolean => sourceBusyRef.current || c.isBusy();
  const sharedInteractionBlocked = (): boolean =>
    workspace.contextOrganizationSlug !== organizationSlug || busy() || pendingRef.current !== null;
  const interactionBlocked = (): boolean => sharedInteractionBlocked() || c.undoConfirmationOpen;
  const finishNavigation = (): void => {
    if (correctionAllowed) c.close();
    else onClose();
  };
  const navigate = (): void => {
    if (interactionBlocked()) return;
    if (sourceDirtyRef.current || c.dirty) {
      pendingRef.current = 'close';
      setPending('close');
    } else finishNavigation();
  };
  const cancelDiscard = (): void => {
    pendingRef.current = null;
    setPending(null);
  };
  const confirmDiscard = (): void => {
    const destination = pendingRef.current;
    if (!destination || busy()) return;
    cancelDiscard();
    finishNavigation();
  };
  const requestUndo = (entry: WorkUnitOverrideHistoryEntry): void => {
    if (sourceDirtyRef.current || sourceBusyRef.current || sharedInteractionBlocked() || c.dirty) return;
    c.openUndoConfirmation(entry);
  };
  const confirmUndo = async (): Promise<void> => {
    if (
      sourceDirtyRef.current ||
      sourceBusyRef.current ||
      workspace.contextOrganizationSlug !== organizationSlug ||
      pendingRef.current !== null ||
      c.isBusy() ||
      sourceBusyRef.current
    )
      return;
    await c.confirmUndo();
  };
  const undoValues = useMemo(() => {
    if (!c.undoTarget || !c.base) return null;
    const before = c.undoTarget.before;
    const projectId = before.projectId;
    const knownProject =
      projectId === null
        ? c.base.projectClient
        : ([
            before.effective.projectClient,
            c.base.projectClient,
            c.base.effectiveProjectClient,
            ...projectsContext.reportedProjects.map((project) => ({
              projectId: project.id,
              projectName: project.name,
              clientId: project.client.id,
              clientName: project.client.name,
            })),
          ].find((project) => project?.projectId === projectId) ?? null);
    const taskId =
      before.taskId.mode === 'Inherit' ? c.base.taskId : before.taskId.mode === 'Clear' ? null : before.taskId.value;
    const unavailable = t('reports.override.sourceUnavailable');
    return `${t('reports.override.undo.message')} ${t('common.client')}: ${knownProject?.clientName ?? unavailable}; ${t('common.project')}: ${knownProject?.projectName ?? unavailable}; ${t('common.task_id')}: ${taskId || t('reports.override.history.blank')}`;
  }, [c.base, c.undoTarget, projectsContext.reportedProjects, t]);
  const undoMetadata = c.base?.override.undo;
  const undoCandidateId = undoMetadata?.canUndo === true ? undoMetadata.candidateEventId : null;
  const undoDisabled =
    sourceDirty ||
    sourceBusy ||
    c.undoDisabled ||
    workspace.contextOrganizationSlug !== organizationSlug ||
    pending !== null;
  const undoDisabledReason = sourceDirty || c.dirty ? t('reports.override.undo.dirty') : null;
  const showLoadingStatus = correctionAllowed && (c.loadingCurrent || c.refreshingReport);
  const loadingStatusLabel = t(c.loadingCurrent ? 'reports.override.loading' : 'reports.override.refreshing');
  const nested = pending !== null || c.undoConfirmationOpen;
  return (
    <>
      <Modal
        isOpen
        ariaLabelledBy={titleId}
        close={navigate}
        className={clsx(boardStyles.modal, styles.reportEditModal)}
        overlayClassName={boardStyles.modalOverlay}
        suspendFocusTrap={nested}
        disableClickOutside={nested}
        disableEscapeClickClose={nested}
      >
        <div className={styles.root}>
          <span id={titleId} hidden>
            {t('reports.override.title')}
          </span>
          {showLoadingStatus && <OverrideLoadingStatus>{loadingStatusLabel}</OverrideLoadingStatus>}
          {correctionAllowed && c.loadError && (
            <div role="alert">
              <p>{t(c.loadError)}</p>
              <Button type="button" label={t('common.retry')} onClick={() => void c.retryFreshLoad()} />
            </div>
          )}
          {c.mutationAccepted && <p role="status">{t('reports.override.saved')}</p>}
          {c.refreshWarning && (
            <div role="alert">
              <p>{t(c.refreshWarning)}</p>
              <Button
                type="button"
                disabled={c.refreshingReport}
                label={t('reports.override.retryReport')}
                onClick={() => void c.retryReportRefresh()}
              />
            </div>
          )}
          {!correctionAllowed && canEditSource && sourceUnit && (
            <UnitForm
              date={sourceUnit.convertedDate}
              unit={sourceUnit}
              isFormInReportView
              onRequestClose={navigate}
              onSaveSuccess={() => {
                if (workspace.contextOrganizationSlug === organizationSlug) finishNavigation();
              }}
              onDirtyChange={handleSourceDirtyChange}
              onBusyChange={handleSourceBusyChange}
              interactionBlocked={interactionBlocked}
            />
          )}
          {correctionAllowed && c.base && (
            <>
              <WorkUnitOverrideForm
                controller={c}
                interactionBlocked={interactionBlocked}
                onRequestClose={navigate}
                onBusyChange={handleSourceBusyChange}
                onDirtyChange={handleSourceDirtyChange}
              />
              <WorkUnitOverrideHistory
                isOpen
                canViewHistory={c.base.override.permissions.canViewHistory}
                hasHistory={c.base.override.hasHistory}
                currentVersion={c.base.override.version}
                organizationSlug={c.organizationSlug}
                workUnitId={c.base.id}
                resetKey={c.historyResetKey}
                handleError={c.handleHistoryError}
                undoCandidateId={undoCandidateId}
                undoDisabled={undoDisabled}
                undoDisabledReason={undoDisabledReason}
                undoUnavailableReason={undoMetadata?.canUndo === false ? undoMetadata.reason : null}
                onUndo={requestUndo}
              />
            </>
          )}
        </div>
      </Modal>
      <Confirmation
        isOpen={pending !== null}
        actionType="warning"
        title={t('reports.override.discard.title')}
        text={t('reports.override.discard.message')}
        onCancel={cancelDiscard}
        confirmActions={[{ text: t('reports.override.discard.confirm'), action: confirmDiscard }]}
      />
      <Confirmation
        isOpen={c.undoConfirmationOpen}
        actionType="warning"
        title={t('reports.override.undo.title')}
        text={undoValues ?? t('reports.override.undo.message')}
        onCancel={c.cancelUndo}
        isSubmitting={c.undoing}
        initialFocusButtonText={t('reports.override.undo.confirm')}
        confirmActions={[{ text: t('reports.override.undo.confirm'), action: confirmUndo }]}
      />
    </>
  );
};

const ReportWorkUnitEditForm = (props: Props): JSX.Element => {
  const workspace = useWorkspace();
  const [organizationSlug] = useState(workspace.contextOrganizationSlug);
  const ended = useRef(false);
  const departed = organizationSlug !== workspace.contextOrganizationSlug;
  const close = (): void => {
    if (ended.current) return;
    ended.current = true;
    props.onClose();
  };
  useLayoutEffect(() => {
    if (departed) close();
  }, [departed]);
  return departed || ended.current ? <></> : <EditSession key={props.unit.id} unit={props.unit} onClose={close} />;
};

export default ReportWorkUnitEditForm;
