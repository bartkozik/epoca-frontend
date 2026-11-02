import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import Modal from '@/core/theme/modal';
import MultiSearch from '@/core/theme/multiSearch';
import { OAUTH_SCOPES } from '@/modules/integrationClients/models/integrationClientDto.model';
import type {
  CreateIntegrationClientInput,
  IntegrationClient,
  IntegrationClientProblem,
  UpdateIntegrationClientInput,
} from '@/modules/integrationClients/types';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildCreateIntegrationClientInput,
  buildUpdateIntegrationClientInput,
  createIntegrationClientDraft,
  type IntegrationClientDraft,
  type IntegrationClientFormErrors,
  type IntegrationClientFormField,
} from './form';
import IntegrationClientConfirmationModal from './IntegrationClientConfirmationModal';
import styles from './IntegrationClientFormModal.module.scss';

export interface IntegrationClientProjectOption {
  archived?: boolean;
  id: string;
  name: string;
}

export type IntegrationClientProjectCatalogState = 'error' | 'loading' | 'ready';

interface CommonProps {
  isOpen: boolean;
  now?: () => Date;
  onClose: () => void;
  onRetryProjects?: () => Promise<void>;
  projectCatalogState?: IntegrationClientProjectCatalogState;
  projects: readonly IntegrationClientProjectOption[];
}

interface CreateProps extends CommonProps {
  client?: never;
  mode: 'create';
  onRefresh?: never;
  onSubmit: (input: CreateIntegrationClientInput) => Promise<void>;
}

interface UpdateProps extends CommonProps {
  client: IntegrationClient;
  mode: 'edit' | 'renew';
  onRefresh?: () => Promise<IntegrationClient>;
  onSubmit: (input: UpdateIntegrationClientInput) => Promise<void>;
}

export type IntegrationClientFormModalProps = CreateProps | UpdateProps;

const problemKinds: IntegrationClientProblem['kind'][] = [
  'invalid-expiration',
  'invalid-policy',
  'name-conflict',
  'not-active',
  'client-not-found',
  'forbidden',
  'service-unavailable',
  'unexpected',
  'stale-version',
  'timeout',
  'transport',
  'validation',
];

const asProblem = (error: unknown): IntegrationClientProblem => {
  if (typeof error !== 'object' || error === null) return { kind: 'unexpected', status: null };
  const candidate = error as Partial<IntegrationClientProblem>;
  if (!candidate.kind || !problemKinds.includes(candidate.kind)) return { kind: 'unexpected', status: null };
  if (candidate.kind === 'stale-version') {
    return {
      kind: candidate.kind,
      status: typeof candidate.status === 'number' ? candidate.status : 409,
      currentVersion:
        'currentVersion' in candidate && typeof candidate.currentVersion === 'number' ? candidate.currentVersion : null,
    };
  }
  if (candidate.kind === 'timeout' || candidate.kind === 'transport' || candidate.kind === 'validation') {
    return { kind: candidate.kind, status: null };
  }
  return {
    kind: candidate.kind,
    status: typeof candidate.status === 'number' ? candidate.status : null,
  };
};

const fieldOrder: IntegrationClientFormField[] = ['name', 'scopes', 'projects', 'expiresAt', 'form'];

interface StatusError {
  blocksSubmit?: boolean;
  currentVersion?: number;
  key: string;
  refreshable?: boolean;
}

const IntegrationClientFormModal = (props: IntegrationClientFormModalProps): JSX.Element | null => {
  const { isOpen, mode, onClose, projectCatalogState = 'ready', projects } = props;
  const { t } = useTranslation();
  const isProjectCatalogReady = projectCatalogState === 'ready';
  const activeProjects = projects.filter(({ archived }) => archived !== true);
  const activeProjectIds = activeProjects.map(({ id }) => id);
  const projectCatalogKey = isProjectCatalogReady ? JSON.stringify(activeProjectIds) : 'pending';
  const projectIdsForDraft = isProjectCatalogReady ? activeProjectIds : undefined;
  const titleId = useId();
  const nameId = useId();
  const scopesErrorId = useId();
  const projectsErrorId = useId();
  const projectCatalogStatusId = useId();
  const projectAccessHelperId = useId();
  const policyErrorId = useId();
  const expirationErrorId = useId();
  const formErrorId = useId();
  const refreshErrorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const scopesRef = useRef<HTMLInputElement>(null);
  const projectsRef = useRef<HTMLInputElement>(null);
  const expiresAtRef = useRef<HTMLInputElement>(null);
  const submitGuardRef = useRef(false);
  const pendingValidatedInputRef = useRef<CreateIntegrationClientInput | UpdateIntegrationClientInput | null>(null);
  const refreshGuardRef = useRef(false);
  const projectRetryGuardRef = useRef(false);
  const focusAfterBusyRef = useRef<'expiresAt' | 'name' | 'scopes' | null>(null);
  const focusProjectAccessAfterConfirmationRef = useRef(false);
  const projectIdsForDraftRef = useRef<readonly string[] | undefined>(projectIdsForDraft);
  projectIdsForDraftRef.current = projectIdsForDraft;
  const [baseClient, setBaseClient] = useState<IntegrationClient | undefined>(props.client);
  const [draft, setDraft] = useState<IntegrationClientDraft>(() =>
    createIntegrationClientDraft(props.client, projectIdsForDraft),
  );
  const [errors, setErrors] = useState<IntegrationClientFormErrors>({});
  const [backendFieldError, setBackendFieldError] = useState<{
    field: 'name' | 'scopes' | 'expiresAt';
    key: string;
  } | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<StatusError | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetryingProjects, setIsRetryingProjects] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const isBusy = isPending || isRefreshing;
  const invalidLifecycle =
    (mode === 'edit' && props.client.status !== 'Active') || (mode === 'renew' && props.client.status !== 'Expired');

  useEffect(() => {
    if (!isOpen) return;
    setBaseClient(props.client);
    setDraft(createIntegrationClientDraft(props.client, projectIdsForDraftRef.current));
    setErrors({});
    setBackendFieldError(null);
    setPolicyError(null);
    setStatusError(null);
    setRefreshError(false);
    setConfirmAllOpen(false);
    submitGuardRef.current = false;
    refreshGuardRef.current = false;
    projectRetryGuardRef.current = false;
    pendingValidatedInputRef.current = null;
    focusAfterBusyRef.current = null;
    focusProjectAccessAfterConfirmationRef.current = false;
    setIsPending(false);
    setIsRefreshing(false);
    setIsRetryingProjects(false);
  }, [isOpen, mode, props.client]);

  useEffect(() => {
    if (isOpen) return;
    pendingValidatedInputRef.current = null;
    setConfirmAllOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isProjectCatalogReady) return;
    setDraft((current) => ({
      ...current,
      projectIds: current.projectIds.filter((projectId) => projectIdsForDraftRef.current?.includes(projectId)),
    }));
  }, [isProjectCatalogReady, projectCatalogKey]);

  useEffect(() => {
    if (!isOpen || invalidLifecycle) return;
    nameRef.current?.focus();
  }, [invalidLifecycle, isOpen, mode, props.client]);

  useEffect(() => {
    if (isBusy || focusAfterBusyRef.current === null) return;
    if (focusAfterBusyRef.current === 'name') nameRef.current?.focus();
    else if (focusAfterBusyRef.current === 'scopes') scopesRef.current?.focus();
    else expiresAtRef.current?.focus();
    focusAfterBusyRef.current = null;
  }, [backendFieldError, baseClient, isBusy, policyError]);

  useEffect(() => {
    if (!isOpen || confirmAllOpen || !focusProjectAccessAfterConfirmationRef.current) return;
    focusProjectAccessAfterConfirmationRef.current = false;
    projectsRef.current?.focus();
  }, [confirmAllOpen, isOpen]);

  if (invalidLifecycle) return null;

  const clearError = (field: IntegrationClientFormField): void => {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setBackendFieldError((current) => (current?.field === field ? null : current));
    if (field === 'scopes' || field === 'projects') setPolicyError(null);
    setStatusError((current) => (current?.blocksSubmit ? current : null));
  };

  const updateDraft = <K extends keyof IntegrationClientDraft>(key: K, value: IntegrationClientDraft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const errorMessage = (field: IntegrationClientFormField): string | null => {
    if (backendFieldError?.field === field) return t(`team_seatings.integrations.form.error.${backendFieldError.key}`);
    const error = errors[field];
    return error ? t(`team_seatings.integrations.form.error.${field}.${error}`) : null;
  };

  const focusFirstError = (nextErrors: IntegrationClientFormErrors): void => {
    const firstError = fieldOrder.find((field) => nextErrors[field] !== undefined);
    if (firstError === 'name') nameRef.current?.focus();
    else if (firstError === 'scopes') scopesRef.current?.focus();
    else if (firstError === 'projects') projectsRef.current?.focus();
    else if (firstError === 'expiresAt') expiresAtRef.current?.focus();
  };

  const showProblem = (problem: IntegrationClientProblem): void => {
    setBackendFieldError(null);
    setPolicyError(null);
    setStatusError(null);
    setRefreshError(false);
    if (problem.kind === 'name-conflict') {
      setBackendFieldError({ field: 'name', key: problem.kind });
      focusAfterBusyRef.current = 'name';
      return;
    }
    if (problem.kind === 'invalid-expiration') {
      setBackendFieldError({ field: 'expiresAt', key: problem.kind });
      focusAfterBusyRef.current = 'expiresAt';
      return;
    }
    if (problem.kind === 'invalid-policy') {
      setPolicyError(problem.kind);
      focusAfterBusyRef.current = 'scopes';
      return;
    }

    if (problem.kind === 'stale-version') {
      setStatusError({
        blocksSubmit: true,
        currentVersion: problem.currentVersion ?? undefined,
        key: problem.currentVersion === null ? 'stale-version.without-version' : 'stale-version.with-version',
        refreshable: Boolean(props.onRefresh),
      });
    } else if (problem.kind === 'not-active') {
      setStatusError({ blocksSubmit: true, key: problem.kind, refreshable: Boolean(props.onRefresh) });
    } else if (problem.kind === 'client-not-found' || problem.kind === 'forbidden') {
      setStatusError({ blocksSubmit: true, key: problem.kind });
    } else {
      setStatusError({ key: 'retry' });
    }
  };

  const submitValidated = (input: CreateIntegrationClientInput | UpdateIntegrationClientInput): void => {
    submitGuardRef.current = true;
    setIsPending(true);
    setErrors({});
    setBackendFieldError(null);
    setPolicyError(null);
    setStatusError(null);
    setRefreshError(false);
    let submission: Promise<void>;
    try {
      submission =
        mode === 'create'
          ? props.onSubmit(input as CreateIntegrationClientInput)
          : props.onSubmit(input as UpdateIntegrationClientInput);
    } catch (error: unknown) {
      submitGuardRef.current = false;
      setIsPending(false);
      showProblem(asProblem(error));
      return;
    }
    void Promise.resolve(submission)
      .then(() => onClose())
      .catch((error: unknown) => showProblem(asProblem(error)))
      .finally(() => {
        submitGuardRef.current = false;
        setIsPending(false);
      });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitGuardRef.current || statusError?.blocksSubmit) return;

    const result =
      mode === 'create'
        ? buildCreateIntegrationClientInput(draft, activeProjectIds, (props.now ?? (() => new Date()))())
        : buildUpdateIntegrationClientInput(
            mode,
            draft,
            baseClient ?? props.client,
            activeProjectIds,
            (props.now ?? (() => new Date()))(),
          );
    if (!result.ok) {
      setErrors(result.errors);
      setBackendFieldError(null);
      setPolicyError(null);
      setStatusError((current) => (current?.blocksSubmit ? current : null));
      focusFirstError(result.errors);
      return;
    }

    setErrors({});
    setBackendFieldError(null);
    setPolicyError(null);
    setStatusError(null);
    setRefreshError(false);
    if (props.mode !== 'create') {
      const baseProjectAccessMode = (baseClient ?? props.client).projectAccess.mode;
      if (baseProjectAccessMode === 'SelectedProjects' && result.value.projectAccess?.mode === 'AllProjects') {
        pendingValidatedInputRef.current = result.value;
        setConfirmAllOpen(true);
        return;
      }
    }

    submitValidated(result.value);
  };

  const handleRefresh = (): void => {
    if (!props.onRefresh || isBusy || refreshGuardRef.current) return;
    refreshGuardRef.current = true;
    setIsRefreshing(true);
    setRefreshError(false);
    let refresh: Promise<IntegrationClient>;
    try {
      refresh = props.onRefresh();
    } catch {
      refreshGuardRef.current = false;
      setIsRefreshing(false);
      setRefreshError(true);
      return;
    }
    void Promise.resolve(refresh)
      .then((client) => {
        setBaseClient(client);
        setDraft(createIntegrationClientDraft(client, projectIdsForDraftRef.current));
        setErrors({});
        setBackendFieldError(null);
        setPolicyError(null);
        setStatusError(null);
        setRefreshError(false);
        focusAfterBusyRef.current = 'name';
      })
      .catch(() => {
        setRefreshError(true);
      })
      .finally(() => {
        refreshGuardRef.current = false;
        setIsRefreshing(false);
      });
  };

  const handleRetryProjects = (): void => {
    if (!props.onRetryProjects || projectRetryGuardRef.current) return;
    projectRetryGuardRef.current = true;
    setIsRetryingProjects(true);
    let retry: Promise<void>;
    try {
      retry = props.onRetryProjects();
    } catch {
      projectRetryGuardRef.current = false;
      setIsRetryingProjects(false);
      return;
    }
    void Promise.resolve(retry)
      .catch(() => undefined)
      .finally(() => {
        projectRetryGuardRef.current = false;
        setIsRetryingProjects(false);
      });
  };

  const close = (): void => {
    if (!isBusy) onClose();
  };

  const setProjectAccessMode = (nextMode: IntegrationClientDraft['projectAccessMode']): void => {
    if (draft.projectAccessMode === nextMode) return;
    updateDraft('projectAccessMode', nextMode);
    clearError('projects');
  };

  const closeProjectAccessConfirmation = (): void => {
    pendingValidatedInputRef.current = null;
    focusProjectAccessAfterConfirmationRef.current = true;
    setConfirmAllOpen(false);
  };

  const confirmProjectAccessExpansion = (): void => {
    if (submitGuardRef.current || pendingValidatedInputRef.current === null) return;
    const input = pendingValidatedInputRef.current;
    pendingValidatedInputRef.current = null;
    setConfirmAllOpen(false);
    submitValidated(input);
  };

  const nameError = errorMessage('name');
  const scopesError = errorMessage('scopes');
  const projectsError = errorMessage('projects');
  const expirationError = errorMessage('expiresAt');
  const formError = errorMessage('form');
  const scopesDescribedBy =
    [scopesError ? scopesErrorId : null, policyError ? policyErrorId : null].filter(Boolean).join(' ') || undefined;
  const projectsDescribedBy =
    [
      projectsError ? projectsErrorId : null,
      policyError ? policyErrorId : null,
      isProjectCatalogReady ? null : projectCatalogStatusId,
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  const isProjectCatalogBlockingSubmit = draft.projectAccessMode === 'SelectedProjects' && !isProjectCatalogReady;

  return (
    <>
      <Modal
        ariaLabelledBy={titleId}
        className={styles.modal}
        close={isBusy ? undefined : close}
        disableClickOutside={isBusy}
        disableEscapeClickClose={isBusy}
        isOpen={isOpen && !confirmAllOpen}
        overlayClassName={styles.overlay}
      >
        <h2 className={styles.modalTitle} id={titleId}>
          {t(`team_seatings.integrations.form.title.${mode}`)}
        </h2>
        <form className={styles.form} noValidate onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor={nameId}>{t('team_seatings.integrations.form.name')}</label>
            <input
              ref={nameRef}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
              aria-invalid={Boolean(nameError)}
              autoComplete="off"
              disabled={isBusy}
              id={nameId}
              onChange={(event) => {
                updateDraft('name', event.target.value);
                clearError('name');
              }}
              type="text"
              value={draft.name}
            />
            {nameError && (
              <p className={styles.error} id={`${nameId}-error`} role="alert">
                {nameError}
              </p>
            )}
          </div>

          <fieldset aria-describedby={scopesDescribedBy} className={styles.fieldset}>
            <legend>{t('team_seatings.integrations.form.scopes')}</legend>
            <div className={`${styles.choices} ${styles.scopeChoices}`}>
              {OAUTH_SCOPES.map((scope, index) => (
                <label className={styles.choice} data-disabled={isBusy ? 'true' : undefined} key={scope}>
                  <input
                    ref={index === 0 ? scopesRef : undefined}
                    checked={draft.scopes.includes(scope)}
                    disabled={isBusy}
                    onChange={() => {
                      updateDraft(
                        'scopes',
                        draft.scopes.includes(scope)
                          ? draft.scopes.filter((selectedScope) => selectedScope !== scope)
                          : [...draft.scopes, scope],
                      );
                      clearError('scopes');
                    }}
                    type="checkbox"
                  />
                  <span aria-hidden="true" className={styles.checkmark}>
                    <Icon height={8} icon={icons.checkmark} width={10} />
                  </span>
                  <span className={styles.choiceCopy}>
                    <span>{t(`team_seatings.integrations.form.scope.${scope}`)}</span>
                  </span>
                </label>
              ))}
            </div>
            {scopesError && (
              <p className={styles.error} id={scopesErrorId} role="alert">
                {scopesError}
              </p>
            )}
          </fieldset>

          <fieldset aria-describedby={projectsDescribedBy} className={styles.fieldset}>
            <legend>{t('team_seatings.integrations.form.projects')}</legend>
            <div className={styles.choices}>
              {(['AllProjects', 'SelectedProjects'] as const).map((accessMode, index) => (
                <label className={styles.choice} data-disabled={isBusy ? 'true' : undefined} key={accessMode}>
                  <input
                    ref={index === 0 ? projectsRef : undefined}
                    checked={draft.projectAccessMode === accessMode}
                    disabled={isBusy}
                    aria-describedby={
                      accessMode === 'AllProjects' && draft.projectAccessMode === 'AllProjects'
                        ? projectAccessHelperId
                        : undefined
                    }
                    aria-labelledby={`${titleId}-${accessMode}-label`}
                    name={`${titleId}-project-access`}
                    onChange={() => setProjectAccessMode(accessMode)}
                    type="radio"
                  />
                  <span className={styles.choiceCopy}>
                    <span id={`${titleId}-${accessMode}-label`}>
                      {t(`team_seatings.integrations.form.project_access.${accessMode}`)}
                    </span>
                    {accessMode === 'AllProjects' && draft.projectAccessMode === 'AllProjects' && (
                      <span className={styles.choiceHelper} id={projectAccessHelperId}>
                        {t('team_seatings.integrations.form.project_access.AllProjects.helper')}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {projectCatalogState === 'loading' && (
              <p className={styles.catalogStatus} id={projectCatalogStatusId} role="status">
                {t('team_seatings.integrations.form.project_catalog.loading')}
              </p>
            )}
            {projectCatalogState === 'error' && (
              <div className={styles.catalogState}>
                <p className={styles.error} id={projectCatalogStatusId} role="alert">
                  {t('team_seatings.integrations.form.project_catalog.error')}
                </p>
                {props.onRetryProjects && (
                  <Button
                    disabled={isRetryingProjects}
                    label={t('team_seatings.integrations.form.project_catalog.retry')}
                    loading={isRetryingProjects}
                    onClick={handleRetryProjects}
                    variant="outlined"
                  />
                )}
              </div>
            )}
            {draft.projectAccessMode === 'SelectedProjects' && (
              <MultiSearch
                className={styles.projectSearch}
                items={activeProjects.map(({ id, name }) => ({ label: name, value: id }))}
                label={t('team_seatings.integrations.form.project_choices')}
                name="search"
                value={draft.projectIds}
                onChange={(projectIds) => {
                  if (!isProjectCatalogReady) return;
                  updateDraft('projectIds', projectIds);
                  clearError('projects');
                }}
                placeholder={t('team_seatings.integrations.form.project_choices')}
                readOnly={isBusy || !isProjectCatalogReady}
              />
            )}
            {projectsError && (
              <p className={styles.error} id={projectsErrorId} role="alert">
                {projectsError}
              </p>
            )}
          </fieldset>

          {policyError && (
            <p className={styles.error} id={policyErrorId} role="alert">
              {t(`team_seatings.integrations.form.error.${policyError}`)}
            </p>
          )}

          <fieldset aria-describedby={expirationError ? expirationErrorId : undefined} className={styles.fieldset}>
            <legend>{t('team_seatings.integrations.form.expiration')}</legend>
            <div className={styles.choices}>
              {(['none', 'expires'] as const).map((expirationMode) => (
                <label className={styles.choice} data-disabled={isBusy ? 'true' : undefined} key={expirationMode}>
                  <input
                    checked={draft.expirationMode === expirationMode}
                    disabled={isBusy}
                    name={`${titleId}-expiration`}
                    onChange={() => {
                      updateDraft('expirationMode', expirationMode);
                      clearError('expiresAt');
                    }}
                    type="radio"
                  />
                  <span className={styles.choiceCopy}>
                    <span>{t(`team_seatings.integrations.form.expiration.${expirationMode}`)}</span>
                  </span>
                </label>
              ))}
            </div>
            {draft.expirationMode === 'expires' && (
              <div className={styles.dateField}>
                <label htmlFor={`${titleId}-expires-at`}>
                  {t('team_seatings.integrations.form.expiration.expires')}
                </label>
                <input
                  ref={expiresAtRef}
                  aria-label={t('team_seatings.integrations.form.expiration.datetime')}
                  aria-invalid={Boolean(expirationError)}
                  disabled={isBusy}
                  id={`${titleId}-expires-at`}
                  onChange={(event) => {
                    updateDraft('expiresAtLocal', event.target.value);
                    clearError('expiresAt');
                  }}
                  step="1"
                  type="datetime-local"
                  value={draft.expiresAtLocal}
                />
              </div>
            )}
            {expirationError && (
              <p className={styles.error} id={expirationErrorId} role="alert">
                {expirationError}
              </p>
            )}
          </fieldset>

          {statusError && (
            <p className={styles.error} id={formErrorId} role="alert">
              {t(`team_seatings.integrations.form.error.${statusError.key}`, {
                currentVersion: statusError.currentVersion,
              })}
            </p>
          )}
          {refreshError && (
            <p className={styles.error} id={refreshErrorId} role="alert">
              {t('team_seatings.integrations.form.error.refresh')}
            </p>
          )}
          {formError && (
            <p className={styles.error} id={formErrorId} role="alert">
              {formError}
            </p>
          )}

          <div className={styles.footer}>
            {statusError?.refreshable && props.onRefresh && (
              <Button
                disabled={isBusy}
                label={t('team_seatings.integrations.form.refresh')}
                loading={isRefreshing}
                onClick={handleRefresh}
                variant="outlined"
              />
            )}
            <Button disabled={isBusy} label={t('common.cancel')} onClick={close} variant="text" />
            <Button
              aria-describedby={
                [
                  formError || statusError ? formErrorId : null,
                  refreshError ? refreshErrorId : null,
                  isProjectCatalogBlockingSubmit ? projectCatalogStatusId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-label={isPending ? t(`team_seatings.integrations.form.submit.${mode}`) : undefined}
              disabled={isBusy || Boolean(statusError?.blocksSubmit) || isProjectCatalogBlockingSubmit}
              label={t(`team_seatings.integrations.form.submit.${mode}`)}
              loading={isPending}
              type="submit"
            />
          </div>
        </form>
      </Modal>

      <IntegrationClientConfirmationModal
        actions={[
          {
            label: t('team_seatings.integrations.form.confirm_all.confirm'),
            onClick: confirmProjectAccessExpansion,
          },
        ]}
        cancelLabel={t('common.cancel')}
        isOpen={isOpen && confirmAllOpen}
        onCancel={closeProjectAccessConfirmation}
        message={t('team_seatings.integrations.form.confirm_all.text')}
        title={t('team_seatings.integrations.form.confirm_all.title')}
      />
    </>
  );
};

export default IntegrationClientFormModal;
