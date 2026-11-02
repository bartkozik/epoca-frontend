import { constants, readFileSync } from 'node:fs';
import { access, link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertManifestOwnership, type LiveTarget } from './guard';
import {
  LIVE_MANIFEST_PATH,
  LIVE_SCHEMA_VERSION,
  parseLiveRunManifest,
  serializeLiveRunManifest,
  writeLiveRunManifest,
  type LiveRunManifest,
} from './metadata';

export const LIVE_LOCK_PATH = path.resolve('test-results/.live-run.lock');

export interface LiveRunIdentity {
  schemaVersion: typeof LIVE_SCHEMA_VERSION;
  runId: string;
  organizationId: string;
  frontendOrigin: string;
  apiOrigin: string;
}

interface LiveRunStatePaths {
  lockPath?: string;
  manifestPath?: string;
}

const identityKeys = ['schemaVersion', 'runId', 'organizationId', 'frontendOrigin', 'apiOrigin'] as const;

const parseIdentity = (value: unknown): LiveRunIdentity => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Live run lock identity is malformed');
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...identityKeys].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('Live run lock identity is malformed');
  }
  if (record.schemaVersion !== LIVE_SCHEMA_VERSION) throw new Error('Live run lock identity is unsupported');
  for (const key of identityKeys.slice(1)) {
    if (typeof record[key] !== 'string' || !record[key].trim()) {
      throw new Error('Live run lock identity is malformed');
    }
  }
  return record as unknown as LiveRunIdentity;
};

const sameIdentity = (left: LiveRunIdentity, right: LiveRunIdentity): boolean =>
  identityKeys.every((key) => left[key] === right[key]);

const assertIdentity = (expected: LiveRunIdentity, actual: LiveRunIdentity, label: string): void => {
  if (!sameIdentity(expected, actual)) throw new Error(`${label} identity does not match the active live run`);
};

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

export const liveRunIdentity = (manifest: LiveRunManifest): LiveRunIdentity => ({
  schemaVersion: manifest.schemaVersion,
  runId: manifest.runId,
  organizationId: manifest.organizationId,
  frontendOrigin: manifest.frontendOrigin,
  apiOrigin: manifest.apiOrigin,
});

export const assertNoExistingLiveRunState = async ({
  lockPath = LIVE_LOCK_PATH,
  manifestPath = LIVE_MANIFEST_PATH,
}: LiveRunStatePaths = {}): Promise<void> => {
  if (await pathExists(manifestPath)) {
    throw new Error(`Refusing to overwrite existing manifest at ${manifestPath}`);
  }
  if (await pathExists(lockPath)) throw new Error(`Refusing to overwrite existing live run lock at ${lockPath}`);
};

export const acquireLiveRunLock = async (identity: LiveRunIdentity, lockPath = LIVE_LOCK_PATH): Promise<void> => {
  const parsed = parseIdentity(identity);
  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Live run lock already exists at ${lockPath}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
};

const readLockIdentity = async (lockPath: string): Promise<LiveRunIdentity> => {
  try {
    return parseIdentity(JSON.parse(await readFile(lockPath, 'utf8')));
  } catch (error) {
    throw new Error(
      `Live run lock identity cannot be trusted: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
};

const readLockIdentitySync = (lockPath: string): LiveRunIdentity => {
  try {
    return parseIdentity(JSON.parse(readFileSync(lockPath, 'utf8')));
  } catch (error) {
    throw new Error(
      `Live run lock identity cannot be trusted: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
};

export const readActiveLiveRunIdentity = async (lockPath = LIVE_LOCK_PATH): Promise<LiveRunIdentity> =>
  readLockIdentity(lockPath);

export const readActiveLiveRunIdentitySync = (lockPath = LIVE_LOCK_PATH): LiveRunIdentity =>
  readLockIdentitySync(lockPath);

export const releaseLiveRunLock = async (identity: LiveRunIdentity, lockPath = LIVE_LOCK_PATH): Promise<void> => {
  const expected = parseIdentity(identity);
  assertIdentity(expected, await readLockIdentity(lockPath), 'Live run lock');
  await unlink(lockPath);
};

export const writeLiveRunManifestExclusive = async (
  manifest: LiveRunManifest,
  manifestPath = LIVE_MANIFEST_PATH
): Promise<void> => {
  const serialized = serializeLiveRunManifest(manifest);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporaryPath, manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Refusing to overwrite existing manifest at ${manifestPath}`);
    }
    throw error;
  } finally {
    await handle?.close();
    await unlink(temporaryPath).catch(() => undefined);
  }
};

export const readBoundLiveRunManifest = async (
  identity: LiveRunIdentity,
  target: LiveTarget,
  { lockPath = LIVE_LOCK_PATH, manifestPath = LIVE_MANIFEST_PATH }: LiveRunStatePaths = {}
): Promise<LiveRunManifest> => {
  const expected = parseIdentity(identity);
  assertIdentity(expected, await readLockIdentity(lockPath), 'Live run lock');
  const manifest = parseLiveRunManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  assertIdentity(expected, liveRunIdentity(manifest), 'Live run manifest');
  assertManifestOwnership(manifest, target);
  return manifest;
};

export const readBoundLiveRunManifestSync = (
  identity: LiveRunIdentity,
  target: LiveTarget,
  { lockPath = LIVE_LOCK_PATH, manifestPath = LIVE_MANIFEST_PATH }: LiveRunStatePaths = {}
): LiveRunManifest => {
  const expected = parseIdentity(identity);
  assertIdentity(expected, readLockIdentitySync(lockPath), 'Live run lock');
  const manifest = parseLiveRunManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  assertIdentity(expected, liveRunIdentity(manifest), 'Live run manifest');
  assertManifestOwnership(manifest, target);
  return manifest;
};

export const writeBoundLiveRunManifest = async (
  identity: LiveRunIdentity,
  target: LiveTarget,
  manifest: LiveRunManifest,
  paths: LiveRunStatePaths = {}
): Promise<void> => {
  const expected = parseIdentity(identity);
  await readBoundLiveRunManifest(expected, target, paths);
  assertIdentity(expected, liveRunIdentity(manifest), 'Replacement live run manifest');
  assertManifestOwnership(manifest, target);
  await writeLiveRunManifest(manifest, paths.manifestPath ?? LIVE_MANIFEST_PATH);
  await readBoundLiveRunManifest(expected, target, paths);
};
