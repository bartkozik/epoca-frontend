import { spawnSync } from 'child_process';
import { OAUTH_SCOPES } from '@/modules/integrationClients/models/integrationClientDto.model';
import type { IntegrationClient } from '@/modules/integrationClients/types';
import {
  buildCreateIntegrationClientInput,
  buildUpdateIntegrationClientInput,
  createIntegrationClientDraft,
  parseLocalDateTime,
  toLocalDateTimeInput,
  type IntegrationClientDraft,
} from './form';

const ACTOR = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Client owner',
};

const createClient = (overrides: Partial<IntegrationClient> = {}): IntegrationClient => ({
  clientId: 'client-1',
  name: 'Reporting app',
  status: 'Active',
  scopes: ['projects:read', 'reports:read'],
  projectAccess: {
    mode: 'SelectedProjects',
    projectIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
  },
  version: 7,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: ACTOR,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: ACTOR,
  modifiedAt: '2026-01-01T00:00:00Z',
  modifiedBy: ACTOR,
  secretRotatedAt: '2026-01-01T00:00:00Z',
  secretRotatedBy: ACTOR,
  expiresAt: '2026-12-01T10:15:00Z',
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
  ...overrides,
});

const NOW = new Date('2026-02-01T00:00:00Z');
const ACTIVE_PROJECT_IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

const validCreateDraft = (): IntegrationClientDraft => ({
  name: '  New reporting app  ',
  scopes: ['reports:export', 'projects:read', 'projects:read'],
  projectAccessMode: 'SelectedProjects',
  projectIds: [...ACTIVE_PROJECT_IDS, ACTIVE_PROJECT_IDS[0]],
  expirationMode: 'none',
  expiresAtLocal: '',
});

const runWarsawProbe = (body: string): unknown => {
  const probe = [
    "const path = require('path')",
    "process.env.NODE_PATH = path.join(process.cwd(), 'src')",
    "const Module = require('module')",
    'Module._initPaths()',
    'const resolveFilename = Module._resolveFilename',
    'Module._resolveFilename = function (request, ...rest) {',
    "  return resolveFilename.call(this, request.startsWith('@/') ? request.slice(2) : request, ...rest)",
    '}',
    "const babel = require('@babel/core')",
    "require.extensions['.ts'] = (module, filename) => {",
    '  const result = babel.transformFileSync(filename, {',
    "    presets: [require.resolve('@babel/preset-typescript')],",
    "    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],",
    '    babelrc: false,',
    '    configFile: false,',
    '  })',
    '  module._compile(result.code, filename)',
    '}',
    "const form = require('./src/modules/teamSettings/integrations/form.ts')",
    body,
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, BABEL_ENV: 'test', NODE_ENV: 'test', TZ: 'Europe/Warsaw' },
  });

  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  return JSON.parse(result.stdout.trim());
};

describe('browser-local expiry conversion', () => {
  it('calls the real parser in isolated Europe/Warsaw for non-UTC, DST-gap, and DST-fold proof', () => {
    expect(
      runWarsawProbe(
        "process.stdout.write(JSON.stringify({ winter: form.parseLocalDateTime('2026-01-15T12:34'), gap: form.parseLocalDateTime('2026-03-29T02:30'), fold: form.parseLocalDateTime('2026-10-25T02:30') }))",
      ),
    ).toEqual({
      winter: '2026-01-15T11:34:00.000Z',
      gap: null,
      fold: null,
    });
  });

  it('preserves an untouched later DST-fold instant but rejects a deliberate ambiguous local edit', () => {
    const body = [
      "const foldClient = { name: 'Fold client', status: 'Active', scopes: ['projects:read'], projectAccess: { mode: 'AllProjects' }, version: 7, expiresAt: '2026-10-25T01:30:00Z' }",
      "const ordinaryClient = { ...foldClient, expiresAt: '2026-12-01T10:15:00Z' }",
      'const foldDraft = form.createIntegrationClientDraft(foldClient)',
      "const unchanged = form.buildUpdateIntegrationClientInput('edit', { ...foldDraft, name: 'Renamed fold client' }, foldClient, [], new Date('2026-02-01T00:00:00Z'))",
      "const deliberate = form.buildUpdateIntegrationClientInput('edit', { ...form.createIntegrationClientDraft(ordinaryClient), expiresAtLocal: '2026-10-25T02:30:00' }, ordinaryClient, [], new Date('2026-02-01T00:00:00Z'))",
      'process.stdout.write(JSON.stringify({ rendered: foldDraft.expiresAtLocal, unchanged, deliberate }))',
    ].join('\n');

    expect(runWarsawProbe(body)).toEqual({
      rendered: '2026-10-25T02:30:00',
      unchanged: {
        ok: true,
        value: { expectedVersion: 7, name: 'Renamed fold client' },
      },
      deliberate: {
        ok: false,
        reason: 'validation',
        errors: { expiresAt: 'invalid' },
      },
    });
  });

  it.each(['2026-02-30T10:00', '2026-13-01T10:00', '2026-01-01T24:00', 'not-a-date'])(
    'rejects malformed or normalized calendar value %s',
    (value) => {
      expect(parseLocalDateTime(value)).toBeNull();
    },
  );

  it('round-trips public UTC timestamps through datetime-local without changing the instant', () => {
    const instant = '2026-12-01T10:15:00Z';
    expect(parseLocalDateTime(toLocalDateTimeInput(instant))).toBe(new Date(instant).toISOString());
  });
});

describe('create input builder', () => {
  it('requires an explicitly valid draft and emits stable, trimmed, deduplicated input', () => {
    expect(buildCreateIntegrationClientInput(validCreateDraft(), ACTIVE_PROJECT_IDS, NOW)).toEqual({
      ok: true,
      value: {
        name: 'New reporting app',
        scopes: ['projects:read', 'reports:export'],
        projectAccess: { mode: 'SelectedProjects', projectIds: ACTIVE_PROJECT_IDS },
        expiresAt: null,
      },
    });
  });

  it('accepts explicit no expiration for create', () => {
    const result = buildCreateIntegrationClientInput(
      { ...validCreateDraft(), projectAccessMode: 'AllProjects', projectIds: [] },
      ACTIVE_PROJECT_IDS,
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        name: 'New reporting app',
        scopes: ['projects:read', 'reports:export'],
        projectAccess: { mode: 'AllProjects' },
        expiresAt: null,
      },
    });
  });

  it('rejects blank name, unknown scopes, and no scopes', () => {
    const blank = buildCreateIntegrationClientInput({ ...validCreateDraft(), name: '   ' }, ACTIVE_PROJECT_IDS, NOW);
    const unknown = buildCreateIntegrationClientInput(
      { ...validCreateDraft(), scopes: ['projects:read', 'admin:write' as never] },
      ACTIVE_PROJECT_IDS,
      NOW,
    );
    const empty = buildCreateIntegrationClientInput({ ...validCreateDraft(), scopes: [] }, ACTIVE_PROJECT_IDS, NOW);

    expect(blank).toMatchObject({ ok: false, reason: 'validation', errors: { name: 'required' } });
    expect(unknown).toMatchObject({ ok: false, reason: 'validation', errors: { scopes: 'invalid' } });
    expect(empty).toMatchObject({ ok: false, reason: 'validation', errors: { scopes: 'required' } });
    expect(OAUTH_SCOPES).toHaveLength(8);
  });

  it('requires unique active project choices and never emits unknown or archived ids', () => {
    const unknownId = '99999999-9999-4999-8999-999999999999';
    const result = buildCreateIntegrationClientInput(
      { ...validCreateDraft(), projectIds: [ACTIVE_PROJECT_IDS[0], unknownId] },
      ACTIVE_PROJECT_IDS,
      NOW,
    );
    const empty = buildCreateIntegrationClientInput({ ...validCreateDraft(), projectIds: [] }, ACTIVE_PROJECT_IDS, NOW);

    expect(result).toMatchObject({ ok: false, reason: 'validation', errors: { projects: 'invalid' } });
    expect(JSON.stringify(result)).not.toContain(unknownId);
    expect(empty).toMatchObject({ ok: false, reason: 'validation', errors: { projects: 'required' } });
  });

  it('rejects malformed, equal, and past expiration but accepts a strictly future local value', () => {
    const localNow = toLocalDateTimeInput(NOW.toISOString());
    const malformed = buildCreateIntegrationClientInput(
      { ...validCreateDraft(), expirationMode: 'expires', expiresAtLocal: '2026-02-30T10:00' },
      ACTIVE_PROJECT_IDS,
      NOW,
    );
    const equal = buildCreateIntegrationClientInput(
      { ...validCreateDraft(), expirationMode: 'expires', expiresAtLocal: localNow },
      ACTIVE_PROJECT_IDS,
      NOW,
    );
    const futureLocal = toLocalDateTimeInput(new Date(NOW.getTime() + 60_000).toISOString());
    const future = buildCreateIntegrationClientInput(
      { ...validCreateDraft(), expirationMode: 'expires', expiresAtLocal: futureLocal },
      ACTIVE_PROJECT_IDS,
      NOW,
    );

    expect(malformed).toMatchObject({ ok: false, errors: { expiresAt: 'invalid' } });
    expect(equal).toMatchObject({ ok: false, errors: { expiresAt: 'future' } });
    expect(future.ok).toBe(true);
    if (!future.ok) throw new Error('unreachable');
    expect(future.value.expiresAt).toEqual(parseLocalDateTime(futureLocal));
  });
});

describe('update input builder', () => {
  it('creates an edit draft from public client data only', () => {
    expect(createIntegrationClientDraft(createClient())).toEqual({
      name: 'Reporting app',
      scopes: ['projects:read', 'reports:read'],
      projectAccessMode: 'SelectedProjects',
      projectIds: ACTIVE_PROJECT_IDS,
      expirationMode: 'expires',
      expiresAtLocal: toLocalDateTimeInput('2026-12-01T10:15:00Z'),
    });
  });

  it('filters hidden archived or unknown project ids when creating an edit draft', () => {
    const hiddenProjectId = '99999999-9999-4999-8999-999999999999';
    const client = createClient({
      projectAccess: { mode: 'SelectedProjects', projectIds: [ACTIVE_PROJECT_IDS[0], hiddenProjectId] },
    });

    expect(createIntegrationClientDraft(client, ACTIVE_PROJECT_IDS).projectIds).toEqual([ACTIVE_PROJECT_IDS[0]]);
  });

  it('emits an explicit project-policy repair when an unrelated edit removes a hidden selected id', () => {
    const hiddenProjectId = '99999999-9999-4999-8999-999999999999';
    const client = createClient({
      projectAccess: { mode: 'SelectedProjects', projectIds: [ACTIVE_PROJECT_IDS[0], hiddenProjectId] },
    });
    const draft = { ...createIntegrationClientDraft(client, ACTIVE_PROJECT_IDS), name: 'Updated reporting app' };

    expect(buildUpdateIntegrationClientInput('edit', draft, client, ACTIVE_PROJECT_IDS, NOW)).toEqual({
      ok: true,
      value: {
        expectedVersion: 7,
        name: 'Updated reporting app',
        projectAccess: { mode: 'SelectedProjects', projectIds: [ACTIVE_PROJECT_IDS[0]] },
      },
    });
  });

  it('requires a new active selection when every original selected project is hidden', () => {
    const client = createClient({
      projectAccess: {
        mode: 'SelectedProjects',
        projectIds: ['99999999-9999-4999-8999-999999999999'],
      },
    });
    const draft = { ...createIntegrationClientDraft(client, ACTIVE_PROJECT_IDS), name: 'Updated reporting app' };

    expect(draft.projectIds).toEqual([]);
    expect(buildUpdateIntegrationClientInput('edit', draft, client, ACTIVE_PROJECT_IDS, NOW)).toMatchObject({
      ok: false,
      reason: 'validation',
      errors: { projects: 'required' },
    });
  });

  it('omits semantically unchanged fields and reports a deliberate no-op', () => {
    const client = createClient();
    const draft: IntegrationClientDraft = {
      ...createIntegrationClientDraft(client),
      name: '  Reporting app ',
      scopes: ['reports:read', 'projects:read'],
      projectIds: [...ACTIVE_PROJECT_IDS].reverse(),
      expiresAtLocal: toLocalDateTimeInput('2026-12-01T10:15:00.000Z'),
    };

    expect(buildUpdateIntegrationClientInput('edit', draft, client, ACTIVE_PROJECT_IDS, NOW)).toEqual({
      ok: false,
      reason: 'no-changes',
      errors: { form: 'no-changes' },
    });
  });

  it('sends only changed fields plus expectedVersion and compares policy order-insensitively', () => {
    const client = createClient();
    const draft: IntegrationClientDraft = {
      ...createIntegrationClientDraft(client),
      name: '  Changed app ',
      scopes: ['reports:export', 'projects:read'],
      projectIds: [...ACTIVE_PROJECT_IDS].reverse(),
    };

    expect(buildUpdateIntegrationClientInput('edit', draft, client, ACTIVE_PROJECT_IDS, NOW)).toEqual({
      ok: true,
      value: {
        expectedVersion: 7,
        name: 'Changed app',
        scopes: ['projects:read', 'reports:export'],
      },
    });
  });

  it('emits explicit null when an edit changes from timestamp to no expiration', () => {
    const client = createClient();
    const draft = { ...createIntegrationClientDraft(client), expirationMode: 'none' as const };

    expect(buildUpdateIntegrationClientInput('edit', draft, client, ACTIVE_PROJECT_IDS, NOW)).toEqual({
      ok: true,
      value: { expectedVersion: 7, expiresAt: null },
    });
  });

  it('requires expired renew to choose a future timestamp or explicit no expiration', () => {
    const expired = createClient({ status: 'Expired', expiresAt: '2026-01-01T00:00:00Z' });
    const unchanged = buildUpdateIntegrationClientInput(
      'renew',
      createIntegrationClientDraft(expired),
      expired,
      ACTIVE_PROJECT_IDS,
      NOW,
    );
    const noExpiration = buildUpdateIntegrationClientInput(
      'renew',
      { ...createIntegrationClientDraft(expired), expirationMode: 'none' },
      expired,
      ACTIVE_PROJECT_IDS,
      NOW,
    );

    expect(unchanged).toMatchObject({ ok: false, reason: 'validation', errors: { expiresAt: 'future' } });
    expect(noExpiration).toEqual({ ok: true, value: { expectedVersion: 7, expiresAt: null } });
  });
});
