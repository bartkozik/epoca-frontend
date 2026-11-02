export type WorldName = 'world-1' | 'world-2' | 'world-3' | 'world-4' | 'world-5' | 'world-6';
export type ActorName = 'anonymous' | 'owner' | 'manager' | 'pm' | 'user';
export type OrganizationRole = 'Owner' | 'Manager' | 'Employee' | 'External';
export type ProjectRole = 'Owner' | 'Member';

export interface WorldActor {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationRoles: OrganizationRole[];
  projectRoles: Readonly<Record<string, ProjectRole>>;
  archived: boolean;
}

export interface WorldUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationRoles: OrganizationRole[];
  archived: boolean;
  avatar?: string;
  identities: ReadonlyArray<{
    id: string;
    type: 'MailAddress';
    value: string;
    main: boolean;
  }>;
}

export interface WorldClient {
  id: string;
  name: string;
  type: 'Internal' | 'External';
  archivedAt: string | null;
  texture?: string;
  color?: string;
  logo?: string;
}

export interface WorldProject {
  id: string;
  clientId: string;
  name: string;
  description: string;
  archivedAt: string | null;
  ownerIds: string[];
  memberIds: string[];
}

export interface WorldWorkUnit {
  id: string;
  userId: string;
  projectId: string;
  entryType: 'Worklog' | 'Note';
  date: string;
  duration: string;
  description: string;
  taskId: string | null;
  state: 'Active' | 'Archived' | 'Draft';
  createdAt: string;
  modifiedAt: string;
}

export interface WorldIntegrationActor {
  userId: string;
  displayName: string;
}

export interface WorldIntegrationClient {
  clientId: string;
  name: string;
  status: 'Active' | 'Expired' | 'Revoked';
  scopes: Array<
    | 'organization:read'
    | 'users:read'
    | 'clients:read'
    | 'projects:read'
    | 'work-units:read'
    | 'work-units:write'
    | 'reports:read'
    | 'reports:export'
  >;
  projectAccess: { mode: 'AllProjects' } | { mode: 'SelectedProjects'; projectIds: string[] };
  version: number;
  policyVersion: number;
  secretVersion: number;
  serviceAccount: WorldIntegrationActor;
  createdAt: string;
  createdBy: WorldIntegrationActor;
  modifiedAt: string;
  modifiedBy: WorldIntegrationActor;
  secretRotatedAt: string;
  secretRotatedBy: WorldIntegrationActor;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: WorldIntegrationActor | null;
  lastUsedAt: string | null;
}

export interface WorldIntegrationAuditEvent {
  /** Private fixture association used only by the mock handler; never returned by the API. */
  clientId: string;
  id: string;
  occurredAt: string;
  actorType: 'Human' | 'ServiceAccount' | 'Anonymous' | 'System';
  actorUserId: string | null;
  actor: WorldIntegrationActor | null;
  eventType: 'Create' | 'Update' | 'Rotate' | 'Revoke' | 'TokenIssued' | 'InvalidClient' | 'InvalidScope' | 'RateLimit';
  outcome: 'Success' | 'Failure';
  metadata: Record<string, unknown>;
}

export interface WorldOAuthIntegration {
  clients: WorldIntegrationClient[];
  auditEvents: WorldIntegrationAuditEvent[];
  staleVersion: {
    clientId: string;
    attemptedVersion: number;
    currentVersion: number;
  };
}

export interface WorldFailure {
  key:
    | 'network-drop'
    | 'conflict'
    | 'expired-result'
    | 'unsupported-fingerprint'
    | 'oauth-bad-request'
    | 'oauth-conflict'
    | 'oauth-forbidden'
    | 'oauth-server-error'
    | 'oauth-timeout';
  method: 'GET' | 'POST' | 'PATCH';
  status: 0 | 400 | 403 | 409 | 410 | 500;
  errorType: string;
}

export interface WorldDefinition {
  name: WorldName;
  parent: WorldName | null;
  clock: string;
  locale: 'pl-PL';
  timeZone: 'Europe/Warsaw';
  organization: { id: string; slug: string; name: string } | null;
  actors: Partial<Record<ActorName, WorldActor>>;
  users: WorldUser[];
  clients: WorldClient[];
  projects: WorldProject[];
  workUnits: WorldWorkUnit[];
  oauthIntegration?: WorldOAuthIntegration;
  failures: WorldFailure[];
  capabilities: string[];
}

export interface BuiltWorld extends Readonly<WorldDefinition> {
  allIds: readonly string[];
}
