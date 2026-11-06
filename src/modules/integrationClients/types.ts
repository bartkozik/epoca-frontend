import type { OAuthScope } from './models/integrationClientDto.model';

export type {
  IntegrationClient,
  IntegrationClientActor,
  IntegrationClientProjectAccess,
  IntegrationClientStatus,
  OAuthScope,
  OneTimeIntegrationClientSecret,
} from './models/integrationClientDto.model';
export type {
  IntegrationClientListParams,
  IntegrationClientPage,
  IntegrationClientPagination,
} from './models/integrationClientList.model';
export type { IntegrationClientAuditEvent, IntegrationClientAuditPage } from './models/integrationClientAudit.model';

export type IntegrationClientProjectAccessInput =
  { mode: 'AllProjects' } | { mode: 'SelectedProjects'; projectIds: readonly string[] };

export interface CreateIntegrationClientInput {
  name: string;
  scopes: readonly OAuthScope[];
  projectAccess: IntegrationClientProjectAccessInput;
  expiresAt?: string | null;
}

export interface UpdateIntegrationClientInput {
  expectedVersion: number;
  name?: string;
  scopes?: readonly OAuthScope[];
  projectAccess?: IntegrationClientProjectAccessInput;
  expiresAt?: string | null;
}

export type IntegrationClientProblem =
  | {
      kind:
        | 'invalid-expiration'
        | 'invalid-policy'
        | 'name-conflict'
        | 'not-active'
        | 'client-not-found'
        | 'forbidden'
        | 'service-unavailable'
        | 'unexpected';
      status: number | null;
    }
  | { kind: 'stale-version'; status: number; currentVersion: number | null }
  | { kind: 'timeout' | 'transport' | 'validation'; status: null };
