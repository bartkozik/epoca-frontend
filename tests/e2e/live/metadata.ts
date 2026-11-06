import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const LIVE_SCHEMA_VERSION = 2 as const;
export const LIVE_MANIFEST_PATH = path.resolve('test-results/.live-run.json');
export const LIVE_METADATA_PATH = path.resolve('test-results/live-run-metadata.json');
export const LOCAL_PROXY_METADATA_PATH = path.resolve('test-results/local-proxy-metadata.json');

export type LiveResourceKind = 'client' | 'project' | 'workUnit';

export interface LiveClientIntent {
  kind: 'client';
  intentId: string;
  marker: string;
  organizationId: string;
  name: string;
}

export interface LiveProjectIntent {
  kind: 'project';
  intentId: string;
  marker: string;
  organizationId: string;
  clientId: string;
  name: string;
  descriptionPrefix: string;
}

export interface LiveWorkUnitIntent {
  kind: 'workUnit';
  intentId: string;
  marker: string;
  organizationId: string;
  projectId: string;
  actorUserId: string;
  descriptionPrefix: string;
  idempotencyKey: string;
}

export type LiveMutationIntent = LiveClientIntent | LiveProjectIntent | LiveWorkUnitIntent;
export type LiveOwnershipEvidence = LiveMutationIntent & { id: string };
export type LiveQuarantineReason =
  'ambiguous' | 'archived-fixture' | 'cleanup-failed' | 'ownership-mismatch' | 'unknown';

export interface LiveQuarantinedObject {
  candidateId: string | null;
  intentId: string;
  kind: LiveResourceKind;
  reason: LiveQuarantineReason;
}

export interface LiveRunManifest {
  schemaVersion: typeof LIVE_SCHEMA_VERSION;
  runId: string;
  organizationId: string;
  organizationSlug: string;
  frontendOrigin: string;
  apiOrigin: string;
  apiBaseURL: string;
  frontendSha: string;
  backendSha: string;
  archivedUserId: string;
  archivedWorkUnitId: string;
  archivedUserName: string;
  historicalDescription: string;
  userId: string;
  projectName: string;
  updatedDescription: string;
  owned: {
    clientIds: string[];
    projectIds: string[];
    workUnitIds: string[];
  };
  ownership: LiveOwnershipEvidence[];
  intents: LiveMutationIntent[];
  quarantined: LiveQuarantinedObject[];
}

export interface LiveRunMetadata {
  schemaVersion: typeof LIVE_SCHEMA_VERSION;
  runId: string;
  frontendSha: string;
  backendSha: string;
}

export interface LocalProxyMetadata {
  schemaVersion: typeof LIVE_SCHEMA_VERSION;
  proxyOrigin: string;
  frontendSha: string;
  backendSha: string;
  status: 'pending' | 'passed' | 'failed';
}

const credentialKey = /(authorization|cookie|credential|email|password|refresh|secret|token)/i;

const assertRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} schema must be an object`);
  }
  return value as Record<string, unknown>;
};

const assertNoCredentialKeys = (value: unknown, pathLabel = 'artifact'): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCredentialKeys(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (credentialKey.test(key)) throw new Error(`${pathLabel} contains a credential-like key`);
    assertNoCredentialKeys(entry, `${pathLabel}.${key}`);
  }
};

const assertExactKeys = (record: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} schema contains missing or unexpected keys`);
  }
};

const requiredString = (record: Record<string, unknown>, key: string, label: string): string => {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} ${key.toLowerCase().includes('sha') ? 'SHA' : key} must be a non-empty string`);
  }
  return value;
};

const requiredStringArray = (record: Record<string, unknown>, key: string, label: string): string[] => {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new Error(`${label} ${key} must be an array of non-empty strings`);
  }
  return value.map((entry: unknown) => {
    if (typeof entry !== 'string') throw new Error(`${label} ${key} must contain strings`);
    return entry;
  });
};

const assertSchemaVersion = (record: Record<string, unknown>, label: string): void => {
  if (record.schemaVersion !== LIVE_SCHEMA_VERSION) throw new Error(`${label} schemaVersion is unsupported`);
};

const parseKind = (record: Record<string, unknown>, label: string): LiveResourceKind => {
  const kind = record.kind;
  if (kind !== 'client' && kind !== 'project' && kind !== 'workUnit') throw new Error(`${label} kind is invalid`);
  return kind;
};

const parseIntent = (value: unknown, label: string): LiveMutationIntent => {
  const record = assertRecord(value, label);
  const kind = parseKind(record, label);
  const common = {
    kind,
    intentId: requiredString(record, 'intentId', label),
    marker: requiredString(record, 'marker', label),
    organizationId: requiredString(record, 'organizationId', label),
  };
  if (kind === 'client') {
    assertExactKeys(record, ['kind', 'intentId', 'marker', 'organizationId', 'name'], label);
    return { ...common, kind, name: requiredString(record, 'name', label) };
  }
  if (kind === 'project') {
    assertExactKeys(
      record,
      ['kind', 'intentId', 'marker', 'organizationId', 'clientId', 'name', 'descriptionPrefix'],
      label,
    );
    return {
      ...common,
      kind,
      clientId: requiredString(record, 'clientId', label),
      name: requiredString(record, 'name', label),
      descriptionPrefix: requiredString(record, 'descriptionPrefix', label),
    };
  }
  assertExactKeys(
    record,
    ['kind', 'intentId', 'marker', 'organizationId', 'projectId', 'actorUserId', 'descriptionPrefix', 'idempotencyKey'],
    label,
  );
  return {
    ...common,
    kind,
    projectId: requiredString(record, 'projectId', label),
    actorUserId: requiredString(record, 'actorUserId', label),
    descriptionPrefix: requiredString(record, 'descriptionPrefix', label),
    idempotencyKey: requiredString(record, 'idempotencyKey', label),
  };
};

const parseEvidence = (value: unknown, label: string): LiveOwnershipEvidence => {
  const record = assertRecord(value, label);
  const { id, ...intentValue } = record;
  const intent = parseIntent(intentValue, `${label} intent`);
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${label} id must be a non-empty string`);
  return { ...intent, id };
};

const parseQuarantined = (value: unknown, label: string): LiveQuarantinedObject => {
  const record = assertRecord(value, label);
  assertExactKeys(record, ['candidateId', 'intentId', 'kind', 'reason'], label);
  const candidateId = record.candidateId;
  if (candidateId !== null && (typeof candidateId !== 'string' || !candidateId.trim())) {
    throw new Error(`${label} candidateId is invalid`);
  }
  const reason = record.reason;
  if (
    reason !== 'ambiguous' &&
    reason !== 'archived-fixture' &&
    reason !== 'cleanup-failed' &&
    reason !== 'ownership-mismatch' &&
    reason !== 'unknown'
  ) {
    throw new Error(`${label} reason is invalid`);
  }
  return {
    candidateId,
    intentId: requiredString(record, 'intentId', label),
    kind: parseKind(record, label),
    reason,
  };
};

const assertExactEvidence = (
  owned: LiveRunManifest['owned'],
  ownership: LiveOwnershipEvidence[],
  archivedWorkUnitId: string,
): void => {
  const expected = {
    clientIds: ownership.filter(({ kind }) => kind === 'client').map(({ id }) => id),
    projectIds: ownership.filter(({ kind }) => kind === 'project').map(({ id }) => id),
    workUnitIds: ownership.filter(({ kind }) => kind === 'workUnit').map(({ id }) => id),
  };
  for (const key of ['clientIds', 'projectIds', 'workUnitIds'] as const) {
    const actual = owned[key];
    if (new Set(actual).size !== actual.length || actual.length !== expected[key].length) {
      throw new Error('Private manifest owned IDs require exact ownership evidence');
    }
    if (actual.some((id) => !expected[key].includes(id))) {
      throw new Error('Private manifest owned IDs require exact ownership evidence');
    }
  }
  if (owned.workUnitIds.includes(archivedWorkUnitId)) {
    throw new Error('Private manifest cannot own the archived fixture work unit');
  }
};

export const parseLiveRunManifest = (value: unknown): LiveRunManifest => {
  assertNoCredentialKeys(value, 'private manifest');
  const record = assertRecord(value, 'Private manifest');
  assertExactKeys(
    record,
    [
      'schemaVersion',
      'runId',
      'organizationId',
      'organizationSlug',
      'frontendOrigin',
      'apiOrigin',
      'apiBaseURL',
      'frontendSha',
      'backendSha',
      'archivedUserId',
      'archivedWorkUnitId',
      'archivedUserName',
      'historicalDescription',
      'userId',
      'projectName',
      'updatedDescription',
      'owned',
      'ownership',
      'intents',
      'quarantined',
    ],
    'Private manifest',
  );
  assertSchemaVersion(record, 'Private manifest');
  const owned = assertRecord(record.owned, 'Private manifest owned IDs');
  assertExactKeys(owned, ['clientIds', 'projectIds', 'workUnitIds'], 'Private manifest owned IDs');

  const runId = requiredString(record, 'runId', 'Private manifest');
  const organizationId = requiredString(record, 'organizationId', 'Private manifest');
  const archivedWorkUnitId = requiredString(record, 'archivedWorkUnitId', 'Private manifest');
  if (!Array.isArray(record.ownership) || !Array.isArray(record.intents) || !Array.isArray(record.quarantined)) {
    throw new Error('Private manifest lifecycle collections must be arrays');
  }
  const ownership = record.ownership.map((entry, index) => parseEvidence(entry, `Ownership evidence ${index}`));
  const intents = record.intents.map((entry, index) => parseIntent(entry, `Mutation intent ${index}`));
  const quarantined = record.quarantined.map((entry, index) => parseQuarantined(entry, `Quarantined object ${index}`));
  const lifecycleIntentIds = [...ownership, ...intents].map(({ intentId }) => intentId);
  if (new Set(lifecycleIntentIds).size !== lifecycleIntentIds.length) {
    throw new Error('Private manifest mutation intent identities must be unique');
  }
  const knownIntentIds = new Set(lifecycleIntentIds);
  if (quarantined.some(({ intentId }) => !knownIntentIds.has(intentId))) {
    throw new Error('Private manifest quarantine entry has no lifecycle intent');
  }
  const marker = `E2E ${runId}`;
  if ([...ownership, ...intents].some((entry) => entry.marker !== marker || entry.organizationId !== organizationId)) {
    throw new Error('Private manifest lifecycle evidence has a wrong run marker or organization');
  }
  const parsedOwned = {
    clientIds: requiredStringArray(owned, 'clientIds', 'Private manifest owned IDs'),
    projectIds: requiredStringArray(owned, 'projectIds', 'Private manifest owned IDs'),
    workUnitIds: requiredStringArray(owned, 'workUnitIds', 'Private manifest owned IDs'),
  };
  assertExactEvidence(parsedOwned, ownership, archivedWorkUnitId);

  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    runId,
    organizationId,
    organizationSlug: requiredString(record, 'organizationSlug', 'Private manifest'),
    frontendOrigin: requiredString(record, 'frontendOrigin', 'Private manifest'),
    apiOrigin: requiredString(record, 'apiOrigin', 'Private manifest'),
    apiBaseURL: requiredString(record, 'apiBaseURL', 'Private manifest'),
    frontendSha: requiredString(record, 'frontendSha', 'Private manifest'),
    backendSha: requiredString(record, 'backendSha', 'Private manifest'),
    archivedUserId: requiredString(record, 'archivedUserId', 'Private manifest'),
    archivedWorkUnitId,
    archivedUserName: requiredString(record, 'archivedUserName', 'Private manifest'),
    historicalDescription: requiredString(record, 'historicalDescription', 'Private manifest'),
    userId: requiredString(record, 'userId', 'Private manifest'),
    projectName: requiredString(record, 'projectName', 'Private manifest'),
    updatedDescription: requiredString(record, 'updatedDescription', 'Private manifest'),
    owned: parsedOwned,
    ownership,
    intents,
    quarantined,
  };
};

export const parseLiveRunMetadata = (value: unknown): LiveRunMetadata => {
  assertNoCredentialKeys(value, 'live metadata');
  const record = assertRecord(value, 'Live metadata');
  assertExactKeys(record, ['schemaVersion', 'runId', 'frontendSha', 'backendSha'], 'Live metadata');
  assertSchemaVersion(record, 'Live metadata');
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    runId: requiredString(record, 'runId', 'Live metadata'),
    frontendSha: requiredString(record, 'frontendSha', 'Live metadata'),
    backendSha: requiredString(record, 'backendSha', 'Live metadata'),
  };
};

export const parseLocalProxyMetadata = (value: unknown): LocalProxyMetadata => {
  assertNoCredentialKeys(value, 'local-proxy metadata');
  const record = assertRecord(value, 'Local-proxy metadata');
  assertExactKeys(
    record,
    ['schemaVersion', 'proxyOrigin', 'frontendSha', 'backendSha', 'status'],
    'Local-proxy metadata',
  );
  assertSchemaVersion(record, 'Local-proxy metadata');
  const status = record.status;
  if (status !== 'pending' && status !== 'passed' && status !== 'failed') {
    throw new Error('Local-proxy metadata status is invalid');
  }
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    proxyOrigin: requiredString(record, 'proxyOrigin', 'Local-proxy metadata'),
    frontendSha: requiredString(record, 'frontendSha', 'Local-proxy metadata'),
    backendSha: requiredString(record, 'backendSha', 'Local-proxy metadata'),
    status,
  };
};

export const serializeLiveRunManifest = (manifest: LiveRunManifest): string =>
  `${JSON.stringify(parseLiveRunManifest(manifest), null, 2)}\n`;

const writeJsonAtomically = async (filePath: string, value: unknown, mode: number): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
  await rename(temporaryPath, filePath);
};

export const readLiveRunManifest = async (filePath = LIVE_MANIFEST_PATH): Promise<LiveRunManifest> =>
  parseLiveRunManifest(JSON.parse(await readFile(filePath, 'utf8')));

export const writeLiveRunManifest = async (manifest: LiveRunManifest, filePath = LIVE_MANIFEST_PATH): Promise<void> =>
  writeJsonAtomically(filePath, parseLiveRunManifest(manifest), 0o600);

export const writeLiveRunMetadata = async (metadata: LiveRunMetadata, filePath = LIVE_METADATA_PATH): Promise<void> =>
  writeJsonAtomically(filePath, parseLiveRunMetadata(metadata), 0o644);

export const writeLocalProxyMetadata = async (
  metadata: LocalProxyMetadata,
  filePath = LOCAL_PROXY_METADATA_PATH,
): Promise<void> => writeJsonAtomically(filePath, parseLocalProxyMetadata(metadata), 0o644);

export const writeLocalProxyMetadataSync = (
  metadata: LocalProxyMetadata,
  filePath = LOCAL_PROXY_METADATA_PATH,
): void => {
  const parsed = parseLocalProxyMetadata(metadata);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  renameSync(temporaryPath, filePath);
};
