import type {
  CreateIntegrationClientInput,
  IntegrationClient,
  OAuthScope,
  UpdateIntegrationClientInput,
} from '@/modules/integrationClients/types';
import type { ZodIssue } from 'zod';
import {
  IntegrationClientDraftSchema,
  parseLocalDateTime,
  toLocalDateTimeInput,
} from './models/integrationClientDraft.model';

export { parseLocalDateTime, toLocalDateTimeInput };

export type IntegrationClientFormMode = 'create' | 'edit' | 'renew';
export type ProjectAccessMode = 'AllProjects' | 'SelectedProjects';
export type ExpirationMode = 'expires' | 'none';

export interface IntegrationClientDraft {
  name: string;
  scopes: OAuthScope[];
  projectAccessMode: ProjectAccessMode;
  projectIds: string[];
  expirationMode: ExpirationMode;
  expiresAtLocal: string;
}

export type IntegrationClientFormField = 'name' | 'scopes' | 'projects' | 'expiresAt' | 'form';
export type IntegrationClientFormErrorCode = 'required' | 'invalid' | 'future' | 'no-changes';
export type IntegrationClientFormErrors = Partial<Record<IntegrationClientFormField, IntegrationClientFormErrorCode>>;

export type IntegrationClientFormBuildResult<T> =
  { ok: true; value: T } | { ok: false; reason: 'validation' | 'no-changes'; errors: IntegrationClientFormErrors };

export const createIntegrationClientDraft = (
  client?: IntegrationClient,
  activeProjectIds?: readonly string[],
): IntegrationClientDraft => {
  if (!client) {
    return {
      name: '',
      scopes: [],
      projectAccessMode: 'AllProjects',
      projectIds: [],
      expirationMode: 'none',
      expiresAtLocal: '',
    };
  }

  return {
    name: client.name,
    scopes: [...client.scopes],
    projectAccessMode: client.projectAccess.mode,
    projectIds:
      client.projectAccess.mode === 'SelectedProjects'
        ? client.projectAccess.projectIds.filter(
            (projectId) => activeProjectIds === undefined || activeProjectIds.includes(projectId),
          )
        : [],
    expirationMode: client.expiresAt === null ? 'none' : 'expires',
    expiresAtLocal: client.expiresAt === null ? '' : toLocalDateTimeInput(client.expiresAt),
  };
};

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

const toFormErrors = (issues: ZodIssue[]): IntegrationClientFormErrors => {
  const errors: IntegrationClientFormErrors = {};
  issues.forEach((issue) => {
    const field = issue.path[0] as IntegrationClientFormField;
    const code = issue.message.split('.').pop() as IntegrationClientFormErrorCode;
    errors[field] = code;
  });
  return errors;
};

export const buildCreateIntegrationClientInput = (
  draft: IntegrationClientDraft,
  activeProjectIds: readonly string[],
  now: Date,
): IntegrationClientFormBuildResult<CreateIntegrationClientInput> => {
  const result = IntegrationClientDraftSchema(activeProjectIds, now).safeParse(draft);
  if (!result.success) return { ok: false, reason: 'validation', errors: toFormErrors(result.error.issues) };
  return { ok: true, value: result.data };
};

export const buildUpdateIntegrationClientInput = (
  mode: Exclude<IntegrationClientFormMode, 'create'>,
  draft: IntegrationClientDraft,
  client: IntegrationClient,
  activeProjectIds: readonly string[],
  now: Date,
): IntegrationClientFormBuildResult<UpdateIntegrationClientInput> => {
  const originalExpiresAtLocal = client.expiresAt === null ? '' : toLocalDateTimeInput(client.expiresAt);
  const preservedExpiresAt =
    client.expiresAt !== null &&
    originalExpiresAtLocal !== '' &&
    draft.expirationMode === 'expires' &&
    draft.expiresAtLocal === originalExpiresAtLocal
      ? client.expiresAt
      : undefined;
  const result = IntegrationClientDraftSchema(activeProjectIds, now, preservedExpiresAt).safeParse(draft);
  if (!result.success) return { ok: false, reason: 'validation', errors: toFormErrors(result.error.issues) };

  const { name, scopes, projectAccess, expiresAt } = result.data;
  const value: UpdateIntegrationClientInput = { expectedVersion: client.version };
  if (name !== client.name) value.name = name;
  if (!sameSet(scopes, client.scopes)) value.scopes = scopes;

  const projectAccessChanged =
    projectAccess.mode !== client.projectAccess.mode ||
    (projectAccess.mode === 'SelectedProjects' &&
      client.projectAccess.mode === 'SelectedProjects' &&
      !sameSet(projectAccess.projectIds, client.projectAccess.projectIds));
  if (projectAccessChanged) value.projectAccess = projectAccess;

  const originalExpirationTime = client.expiresAt === null ? null : new Date(client.expiresAt).getTime();
  const expirationTime = expiresAt === null ? null : new Date(expiresAt).getTime();
  const expirationChanged = originalExpirationTime !== expirationTime;
  if (expirationChanged || (mode === 'renew' && expiresAt === null)) value.expiresAt = expiresAt;

  if (Object.keys(value).length === 1) {
    return { ok: false, reason: 'no-changes', errors: { form: 'no-changes' } };
  }

  return { ok: true, value };
};
