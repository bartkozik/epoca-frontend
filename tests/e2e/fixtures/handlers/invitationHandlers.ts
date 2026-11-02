import { randomUUID } from 'node:crypto';
import { INVITATION_PROBLEM_PREFIX } from '../../../../src/core/models/invitationProblem';
import type { InvitationSummary } from '../../../../src/modules/auth/models/invitationAccess.model';
import { InvitationCreateSchema } from '../../../../src/modules/teamSettings/members/invitations/models/invitationCreate.model';
import type { InvitationDto } from '../../../../src/modules/teamSettings/members/invitations/models/invitationDto.model';
import type { WorldRuntime } from '../../worlds/runtime';
import { createActorToken, isOwnerActor } from '../auth';
import type { MockHandler, MockRequest, MockResponse } from './types';

type Stored = {
  dto: InvitationDto;
  generation: number;
  token: string;
  action: InvitationSummary['nextAction'];
  sso: boolean;
  deliveryOutcome: 'Sent' | 'Failed';
  deliveryCompletesAt: number;
  retryAllowedAt: number;
};
type InvitationDeliveryOptions = {
  delayMs: number;
  cooldownSeconds: number;
};
type Fixture = {
  rows: Map<string, Stored>;
  receipts: Map<string, { body: string; dto: InvitationDto }>;
  context?: { id: string; generation: number; expires: number };
  delivery: 'Sent' | 'Failed';
  deliveryOptions: InvitationDeliveryOptions;
};
const INVITATION_TTL_MS = 7 * 86400_000;
const fixtures = new WeakMap<WorldRuntime, Fixture>();
const state = (runtime: WorldRuntime): Fixture => {
  let fixture = fixtures.get(runtime);
  if (!fixture) {
    fixture = {
      rows: new Map(),
      receipts: new Map(),
      delivery: 'Sent',
      deliveryOptions: { delayMs: 0, cooldownSeconds: 0 },
    };
    fixtures.set(runtime, fixture);
  }
  return fixture;
};
const now = (runtime: WorldRuntime): number => Date.parse(runtime.state.clock);
const problem = (status: number, code: string): MockResponse => ({
  status,
  json: { type: `${INVITATION_PROBLEM_PREFIX}${code}` },
});
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const status = (stored: Stored, runtime: WorldRuntime): string =>
  stored.dto.status === 'Pending' && Date.parse(stored.dto.expiresAt!) <= now(runtime) ? 'Expired' : stored.dto.status;
const dto = (stored: Stored, runtime: WorldRuntime): InvitationDto => ({
  ...stored.dto,
  status: status(stored, runtime),
  delivery: {
    ...stored.dto.delivery,
    status: now(runtime) < stored.deliveryCompletesAt ? 'Started' : stored.deliveryOutcome,
    retryAfterSeconds: Math.max(0, Math.ceil((stored.retryAllowedAt - now(runtime)) / 1000)),
  },
});
const create = (runtime: WorldRuntime, body: unknown): Stored | null => {
  const parsed = InvitationCreateSchema.safeParse(body);
  if (!parsed.success) return null;
  const input = parsed.data;
  const at = new Date(now(runtime)).toISOString();
  const stored: Stored = {
    generation: 1,
    token: `mock-invitation-${randomUUID()}`,
    action: 'CreateAccount',
    sso: false,
    deliveryOutcome: state(runtime).delivery,
    deliveryCompletesAt: now(runtime) + state(runtime).deliveryOptions.delayMs,
    retryAllowedAt: now(runtime) + state(runtime).deliveryOptions.cooldownSeconds * 1000,
    dto: {
      id: randomUUID(),
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      roles: [input.role],
      protocolVersion: 2,
      revision: '0',
      status: 'Pending',
      expiresAt: new Date(now(runtime) + INVITATION_TTL_MS).toISOString(),
      delivery: { status: state(runtime).delivery, lastAttemptAt: at, retryAfterSeconds: 0 },
      createdAt: at,
      modifiedAt: at,
    },
  };
  state(runtime).rows.set(stored.dto.id, stored);
  return stored;
};
export const configureInvitationDelivery = (
  runtime: WorldRuntime,
  delivery: Fixture['delivery'],
  options: InvitationDeliveryOptions = { delayMs: 0, cooldownSeconds: 0 },
): void => {
  state(runtime).delivery = delivery;
  state(runtime).deliveryOptions = options;
};
export const invitationFixtureRows = (runtime: WorldRuntime): InvitationDto[] =>
  [...state(runtime).rows.values()].map((row) => dto(row, runtime));
export const seedInvitationRecipient = (
  runtime: WorldRuntime,
  action: InvitationSummary['nextAction'] = 'CreateAccount',
  sso = false,
  email = 'anna@example.test',
): { id: string; token: string } => {
  const row = create(runtime, {
    firstName: 'Anna',
    lastName: 'Invited',
    email,
    role: 'Employee',
    locale: 'pl',
  })!;
  row.action = action;
  row.sso = sso;
  return { id: row.dto.id, token: row.token };
};
export const changeInvitationRecipient = (
  runtime: WorldRuntime,
  id: string,
  action: InvitationSummary['nextAction'],
): void => {
  const row = state(runtime).rows.get(id);
  if (!row) throw new Error('Missing invitation fixture');
  row.action = action;
};
const summary = (row: Stored, organization: NonNullable<WorldRuntime['state']['organization']>): InvitationSummary => ({
  organization: { name: organization.name, slug: organization.slug },
  email: row.dto.email,
  firstName: row.dto.firstName,
  lastName: row.dto.lastName,
  roles: row.dto.roles,
  revision: row.dto.revision,
  expiresAt: row.dto.expiresAt!,
  csrfToken: 'mock-invitation-csrf',
  nextAction: row.action,
  ssoEnabled: row.sso,
});
const context = (runtime: WorldRuntime): Stored | undefined => {
  const fixture = state(runtime);
  const current = fixture.context;
  const row = current && fixture.rows.get(current.id);
  return row &&
    current &&
    current.expires > now(runtime) &&
    row.generation === current.generation &&
    status(row, runtime) === 'Pending'
    ? row
    : undefined;
};
const handleList = (runtime: WorldRuntime, id: string | undefined): MockResponse => {
  const fixture = state(runtime);
  if (id) {
    const row = fixture.rows.get(id);
    return row ? { status: 200, json: dto(row, runtime) } : problem(404, 'not-found');
  }
  return {
    status: 200,
    json: {
      count: fixture.rows.size,
      results: invitationFixtureRows(runtime),
      featureEnabled: true,
    },
  };
};
const handleCreate = (runtime: WorldRuntime, body: Record<string, unknown>, receiptKey: string): MockResponse => {
  const fixture = state(runtime);
  const fingerprint = JSON.stringify(body);
  if (
    [...fixture.rows.values()].some(
      (value) => value.dto.email === body.email && ['Pending', 'Expired'].includes(status(value, runtime)),
    )
  )
    return problem(409, 'already-exists');
  const added = create(runtime, body);
  if (!added) return problem(400, 'invalid-request');
  const created = dto(added, runtime);
  fixture.receipts.set(receiptKey, { body: fingerprint, dto: structuredClone(created) });
  return { status: 201, json: created };
};
const handleCancel = (row: Stored): MockResponse => {
  row.dto.status = 'Cancelled';
  row.dto.revision = String(Number(row.dto.revision) + 1);
  return { status: 204 };
};
const handleUpdate = (
  runtime: WorldRuntime,
  row: Stored,
  body: Record<string, unknown>,
  resending: boolean,
  receiptKey: string,
): MockResponse => {
  const fixture = state(runtime);
  const fingerprint = JSON.stringify(body);
  const parsed = InvitationCreateSchema.safeParse({
    firstName: row.dto.firstName,
    lastName: row.dto.lastName,
    email: row.dto.email,
    role: row.dto.roles[0],
    locale: 'pl',
    ...Object.fromEntries(Object.entries(body).filter(([name]) => name !== 'expectedRevision')),
  });
  if (!parsed.success) return problem(400, 'invalid-request');
  row.dto = {
    ...row.dto,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    roles: [parsed.data.role],
    revision: String(Number(row.dto.revision) + 1),
    modifiedAt: new Date(now(runtime)).toISOString(),
  };
  if (resending) {
    row.deliveryOutcome = fixture.delivery;
    row.deliveryCompletesAt = now(runtime) + fixture.deliveryOptions.delayMs;
    row.retryAllowedAt = now(runtime) + fixture.deliveryOptions.cooldownSeconds * 1000;
    row.generation++;
    row.token = `mock-invitation-${randomUUID()}`;
    row.dto.expiresAt = new Date(now(runtime) + INVITATION_TTL_MS).toISOString();
    row.dto.delivery = { status: fixture.delivery, lastAttemptAt: row.dto.modifiedAt, retryAfterSeconds: 0 };
    fixture.receipts.set(receiptKey, { body: fingerprint, dto: structuredClone(dto(row, runtime)) });
  }
  return { status: 200, json: dto(row, runtime) };
};
const management = (request: MockRequest, runtime: WorldRuntime): MockResponse => {
  const organization = runtime.state.organization;
  if (!isOwnerActor(runtime) || !organization || request.path.split('/')[2] !== encodeURIComponent(organization.slug))
    return problem(404, 'not-found');
  if (request.query.version?.[0] !== '2') return problem(400, 'invalid-request');
  const fixture = state(runtime);
  const id = request.path.split('/')[4];
  if (request.method === 'GET') return handleList(runtime, id);
  const body = object(request.body);
  const key = request.headers['idempotency-key'];
  const receiptKey = `${request.path}:${key}`;
  // Replayed commands must succeed even when the original command advanced the revision.
  if (request.method === 'POST') {
    if (!key) return problem(400, 'invalid-request');
    const previous = fixture.receipts.get(receiptKey);
    if (previous)
      return previous.body === JSON.stringify(body)
        ? { status: 200, json: previous.dto }
        : problem(409, 'idempotency-conflict');
  }
  if (!id) return handleCreate(runtime, body, receiptKey);
  const row = fixture.rows.get(id);
  if (!row) return problem(404, 'not-found');
  if (!['Pending', 'Expired'].includes(status(row, runtime))) return problem(409, 'not-pending');
  const revision = request.method === 'DELETE' ? request.query.expectedRevision?.[0] : body.expectedRevision;
  if (revision !== row.dto.revision) return problem(409, 'revision-conflict');
  const resending = request.path.endsWith('/resend');
  if (resending && now(runtime) < row.retryAllowedAt) {
    return {
      ...problem(429, 'rate-limited'),
      headers: { 'Retry-After': String(dto(row, runtime).delivery.retryAfterSeconds) },
    };
  }
  return request.method === 'DELETE' ? handleCancel(row) : handleUpdate(runtime, row, body, resending, receiptKey);
};
const access = (request: MockRequest, runtime: WorldRuntime): MockResponse => {
  const organization = runtime.state.organization;
  if (!organization) return problem(404, 'invalid-invitation');
  const body = object(request.body);
  if (request.path.endsWith('/exchange')) {
    const row = [...state(runtime).rows.values()].find((value) => value.token === body.token);
    if (!row || status(row, runtime) !== 'Pending') return problem(404, 'invalid-invitation');
    state(runtime).context = { id: row.dto.id, generation: row.generation, expires: now(runtime) + 900_000 };
    return {
      status: 200,
      json: summary(row, organization),
      headers: { 'Set-Cookie': 'invitation-access=mock-context; HttpOnly; Path=/__e2e_api; SameSite=Lax' },
    };
  }
  const row = context(runtime);
  if (!row) return problem(404, 'invalid-invitation');
  if (
    row.action === 'SignIn' &&
    runtime.actor !== 'anonymous' &&
    runtime.state.actors[runtime.actor]?.email === row.dto.email
  )
    row.action = 'Accept';
  if (request.method === 'GET') return { status: 200, json: summary(row, organization) };
  if (request.headers['x-csrf-token'] !== 'mock-invitation-csrf') return problem(403, 'forbidden');
  if (request.path.endsWith('/saml'))
    return { status: 200, json: { samlRequest: 'mock-saml-request', ssoUrl: 'http://127.0.0.1:5173/mock-idp' } };
  if (body.expectedRevision !== row.dto.revision) return problem(409, 'revision-conflict');
  if (row.action === 'SignIn' || row.action === 'VerifyLegacySso') return problem(401, 'sign-in-required');
  if (row.action === 'CreateAccount' && typeof body.password !== 'string') return problem(400, 'invalid-request');
  row.dto.status = 'Accepted';
  return {
    status: 200,
    json: {
      organizationSlug: organization.slug,
      accessToken: createActorToken(runtime.state, 'owner'),
      refreshToken: 'e2e-refresh-token',
    },
  };
};
export const invitationHandlers: MockHandler[] = [
  ...(['GET', 'POST', 'PATCH', 'DELETE'] as const).map((method) => ({
    id: `invitation-management-${method}`,
    method,
    path: /^\/organizations\/[^/]+\/invitations(?:\/[^/]+(?:\/resend)?)?$/,
    handle: management,
  })),
  ...(['GET', 'POST'] as const).map((method) => ({
    id: `invitation-access-${method}`,
    method,
    path: /^\/invitation-access(?:\/(?:exchange|password|accept|saml))?$/,
    handle: access,
  })),
];
