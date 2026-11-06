import { isDemo } from '@/core/config/demo';
import Button from '@/core/theme/button';
import LoadingArea from '@/core/theme/loadingArea';
import { useCreateIntegrationClientMutation } from '@/modules/integrationClients/hooks/useCreateIntegrationClientMutation';
import { useIntegrationClientQuery } from '@/modules/integrationClients/hooks/useIntegrationClientQuery';
import {
  useRevokeIntegrationClientMutation,
  useRotateIntegrationClientSecretMutation,
} from '@/modules/integrationClients/hooks/useRotateIntegrationClientSecretMutation';
import { useUpdateIntegrationClientMutation } from '@/modules/integrationClients/hooks/useUpdateIntegrationClientMutation';
import { normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import {
  evictIntegrationClientFromLists,
  patchIntegrationClientInLists,
} from '@/modules/integrationClients/queryCache';
import { integrationClientQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type {
  CreateIntegrationClientInput,
  IntegrationClient,
  IntegrationClientProblem,
  UpdateIntegrationClientInput,
} from '@/modules/integrationClients/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useIntegrationClientAuditEventsList } from '@/modules/teamSettings/integrations/hooks/useIntegrationClientAuditEventsList';
import { useIntegrationClientsList } from '@/modules/teamSettings/integrations/hooks/useIntegrationClientsList';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import IntegrationClientConfirmationModal from './IntegrationClientConfirmationModal';
import IntegrationClientDetailsModal, { type DetailsFocusAction } from './IntegrationClientDetailsModal';
import IntegrationClientFormModal from './IntegrationClientFormModal';
import IntegrationClientsTable from './IntegrationClientsTable';
import styles from './Integrations.module.scss';
import OneTimeCredentialsModal, { type OneTimeCredentials } from './OneTimeCredentialsModal';

const unexpectedProblem: IntegrationClientProblem = { kind: 'unexpected', status: null };

interface FormSelection {
  client: IntegrationClient;
  mode: 'edit' | 'renew';
}

interface OwnedOneTimeCredentials extends OneTimeCredentials {
  organizationSlug: string;
}

interface DetailsSelection {
  clientId: string;
  organizationSlug: string;
}

type LifecycleAction = 'rotate' | 'revoke';

interface LifecycleSelection {
  action: LifecycleAction;
  client: IntegrationClient;
  organizationSlug: string;
  returnToDetailsAction: DetailsFocusAction | null;
}

interface RowActionFocus {
  clientId: string;
  organizationSlug: string;
  origin: HTMLElement | null;
}

// TanStack query/mutation hooks throw/reject with a typed IntegrationClientProblem (see
// integrationClientGetQuery.model.ts etc.), but a catch binding is always `unknown` in TypeScript --
// this just documents that narrowing, replacing the old runtime-shape-checking asProblem() helper
// that existed only because plain promise rejections used to be untyped.
const asMutationError = (error: unknown): IntegrationClientProblem => error as IntegrationClientProblem;

const Integrations = (): JSX.Element => {
  const { i18n, t } = useTranslation();
  const projectsContext = useProjects();
  const { fetchProjects } = projectsContext;

  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const organizationSlugRef = useRef(organizationSlug);
  organizationSlugRef.current = organizationSlug;
  const queryClient = useQueryClient();

  const list = useIntegrationClientsList(organizationSlug);
  const isInitialLoading = list.isInitialLoading;
  const isLoadingMore = list.isLoadingMore;
  const hasClients = list.clients.length > 0;
  const hasError = list.state === 'error';
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const addClientRef = useRef<HTMLButtonElement>(null);
  const lifecycleSubmitGuardRef = useRef(false);
  const detailsSelectionRef = useRef<DetailsSelection | null>(null);
  const lifecycleSelectionRef = useRef<LifecycleSelection | null>(null);
  const rowActionTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const rowFormFocusRef = useRef<RowActionFocus | null>(null);
  const rowLifecycleFocusRef = useRef<RowActionFocus | null>(null);
  const restoreRowFormFocusRef = useRef(false);
  const restoreRowLifecycleFocusRef = useRef(false);
  const isMountedRef = useRef(false);
  const restoreCredentialsFocusRef = useRef(false);
  const credentialsOriginRef = useRef<HTMLElement | null>(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [formSelection, setFormSelection] = useState<FormSelection | null>(null);
  const [detailsSelection, setDetailsSelection] = useState<DetailsSelection | null>(null);
  const [detailsReturnFocusAction, setDetailsReturnFocusAction] = useState<DetailsFocusAction | null>(null);
  const [lifecycleSelection, setLifecycleSelection] = useState<LifecycleSelection | null>(null);
  const [lifecycleProblem, setLifecycleProblem] = useState<IntegrationClientProblem | null>(null);
  const [isReconcilePending, setIsReconcilePending] = useState(false);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);
  const [oneTimeCredentials, setOneTimeCredentials] = useState<OwnedOneTimeCredentials | null>(null);

  const createMutation = useCreateIntegrationClientMutation();
  const updateMutation = useUpdateIntegrationClientMutation();
  const rotateMutation = useRotateIntegrationClientSecretMutation();
  const revokeMutation = useRevokeIntegrationClientMutation();
  const isLifecyclePending = rotateMutation.isPending || revokeMutation.isPending || isReconcilePending;
  const isMutationBusy = createMutation.isPending || updateMutation.isPending || isLifecyclePending;

  const replaceDetailsSelection = useCallback((selection: DetailsSelection | null): void => {
    detailsSelectionRef.current = selection;
    setDetailsSelection(selection);
    if (selection === null) setDetailsReturnFocusAction(null);
  }, []);
  const clearDetailsReturnFocus = useCallback((): void => setDetailsReturnFocusAction(null), []);
  const setRowActionTriggerRef = useCallback((clientId: string, button: HTMLButtonElement | null): void => {
    if (button) rowActionTriggerRefs.current.set(clientId, button);
    else rowActionTriggerRefs.current.delete(clientId);
  }, []);
  const focusRowActionFallback = useCallback(
    (rowFocus: RowActionFocus | null): void => {
      if (rowFocus?.organizationSlug !== organizationSlug) return;
      if (rowFocus.origin?.isConnected) rowFocus.origin.focus();
      else {
        const actionTrigger = rowActionTriggerRefs.current.get(rowFocus.clientId);
        if (actionTrigger?.isConnected && !actionTrigger.disabled) actionTrigger.focus();
        else addClientRef.current?.focus();
      }
    },
    [organizationSlug],
  );
  const requestRowLifecycleFocusRestore = useCallback((selection: LifecycleSelection): void => {
    if (selection.returnToDetailsAction === null) restoreRowLifecycleFocusRef.current = true;
  }, []);
  const replaceLifecycleSelection = useCallback((selection: LifecycleSelection | null): void => {
    lifecycleSelectionRef.current = selection;
    setLifecycleSelection(selection);
  }, []);
  const visibleOneTimeCredentials: OneTimeCredentials | null =
    oneTimeCredentials?.organizationSlug === organizationSlug
      ? { clientId: oneTimeCredentials.clientId, clientSecret: oneTimeCredentials.clientSecret }
      : null;
  const activeProjects = projectsContext.filteredOrganizationProjects.filter(({ archived }) => !archived);
  const visibleDetailsSelection = detailsSelection?.organizationSlug === organizationSlug ? detailsSelection : null;
  const visibleLifecycleSelection =
    lifecycleSelection?.organizationSlug === organizationSlug ? lifecycleSelection : null;

  const detailQuery = useIntegrationClientQuery(organizationSlug, visibleDetailsSelection?.clientId ?? '');
  const audit = useIntegrationClientAuditEventsList(organizationSlug, visibleDetailsSelection?.clientId ?? null);
  // isSuccess alone would be true for stale cached data served instantly on reopen, before the
  // staleTime:0-forced background refetch (see integrationClientGetQuery.model.ts) has completed --
  // gate on fetchStatus too so lifecycle actions stay disabled until a real network read for this
  // selection has actually finished, matching the old store's "loadClient always hits the wire"
  // guarantee.
  const isDetailFresh = visibleDetailsSelection !== null && detailQuery.isSuccess && detailQuery.fetchStatus === 'idle';
  const detailsClient = visibleDetailsSelection ? (detailQuery.data ?? null) : null;
  const detailState = detailQuery.isError
    ? 'error'
    : detailQuery.isSuccess
      ? 'success'
      : detailQuery.fetchStatus === 'idle'
        ? 'idle'
        : 'loading';
  const auditState = audit.state;

  const projectCatalogState =
    projectsContext.organizationProjectsCatalogState === 'error'
      ? 'error'
      : projectsContext.organizationProjectsCatalogState === 'loading' ||
          projectsContext.organizationProjectsCatalogState === 'idle' ||
          projectsContext.isOrganizationProjectsCatalogReady === false
        ? 'loading'
        : 'ready';

  useEffect(() => {
    void fetchProjects().catch(() => undefined);
  }, [organizationSlug, fetchProjects]);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      lifecycleSubmitGuardRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsCreateFormOpen(false);
    setFormSelection(null);
    replaceDetailsSelection(null);
    replaceLifecycleSelection(null);
    // Not scoped per-selection, so a mutation left pending when the user switched organizations
    // (submitLifecycleAction's own organizationSlug check blocks it from ever completing here) would
    // otherwise latch this true forever and silently no-op every future lifecycle submission, in any
    // organization -- matches the old store's reset-on-organization-switch guarantee.
    lifecycleSubmitGuardRef.current = false;
    setLifecycleProblem(null);
    setLifecycleNotice(null);
    setOneTimeCredentials((currentCredentials) =>
      currentCredentials?.organizationSlug === organizationSlug ? currentCredentials : null,
    );
    restoreCredentialsFocusRef.current = false;
    credentialsOriginRef.current = null;
    restoreRowLifecycleFocusRef.current = false;
    restoreRowFormFocusRef.current = false;
    rowFormFocusRef.current = null;
    rowLifecycleFocusRef.current = null;
  }, [organizationSlug, replaceDetailsSelection, replaceLifecycleSelection]);

  useEffect(() => {
    if (oneTimeCredentials !== null || !restoreCredentialsFocusRef.current) return;
    restoreCredentialsFocusRef.current = false;
    const origin = credentialsOriginRef.current;
    credentialsOriginRef.current = null;
    const rowFocus = rowLifecycleFocusRef.current;
    rowLifecycleFocusRef.current = null;
    if (origin?.isConnected) origin.focus();
    else if (rowFocus) focusRowActionFallback(rowFocus);
    else addClientRef.current?.focus();
  }, [focusRowActionFallback, oneTimeCredentials]);

  useEffect(() => {
    if (!restoreRowFormFocusRef.current || formSelection !== null) return;
    restoreRowFormFocusRef.current = false;
    const rowFocus = rowFormFocusRef.current;
    rowFormFocusRef.current = null;
    focusRowActionFallback(rowFocus);
  }, [focusRowActionFallback, formSelection]);

  useEffect(() => {
    if (
      !restoreRowLifecycleFocusRef.current ||
      visibleLifecycleSelection !== null ||
      visibleOneTimeCredentials !== null ||
      isMutationBusy
    ) {
      return;
    }
    restoreRowLifecycleFocusRef.current = false;
    credentialsOriginRef.current = null;
    const rowFocus = rowLifecycleFocusRef.current;
    rowLifecycleFocusRef.current = null;
    focusRowActionFallback(rowFocus);
  }, [focusRowActionFallback, isMutationBusy, visibleLifecycleSelection, visibleOneTimeCredentials]);

  // Replaces the old store's imperative client-not-found handling in loadClient/loadAuditEvents:
  // the detail/audit queries are already keyed by clientId, so a stale response for a *previous*
  // selection can never surface here -- this only reacts to the current selection's own error.
  useEffect(() => {
    if (!visibleDetailsSelection || detailQuery.error?.kind !== 'client-not-found') return;
    replaceDetailsSelection(null);
    setLifecycleNotice('team_seatings.integrations.lifecycle.notice.not_found');
  }, [detailQuery.error, visibleDetailsSelection, replaceDetailsSelection]);

  useEffect(() => {
    if (!visibleDetailsSelection || audit.error?.kind !== 'client-not-found') return;
    replaceDetailsSelection(null);
    setLifecycleNotice('team_seatings.integrations.lifecycle.notice.not_found');
  }, [audit.error, visibleDetailsSelection, replaceDetailsSelection]);

  const retry = (): void => list.retry();

  const loadMore = (): void => list.loadMore();

  const openEditForm = (client: IntegrationClient): void => {
    if (isDemo || isMutationBusy) return;
    const detailsOrigin = detailsSelectionRef.current;
    if (detailsOrigin?.clientId === client.clientId && detailsOrigin.organizationSlug === organizationSlug) {
      rowFormFocusRef.current = null;
      setDetailsReturnFocusAction('edit');
    } else {
      rowFormFocusRef.current = {
        clientId: client.clientId,
        organizationSlug,
        origin: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      };
      replaceDetailsSelection(null);
    }
    replaceLifecycleSelection(null);
    setLifecycleProblem(null);
    if (client.status === 'Active') setFormSelection({ client, mode: 'edit' });
    else if (client.status === 'Expired') setFormSelection({ client, mode: 'renew' });
  };

  const openDetails = (client: IntegrationClient): void => {
    if (isMutationBusy) return;
    setLifecycleNotice(null);
    replaceDetailsSelection({ clientId: client.clientId, organizationSlug });
  };

  const openLifecycleConfirmation = (action: LifecycleAction, client: IntegrationClient): void => {
    if (isDemo || isMutationBusy) return;
    if (action === 'rotate' && client.status !== 'Active') return;
    if (action === 'revoke' && client.status === 'Revoked') return;
    credentialsOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const detailsOrigin = detailsSelectionRef.current;
    const returnToDetailsAction =
      detailsOrigin?.clientId === client.clientId && detailsOrigin.organizationSlug === organizationSlug
        ? action
        : null;
    rowLifecycleFocusRef.current =
      returnToDetailsAction === null
        ? { clientId: client.clientId, organizationSlug, origin: credentialsOriginRef.current }
        : null;
    setDetailsReturnFocusAction(returnToDetailsAction);
    setLifecycleProblem(null);
    setLifecycleNotice(null);
    replaceLifecycleSelection({ action, client, organizationSlug, returnToDetailsAction });
  };

  const submitUpdate = (input: UpdateIntegrationClientInput): Promise<void> => {
    if (isDemo) return Promise.resolve();
    // Same rationale as asMutationError above.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (!formSelection) return Promise.reject(unexpectedProblem);
    return updateMutation
      .mutateAsync({ organizationSlug, clientId: formSelection.client.clientId, input })
      .then(() => undefined);
  };

  const submitCreate = async (input: CreateIntegrationClientInput): Promise<void> => {
    if (isDemo) return;
    const submittedOrganizationSlug = organizationSlug;
    const {
      client: { clientId },
      clientSecret,
    } = await createMutation.mutateAsync({ organizationSlug: submittedOrganizationSlug, input });
    if (!isMountedRef.current || organizationSlugRef.current !== submittedOrganizationSlug) return;

    credentialsOriginRef.current = addClientRef.current;
    setOneTimeCredentials({ clientId, clientSecret, organizationSlug: submittedOrganizationSlug });
    setIsCreateFormOpen(false);
  };

  const refreshSelectedClient = async (): Promise<IntegrationClient> => {
    // Same rationale as asMutationError above.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (!formSelection) return Promise.reject(unexpectedProblem);
    const clientId = formSelection.client.clientId;
    let client: IntegrationClient;
    try {
      client = await queryClient.fetchQuery({
        queryKey: integrationClientQueryKey(organizationSlug, clientId),
        queryFn: () =>
          requests.getIntegrationClient(organizationSlug, clientId).catch((error: unknown) => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw normalizeIntegrationClientProblem(error);
          }),
        // A conflict-resolution read must hit the network, never satisfy from a recently-cached
        // response (the production default staleTime is 60s) -- otherwise this can "resolve" a
        // stale-version conflict with the exact same stale data that caused it.
        staleTime: 0,
      });
    } catch (error: unknown) {
      const problem = asMutationError(error);
      // Every other not-found path in this module evicts the client from cached list pages; this
      // conflict-resolution read must too, or a deleted client's row stays visible and clickable
      // until some unrelated interaction happens to trigger eviction elsewhere.
      if (problem.kind === 'client-not-found') evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
      // Same rationale as asMutationError above.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw problem;
    }
    patchIntegrationClientInLists(queryClient, organizationSlug, client);
    if (!isMountedRef.current) return client;
    setFormSelection((currentSelection) => {
      if (!currentSelection || currentSelection.client.clientId !== clientId) return currentSelection;
      if (client.status === 'Revoked') {
        if (rowFormFocusRef.current) restoreRowFormFocusRef.current = true;
        return null;
      }
      return {
        client,
        mode: client.status === 'Active' ? 'edit' : 'renew',
      };
    });
    return client;
  };

  const retryProjects = async (): Promise<void> => {
    await projectsContext.fetchProjects();
    // Same rationale as asMutationError above.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (!projectsContext.isOrganizationProjectsCatalogReady) return Promise.reject(unexpectedProblem);
  };

  const closeDetails = (): void => {
    if (isMutationBusy) return;
    replaceDetailsSelection(null);
  };

  const closeEditForm = (): void => {
    if (rowFormFocusRef.current) restoreRowFormFocusRef.current = true;
    setFormSelection(null);
  };

  const retryDetails = (): void => void detailQuery.refetch();

  const retryAudit = (): void => audit.retry();

  const loadMoreAudit = (): void => audit.loadMore();

  const reconcileNotActive = async (selection: LifecycleSelection): Promise<void> => {
    setIsReconcilePending(true);
    try {
      const client = await queryClient.fetchQuery({
        queryKey: integrationClientQueryKey(organizationSlug, selection.client.clientId),
        queryFn: () =>
          requests.getIntegrationClient(organizationSlug, selection.client.clientId).catch((error: unknown) => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw normalizeIntegrationClientProblem(error);
          }),
        // Same rationale as refreshSelectedClient -- must hit the network, not the ~60s-fresh cache.
        staleTime: 0,
      });
      patchIntegrationClientInLists(queryClient, organizationSlug, client);
      if (
        !isMountedRef.current ||
        lifecycleSelectionRef.current !== selection ||
        organizationSlugRef.current !== selection.organizationSlug
      ) {
        return;
      }
      requestRowLifecycleFocusRestore(selection);
      replaceLifecycleSelection(null);
      setLifecycleProblem(null);
    } catch (error: unknown) {
      if (
        !isMountedRef.current ||
        lifecycleSelectionRef.current !== selection ||
        organizationSlugRef.current !== selection.organizationSlug
      ) {
        return;
      }
      const problem = asMutationError(error);
      if (problem.kind === 'client-not-found') {
        // Every other not-found path in this module evicts the client from cached list pages; this
        // conflict-resolution read must too, or a deleted client's row stays visible and clickable.
        evictIntegrationClientFromLists(queryClient, organizationSlug, selection.client.clientId);
        requestRowLifecycleFocusRestore(selection);
        replaceLifecycleSelection(null);
        replaceDetailsSelection(null);
        setLifecycleNotice('team_seatings.integrations.lifecycle.notice.not_found');
      } else {
        setLifecycleProblem(problem);
      }
    } finally {
      setIsReconcilePending(false);
    }
  };

  const submitLifecycleAction = async (): Promise<void> => {
    if (isDemo) return;
    const selection = lifecycleSelection;
    if (!selection || lifecycleSubmitGuardRef.current || selection.organizationSlug !== organizationSlug) return;
    lifecycleSubmitGuardRef.current = true;
    setLifecycleProblem(null);

    try {
      if (selection.action === 'rotate') {
        const {
          client: { clientId },
          clientSecret,
        } = await rotateMutation.mutateAsync({
          organizationSlug: selection.organizationSlug,
          clientId: selection.client.clientId,
          expectedVersion: selection.client.version,
        });
        if (
          !isMountedRef.current ||
          lifecycleSelectionRef.current !== selection ||
          organizationSlugRef.current !== selection.organizationSlug
        ) {
          return;
        }
        replaceLifecycleSelection(null);
        if (selection.returnToDetailsAction === null) replaceDetailsSelection(null);
        setOneTimeCredentials({ clientId, clientSecret, organizationSlug: selection.organizationSlug });
      } else {
        await revokeMutation.mutateAsync({
          organizationSlug: selection.organizationSlug,
          clientId: selection.client.clientId,
          expectedVersion: selection.client.version,
        });
        if (
          !isMountedRef.current ||
          lifecycleSelectionRef.current !== selection ||
          organizationSlugRef.current !== selection.organizationSlug
        ) {
          return;
        }
        requestRowLifecycleFocusRestore(selection);
        replaceLifecycleSelection(null);
        if (
          detailsSelectionRef.current?.clientId === selection.client.clientId &&
          detailsSelectionRef.current.organizationSlug === selection.organizationSlug
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['integrationClientAuditEvents', selection.organizationSlug, selection.client.clientId],
            exact: false,
          });
        }
      }
    } catch (error: unknown) {
      if (
        !isMountedRef.current ||
        lifecycleSelectionRef.current !== selection ||
        organizationSlugRef.current !== selection.organizationSlug
      ) {
        return;
      }
      const problem = asMutationError(error);
      if (problem.kind === 'client-not-found') {
        requestRowLifecycleFocusRestore(selection);
        replaceLifecycleSelection(null);
        replaceDetailsSelection(null);
        setLifecycleNotice('team_seatings.integrations.lifecycle.notice.not_found');
      } else if (problem.kind === 'not-active') {
        await reconcileNotActive(selection);
      } else {
        setLifecycleProblem(problem);
      }
    } finally {
      if (lifecycleSelectionRef.current === selection || lifecycleSelectionRef.current === null) {
        lifecycleSubmitGuardRef.current = false;
      }
    }
  };

  const refreshLifecycleClient = async (): Promise<void> => {
    const selection = lifecycleSelection;
    if (!selection || lifecycleSubmitGuardRef.current || selection.organizationSlug !== organizationSlug) return;
    lifecycleSubmitGuardRef.current = true;
    try {
      await reconcileNotActive(selection);
    } finally {
      lifecycleSubmitGuardRef.current = false;
    }
  };

  const lifecycleProblemMessage = (): string | undefined => {
    if (!lifecycleProblem) return undefined;
    if (lifecycleProblem.kind === 'stale-version') {
      return t(
        `team_seatings.integrations.lifecycle.error.stale-version.${
          lifecycleProblem.currentVersion === null ? 'without-version' : 'with-version'
        }`,
        lifecycleProblem.currentVersion === null ? undefined : { currentVersion: lifecycleProblem.currentVersion },
      );
    }
    if (lifecycleProblem.kind === 'forbidden') {
      return t('team_seatings.integrations.lifecycle.error.forbidden');
    }
    return t('team_seatings.integrations.lifecycle.error.retry');
  };

  const finishOneTimeCredentials = (): void => {
    restoreCredentialsFocusRef.current = detailsReturnFocusAction === null;
    if (detailsReturnFocusAction !== null) credentialsOriginRef.current = null;
    setOneTimeCredentials(null);
    // The credentials just shown carry a one-time clientSecret that must not linger in the
    // MutationCache after this modal closes. Paired with gcTime: 0 on both mutations, reset()
    // drops each mutation's observer reference so its cache entry is collected right away instead
    // of surviving for the default 5-minute gcTime.
    createMutation.reset();
    rotateMutation.reset();
  };

  return (
    <>
      <section className={styles.root}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <h3>{t('team_seatings.integrations.heading')}</h3>
            <p>{t('team_seatings.integrations.description')}</p>
          </div>
          <Button
            disabled={isDemo || isCreateFormOpen || visibleOneTimeCredentials !== null || isMutationBusy}
            forwardedRef={addClientRef}
            label={t('team_seatings.integrations.action.add')}
            onClick={() => {
              if (!isDemo) setIsCreateFormOpen(true);
            }}
          />
        </header>

        {isInitialLoading && (
          <div className={styles.loadingState}>
            <LoadingArea className={styles.loadingArea} loading />
            <p role="status">{t('team_seatings.integrations.loading')}</p>
          </div>
        )}

        {!isInitialLoading && hasClients && (
          <IntegrationClientsTable
            readOnly={isDemo}
            actionsDisabled={isMutationBusy}
            clients={list.clients}
            count={list.count}
            isLoadingMore={isLoadingMore}
            locale={locale}
            onDetails={openDetails}
            onActionTriggerRef={setRowActionTriggerRef}
            onEdit={openEditForm}
            onLoadMore={loadMore}
            onRevoke={(client) => openLifecycleConfirmation('revoke', client)}
            onRotate={(client) => openLifecycleConfirmation('rotate', client)}
          />
        )}

        {lifecycleNotice && (
          <p className={styles.lifecycleNotice} role="status">
            {t(lifecycleNotice)}
          </p>
        )}

        {!isInitialLoading && hasError && (
          <div className={styles.errorState} role="alert">
            <h4>{t('team_seatings.integrations.error.heading')}</h4>
            <p>
              {t(
                list.error?.kind === 'validation'
                  ? 'team_seatings.integrations.error.validation.description'
                  : 'team_seatings.integrations.error.description',
              )}
            </p>
            <Button
              className={styles.stateButton}
              label={t('team_seatings.integrations.retry')}
              onClick={retry}
              variant="outlined"
            />
          </div>
        )}

        {!isInitialLoading && !hasError && !hasClients && list.state === 'success' && (
          <div className={styles.emptyState}>
            <h4>{t('team_seatings.integrations.empty.heading')}</h4>
            <p>{t('team_seatings.integrations.empty.description')}</p>
          </div>
        )}
      </section>

      {!isDemo && isCreateFormOpen && (
        <IntegrationClientFormModal
          isOpen
          mode="create"
          onClose={() => setIsCreateFormOpen(false)}
          onRetryProjects={retryProjects}
          onSubmit={submitCreate}
          projectCatalogState={projectCatalogState}
          projects={activeProjects}
        />
      )}

      {!isDemo && formSelection && (
        <IntegrationClientFormModal
          client={formSelection.client}
          isOpen
          mode={formSelection.mode}
          onClose={closeEditForm}
          onRefresh={refreshSelectedClient}
          onRetryProjects={retryProjects}
          onSubmit={submitUpdate}
          projectCatalogState={projectCatalogState}
          projects={activeProjects}
        />
      )}

      {visibleDetailsSelection &&
        !formSelection &&
        !visibleLifecycleSelection &&
        !visibleOneTimeCredentials &&
        !isLifecyclePending && (
          <IntegrationClientDetailsModal
            readOnly={isDemo}
            auditEvents={audit.auditEvents}
            auditHasNextPage={audit.hasNextPage}
            auditState={auditState}
            client={detailsClient}
            detailState={detailState}
            isDetailFresh={isDetailFresh}
            isBusy={isMutationBusy}
            isOpen
            locale={locale}
            initialFocusAction={detailsReturnFocusAction}
            onClose={closeDetails}
            onEdit={openEditForm}
            onInitialFocusHandled={clearDetailsReturnFocus}
            onLoadMoreAudit={loadMoreAudit}
            onRetryAudit={retryAudit}
            onRetryDetails={retryDetails}
            onRevoke={(client) => openLifecycleConfirmation('revoke', client)}
            onRotate={(client) => openLifecycleConfirmation('rotate', client)}
          />
        )}

      {!isDemo && visibleLifecycleSelection && (
        <>
          <IntegrationClientConfirmationModal
            actions={[
              {
                disabled: lifecycleProblem?.kind === 'stale-version' || lifecycleProblem?.kind === 'forbidden',
                label: t(`team_seatings.integrations.lifecycle.${visibleLifecycleSelection.action}.confirm`),
                loading: isLifecyclePending,
                onClick: submitLifecycleAction,
              },
              ...(lifecycleProblem?.kind === 'stale-version'
                ? [
                    {
                      label: t('team_seatings.integrations.lifecycle.refresh'),
                      onClick: refreshLifecycleClient,
                    },
                  ]
                : []),
            ]}
            cancelLabel={t('common.cancel')}
            isOpen
            isSubmitting={isLifecyclePending}
            onCancel={() => {
              if (isLifecyclePending) return;
              requestRowLifecycleFocusRestore(visibleLifecycleSelection);
              replaceLifecycleSelection(null);
              setLifecycleProblem(null);
            }}
            message={
              lifecycleProblemMessage() ??
              t(`team_seatings.integrations.lifecycle.${visibleLifecycleSelection.action}.text`)
            }
            messageRole={lifecycleProblem ? 'alert' : undefined}
            title={t(`team_seatings.integrations.lifecycle.${visibleLifecycleSelection.action}.title`)}
          />
        </>
      )}

      {visibleOneTimeCredentials && (
        <OneTimeCredentialsModal credentials={visibleOneTimeCredentials} isOpen onDone={finishOneTimeCredentials} />
      )}
    </>
  );
};

export default Integrations;
