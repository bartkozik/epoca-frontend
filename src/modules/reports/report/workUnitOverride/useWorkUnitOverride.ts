import { useToast } from '@/core/providers/toastProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import {
  useReplaceWorkUnitOverrideMutation,
  useUndoWorkUnitOverrideMutation,
} from '@/modules/reports/hooks/useReplaceWorkUnitOverrideMutation';
import { refreshReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import { isTerminalOverrideProblem, overrideProblem } from '@/modules/reports/models/problem.model';
import {
  CurrentWorkUnitOverrideHistoryEntrySchema,
  ReplaceWorkUnitOverrideRequestSchema,
  type UndoWorkUnitOverrideRequest,
  type WorkUnitOverrideHistoryEntry,
  type WorkUnitOverrideResponse,
  type WorkUnitTaskOverride,
} from '@/modules/reports/models/workUnitOverride.model';
import { workUnitOverrideQueryKey } from '@/modules/reports/queryKeys';
import { fetchWorkUnitOverride } from '@/modules/reports/workUnitOverrideQueries';
import { useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { reconcileOverrideUndo } from './reconcileOverrideUndo';
import { getWorkUnitOverrideHistory } from './requests';
import { useOverrideProjects } from './useOverrideProjects';

export interface OverrideDraft {
  projectId: string | null | undefined;
  taskId: WorkUnitTaskOverride;
}
type SaveIntent = { kind: 'save' };
export type UndoIntent = {
  kind: 'undo';
  request: UndoWorkUnitOverrideRequest;
  historyVersion: number;
};
type Intent = SaveIntent | UndoIntent;
type Reconciliation = { intent: Intent; reason: 'conflict' | 'uncertain' };
type Conflict = Reconciliation & { current: WorkUnitOverrideResponse; proposal: OverrideDraft };
type CurrentHistoryEntry = Extract<WorkUnitOverrideHistoryEntry, { provenance: 'WorkUnitOverride' }>;
export type UndoTarget = UndoIntent & { before: CurrentHistoryEntry['before'] };
const emptyDraft = (): OverrideDraft => ({ projectId: null, taskId: { mode: 'Inherit' } });
const draftFrom = (data: WorkUnitOverrideResponse): OverrideDraft => ({
  projectId: data.override.projectId,
  taskId: data.override.taskId,
});

export interface WorkUnitOverrideController extends Omit<ReturnType<typeof useOverrideProjects>, 'resolveClient'> {
  base: WorkUnitOverrideResponse | null;
  draft: OverrideDraft;
  clientId: string | null;
  conflict: Conflict | null;
  fieldErrors: Record<string, string>;
  loadError: string | null;
  submitError: string | null;
  taskIdError: string | null;
  loadingCurrent: boolean;
  dirty: boolean;
  saveDisabled: boolean;
  undoTarget: UndoTarget | null;
  undoDisabled: boolean;
  undoing: boolean;
  undoConfirmationOpen: boolean;
  openUndoConfirmation: (entry: WorkUnitOverrideHistoryEntry) => void;
  cancelUndo: () => void;
  confirmUndo: () => Promise<void>;
  submitting: boolean;
  historyResetKey: number;
  mutationAccepted: boolean;
  refreshWarning: string | null;
  refreshingReport: boolean;
  organizationSlug: string;
  isBusy: () => boolean;
  getCurrentSource: () => WorkUnitOverrideResponse | null;
  sourceSaveDisabled: boolean;
  refreshAfterSourceSave: () => Promise<void>;
  close: () => void;
  discardDraft: () => void;
  setTaskId: (taskId: WorkUnitTaskOverride) => void;
  setProjectId: (projectId: string | null) => void;
  setClientId: (clientId: string | null) => void;
  save: () => Promise<boolean>;
  handleHistoryError: (error: unknown) => boolean;
  retryFreshLoad: () => Promise<void>;
  retryReportRefresh: () => Promise<void>;
  useCurrent: () => void;
  reviewAndReapply: () => void;
}

/** Owns a fresh worklog snapshot independently of report rows and their active filters. */
export function useWorkUnitOverride({
  isOpen,
  workUnitId,
  onClose,
}: {
  isOpen: boolean;
  workUnitId: string | null;
  onClose: () => void;
}): WorkUnitOverrideController {
  const { addToast } = useToast();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const replaceMutation = useReplaceWorkUnitOverrideMutation();
  const undoMutation = useUndoWorkUnitOverrideMutation();
  const organizationSlug = workspace.contextOrganizationSlug;
  const sessionKey = JSON.stringify([isOpen, organizationSlug, workUnitId]);
  const [base, setBase] = useState<WorkUnitOverrideResponse | null>(null);
  const currentSource = useRef<WorkUnitOverrideResponse | null>(null);
  const [sourceRefreshRequired, setSourceRefreshRequired] = useState(false);
  const [draft, setDraft] = useState<OverrideDraft>(emptyDraft);
  const [clientId, setClient] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [needsFresh, setNeedsFresh] = useState<Reconciliation | null>(null);
  const [loadingCurrent, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Intent['kind'] | null>(null);
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null);
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const [mutationAccepted, setMutationAccepted] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [refreshingReport, setRefreshingReport] = useState(false);
  const guard = useRef({ generation: 0, inFlight: false });
  const sessionClosed = useRef(false);
  const loadSequence = useRef(0);
  const refreshSequence = useRef(0);
  const callbacks = useRef({ onClose });
  callbacks.current = { onClose };
  const projects = useOverrideProjects(base, draft.projectId, clientId, sessionKey);
  // Actions retain the generation that created them. Reading the current generation
  // when an old callback executes would grant it access to a newer session.
  const actionGeneration = guard.current.generation;
  const isCurrent = (generation: number): boolean =>
    guard.current.generation === generation &&
    !sessionClosed.current &&
    workspace.contextOrganizationSlug === organizationSlug;
  const isActionCurrent = (): boolean => isCurrent(actionGeneration);

  const clearPrivileged = (): void => {
    currentSource.current = null;
    setSourceRefreshRequired(false);
    setBase(null);
    setDraft(emptyDraft());
    setClient(null);
    setConflict(null);
    setNeedsFresh(null);
    setFieldErrors({});
    setSubmitError(null);
    setLoadError(null);
    setUndoTarget(null);
    setMutationAccepted(false);
    setRefreshWarning(null);
    setLoading(false);
    setBusy(null);
    setRefreshingReport(false);
    setHistoryResetKey((value) => value + 1);
  };
  const refreshReport = async (generation: number): Promise<void> => {
    if (!isCurrent(generation)) return;
    const sequence = ++refreshSequence.current;
    setRefreshingReport(true);
    try {
      await refreshReportedUnits();
      if (isCurrent(generation) && sequence === refreshSequence.current) setRefreshWarning(null);
    } catch {
      if (isCurrent(generation) && sequence === refreshSequence.current)
        setRefreshWarning('reports.override.error.reportRefresh');
    } finally {
      if (isCurrent(generation) && sequence === refreshSequence.current) setRefreshingReport(false);
    }
  };
  const endSession = (): void => {
    if (sessionClosed.current) return;
    sessionClosed.current = true;
    guard.current = { generation: guard.current.generation + 1, inFlight: false };
    clearPrivileged();
    callbacks.current.onClose();
  };
  const terminal = (error: unknown): boolean => {
    if (!isTerminalOverrideProblem(error)) return false;
    if (sessionClosed.current) return true;
    endSession();
    void refreshReportedUnits().catch(() => undefined);
    return true;
  };
  const adoptDraft = (data: WorkUnitOverrideResponse): void => {
    setDraft(draftFrom(data));
    setClient((data.override.projectId === null ? data.projectClient : data.effectiveProjectClient)?.clientId ?? null);
  };
  // fetchQuery already wrote this response into the cache before any caller checks access
  // (loadFresh calls it post-fetch). A response the user has zero access to must not linger
  // there for gcTime after we've decided to discard it -- evict it immediately rather than
  // leaving it reachable via queryClient.getQueryData for any future reader of this key. Split
  // out from hasFreshAccess below so loadFresh can evict even when its own session has since gone
  // stale (generation/org changed while the fetch was in flight) -- eviction is always safe to
  // run, but hasFreshAccess's terminal(...) call is not: it ends the *current* session, which
  // would be wrong to invoke on behalf of an abandoned, stale one.
  const evictIfZeroAccess = (data: WorkUnitOverrideResponse): boolean => {
    const { canEdit, canDelete, canViewHistory } = data.override.permissions;
    if (canEdit || canDelete || canViewHistory) return false;
    if (workUnitId) queryClient.removeQueries({ queryKey: workUnitOverrideQueryKey(organizationSlug, workUnitId) });
    return true;
  };
  const hasFreshAccess = (data: WorkUnitOverrideResponse): boolean => {
    if (!evictIfZeroAccess(data)) return true;
    terminal({ response: { status: 403 } });
    return false;
  };
  const acceptFreshResponse = async (data: WorkUnitOverrideResponse, generation: number): Promise<void> => {
    if (!hasFreshAccess(data)) return;
    setBase(data);
    currentSource.current = data;
    // Mirror the accepted mutation response into the cache: only loadFresh goes through fetchQuery.
    queryClient.setQueryData(workUnitOverrideQueryKey(organizationSlug, workUnitId as string), data);
    adoptDraft(data);
    setConflict(null);
    setNeedsFresh(null);
    setFieldErrors({});
    setSubmitError(null);
    setUndoTarget(null);
    setHistoryResetKey((value) => value + 1);
    setMutationAccepted(true);
    addToast({ content: i18n.t('reports.override.saveSuccess'), type: 'success' });
    await refreshReport(generation);
  };
  const loadFresh = async (
    generation: number,
    reconciliation: Reconciliation | null = null,
    proposal = draft,
  ): Promise<void> => {
    if (!workUnitId || !isOpen || !isCurrent(generation)) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      // staleTime/retry are pinned locally: the shared client's defaults (1 minute, 1 retry) would
      // hand back a cached snapshot and silently retry, and this load exists to obtain the exact
      // current revision for optimistic concurrency. Neither option stops fetchQuery from reusing
      // an already in-flight request for this key -- e.g. a fast close+reopen of the same work unit
      // would otherwise adopt the abandoned session's stale in-flight response. Cancel it first so
      // this call always gets its own fresh request; deliberately not awaited -- cancellation flips
      // the query's fetch state synchronously, and awaiting first would let another loadFresh call
      // (e.g. the very session being abandoned) register its own fetchQuery in between, recreating
      // the same dedup race this is meant to close.
      void queryClient.cancelQueries({ queryKey: workUnitOverrideQueryKey(organizationSlug, workUnitId) });
      const data = await queryClient.fetchQuery({
        queryKey: workUnitOverrideQueryKey(organizationSlug, workUnitId),
        queryFn: () => fetchWorkUnitOverride(organizationSlug, workUnitId),
        staleTime: 0,
        retry: false,
      });
      // Runs regardless of whether this session is still current -- see evictIfZeroAccess's own
      // comment for why this can't wait for the currency check below.
      evictIfZeroAccess(data);
      if (!isCurrent(generation) || sequence !== loadSequence.current) return;
      if (!hasFreshAccess(data)) return;
      setBase(data);
      currentSource.current = data;
      setSourceRefreshRequired(false);
      setHistoryResetKey((value) => value + 1);
      if (reconciliation) {
        if (reconciliation.intent.kind === 'undo' && reconciliation.reason === 'uncertain') {
          if (!data.override.permissions.canViewHistory) {
            setNeedsFresh(reconciliation);
            return;
          }
          const evidence = await reconcileOverrideUndo(
            data.override.version,
            reconciliation.intent.historyVersion,
            reconciliation.intent.request.targetEventId,
            async (pageNumber) =>
              (await getWorkUnitOverrideHistory(organizationSlug, workUnitId, data.override.version, pageNumber)).data,
          );
          if (!isCurrent(generation) || sequence !== loadSequence.current) return;
          if (evidence === 'recorded') {
            await acceptFreshResponse(data, generation);
            return;
          }
          if (evidence === 'unresolved') {
            setNeedsFresh(reconciliation);
            return;
          }
        }
        if (reconciliation.intent.kind === 'undo') adoptDraft(data);
        setConflict({ ...reconciliation, current: data, proposal });
        setNeedsFresh(null);
        // Another writer or our lost response may have changed membership and totals.
        // Refreshing the report does not claim that this ambiguous write succeeded.
        await refreshReport(generation);
      } else {
        adoptDraft(data);
        setConflict(null);
        setNeedsFresh(null);
      }
    } catch (error) {
      if (isCurrent(generation) && sequence === loadSequence.current && !terminal(error))
        setLoadError('reports.override.error.load');
    } finally {
      if (isCurrent(generation) && sequence === loadSequence.current) setLoading(false);
    }
  };
  // Layout cleanup invalidates promises before a new organization/worklog can paint.
  useLayoutEffect(() => {
    const generation = guard.current.generation + 1;
    guard.current = { generation, inFlight: false };
    sessionClosed.current = !isOpen || !workUnitId;
    clearPrivileged();
    if (isOpen && workUnitId) void loadFresh(generation, null, emptyDraft());
    return () => {
      sessionClosed.current = true;
      guard.current = { generation: guard.current.generation + 1, inFlight: false };
    };
    // This effect creates sessions; requests and callbacks must not restart a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const parsed = ReplaceWorkUnitOverrideRequestSchema.safeParse({ expectedRevision: base?.revision, ...draft });
  const normalizedBase = base
    ? ReplaceWorkUnitOverrideRequestSchema.safeParse({ expectedRevision: base.revision, ...draftFrom(base) })
    : null;
  const dirty = Boolean(
    base &&
    (!parsed.success ||
      !normalizedBase?.success ||
      JSON.stringify(parsed.data) !== JSON.stringify(normalizedBase.data)),
  );
  const taskIdError =
    draft.taskId.mode === 'Set' && (!draft.taskId.value.trim() || Array.from(draft.taskId.value.trim()).length > 255)
      ? 'reports.override.validation.taskId'
      : (fieldErrors.taskId ?? null);
  const blocked =
    !isOpen ||
    !base ||
    sessionClosed.current ||
    loadingCurrent ||
    sourceRefreshRequired ||
    Boolean(busy || conflict || needsFresh);
  const saveDisabled =
    blocked ||
    !base?.override.permissions.canEdit ||
    !parsed.success ||
    !dirty ||
    Boolean(projects.projectResolution) ||
    Object.keys(fieldErrors).length > 0;
  const undoDisabled =
    blocked ||
    dirty ||
    !base?.override.permissions.canEdit ||
    base.override.undo?.canUndo !== true ||
    !base.override.undo.candidateEventId;

  const mutate = async (intent: Intent): Promise<boolean> => {
    if (!isActionCurrent()) return false;
    const activeGuard = guard.current;
    if (sessionClosed.current || activeGuard.inFlight || blocked || !workUnitId || !base) return false;
    if (intent.kind === 'save' && (saveDisabled || !parsed.success)) return false;
    if (
      intent.kind === 'undo' &&
      (!undoTarget ||
        dirty ||
        !base.override.permissions.canEdit ||
        base.revision !== intent.request.expectedRevision ||
        base.override.undo?.canUndo !== true ||
        base.override.undo.candidateEventId !== intent.request.targetEventId)
    )
      return false;
    activeGuard.inFlight = true;
    setBusy(intent.kind);
    setSubmitError(null);
    setFieldErrors({});
    setMutationAccepted(false);
    const generation = actionGeneration;
    try {
      // mutateAsync resolves with the unwrapped response: the mutation hooks read `.data` themselves.
      const data =
        intent.kind === 'undo'
          ? await undoMutation.mutateAsync({ organizationSlug, workUnitId, dto: intent.request })
          : await replaceMutation.mutateAsync({
              organizationSlug,
              workUnitId,
              dto: parsed.success
                ? parsed.data
                : ReplaceWorkUnitOverrideRequestSchema.parse({ expectedRevision: base.revision, ...draft }),
            });
      if (!isCurrent(generation)) return false;
      await acceptFreshResponse(data, generation);
      return isCurrent(generation);
    } catch (error) {
      if (!isCurrent(generation) || terminal(error)) return false;
      setUndoTarget(null);
      const { kind, status, field } = overrideProblem(error);
      if (kind === 'project-not-found' || kind === 'project-unavailable')
        setFieldErrors({ projectId: 'reports.override.error.project' });
      else if (kind === 'invalid-request' || status === 400)
        setFieldErrors({ [field ?? 'form']: 'reports.override.error.invalid' });
      else if (
        kind === 'stale-revision' ||
        status === 409 ||
        kind === 'refresh-required' ||
        !status ||
        status >= 500 ||
        status < 400
      ) {
        const reconciliation: Reconciliation = { intent, reason: status === 409 ? 'conflict' : 'uncertain' };
        setNeedsFresh(reconciliation);
        setSubmitError(`reports.override.error.${reconciliation.reason}`);
        await loadFresh(generation, reconciliation, draft);
      } else setSubmitError('reports.override.error.save');
      return false;
    } finally {
      if (isCurrent(generation)) {
        activeGuard.inFlight = false;
        setBusy(null);
      }
    }
  };
  const editable = (): boolean => isActionCurrent() && !guard.current.inFlight && !conflict && !needsFresh;
  const clearFieldErrors = (): void => {
    setFieldErrors({});
    setSubmitError(null);
    setMutationAccepted(false);
  };
  return {
    base,
    draft,
    clientId,
    conflict,
    fieldErrors,
    loadError,
    submitError,
    taskIdError,
    loadingCurrent,
    dirty,
    saveDisabled,
    undoTarget,
    undoDisabled: Boolean(undoDisabled),
    undoing: busy === 'undo',
    undoConfirmationOpen: undoTarget !== null,
    submitting: busy === 'save',
    historyResetKey,
    mutationAccepted,
    refreshWarning,
    refreshingReport,
    organizationSlug,
    clientOptions: projects.clientOptions,
    projectOptions: projects.projectOptions,
    projectResolution: projects.projectResolution,
    isBusy: () => isActionCurrent() && guard.current.inFlight,
    getCurrentSource: () => (isActionCurrent() ? currentSource.current : null),
    sourceSaveDisabled: blocked,
    refreshAfterSourceSave: async () => {
      if (!isActionCurrent()) return;
      setSourceRefreshRequired(true);
      await loadFresh(actionGeneration);
    },
    close: () => {
      // The wrapper confirms discard before this final close. Invalidate synchronously:
      // React state and the parent's isOpen prop may not update before another action.
      if (isActionCurrent() && !guard.current.inFlight) endSession();
    },
    discardDraft: () => {
      if (isActionCurrent() && !guard.current.inFlight && base) {
        adoptDraft(base);
        setConflict(null);
        setNeedsFresh(null);
        setUndoTarget(null);
        clearFieldErrors();
      }
    },
    setTaskId: (taskId: WorkUnitTaskOverride) => {
      if (editable()) {
        setDraft((value) => ({ ...value, taskId }));
        clearFieldErrors();
      }
    },
    setProjectId: (projectId: string | null) => {
      if (editable()) {
        setDraft((value) => ({ ...value, projectId }));
        setClient(projects.resolveClient(projectId));
        clearFieldErrors();
      }
    },
    setClientId: (next: string | null) => {
      if (editable()) {
        setClient(next);
        if (next !== clientId) setDraft((value) => ({ ...value, projectId: undefined }));
        clearFieldErrors();
      }
    },
    save: () => mutate({ kind: 'save' }),
    openUndoConfirmation: (entry: WorkUnitOverrideHistoryEntry) => {
      if (!isActionCurrent() || guard.current.inFlight || undoDisabled || undoTarget || !base) return;
      const parsedEntry = CurrentWorkUnitOverrideHistoryEntrySchema.safeParse(entry);
      if (
        !parsedEntry.success ||
        (parsedEntry.data.operation !== 'Replace' && parsedEntry.data.operation !== 'Clear') ||
        parsedEntry.data.revertedBy != null ||
        parsedEntry.data.id !== base.override.undo?.candidateEventId
      )
        return;
      setUndoTarget({
        kind: 'undo',
        request: { expectedRevision: base.revision, targetEventId: parsedEntry.data.id },
        historyVersion: parsedEntry.data.version,
        before: parsedEntry.data.before,
      });
    },
    cancelUndo: () => {
      if (isActionCurrent() && !guard.current.inFlight) setUndoTarget(null);
    },
    confirmUndo: async () => {
      if (undoTarget)
        await mutate({
          kind: 'undo',
          request: undoTarget.request,
          historyVersion: undoTarget.historyVersion,
        });
    },
    handleHistoryError: (error: unknown) => (isActionCurrent() ? terminal(error) : false),
    retryFreshLoad: () =>
      !isActionCurrent() || guard.current.inFlight || conflict || (base && !needsFresh && !sourceRefreshRequired)
        ? Promise.resolve()
        : loadFresh(actionGeneration, needsFresh),
    retryReportRefresh: () => (!isActionCurrent() || !isOpen ? Promise.resolve() : refreshReport(actionGeneration)),
    useCurrent: () => {
      if (isActionCurrent() && conflict && !guard.current.inFlight) {
        adoptDraft(conflict.current);
        setConflict(null);
        setNeedsFresh(null);
        setSubmitError(null);
        setUndoTarget(null);
      }
    },
    reviewAndReapply: () => {
      if (isActionCurrent() && conflict && !guard.current.inFlight) {
        setConflict(null);
        setNeedsFresh(null);
        setSubmitError(null);
      }
    },
  };
}
