import { readFile, stat, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import type { LiveTarget } from './guard';
import { type LiveRunManifest } from './metadata';
import {
  acquireLiveRunLock,
  assertNoExistingLiveRunState,
  liveRunIdentity,
  readBoundLiveRunManifest,
  releaseLiveRunLock,
  writeBoundLiveRunManifest,
  writeLiveRunManifestExclusive,
} from './runState';

const target: LiveTarget = {
  baseURL: 'https://frontend-staging.example.test',
  apiBaseURL: 'https://api-staging.example.test/api/v1',
  allowedHosts: ['frontend-staging.example.test'],
  allowedApiHosts: ['api-staging.example.test'],
  allowedOrganizationId: 'organization-1',
  organizationId: 'organization-1',
};

const manifest = (runId = 'ct530-run-state'): LiveRunManifest => ({
  schemaVersion: 2,
  runId,
  organizationId: 'organization-1',
  organizationSlug: 'ct530-staging',
  frontendOrigin: 'https://frontend-staging.example.test',
  apiOrigin: 'https://api-staging.example.test',
  apiBaseURL: 'https://api-staging.example.test/api/v1',
  frontendSha: 'frontend-sha',
  backendSha: 'backend-sha',
  archivedUserId: 'archived-user-id',
  archivedWorkUnitId: 'archived-work-unit-id',
  archivedUserName: 'Archived Fixture',
  historicalDescription: 'E2E CT-530 archived fixture historical hours',
  userId: 'user-id',
  projectName: `E2E ${runId} project`,
  updatedDescription: `E2E ${runId} updated description`,
  owned: { clientIds: [], projectIds: [], workUnitIds: [] },
  ownership: [],
  intents: [],
  quarantined: [],
});

test('stale or corrupt manifests and existing locks are preserved and rejected @mr @technical', async ({
  browserName: _browserName,
}, testInfo) => {
  const manifestPath = testInfo.outputPath('.live-run.json');
  const lockPath = testInfo.outputPath('.live-run.lock');
  await writeFile(manifestPath, '{corrupt recovery evidence', 'utf8');
  await expect(assertNoExistingLiveRunState({ lockPath, manifestPath })).rejects.toThrow(/existing manifest/i);
  expect(await readFile(manifestPath, 'utf8')).toBe('{corrupt recovery evidence');

  const identity = liveRunIdentity(manifest());
  await acquireLiveRunLock(identity, lockPath);
  const originalLock = await readFile(lockPath, 'utf8');
  await expect(acquireLiveRunLock(identity, lockPath)).rejects.toThrow(/lock/i);
  expect(await readFile(lockPath, 'utf8')).toBe(originalLock);
  await expect(releaseLiveRunLock(liveRunIdentity(manifest('other-run')), lockPath)).rejects.toThrow(/identity/i);
  expect(await readFile(lockPath, 'utf8')).toBe(originalLock);
  await releaseLiveRunLock(identity, lockPath);
});

test('exclusive manifest creation and bound reads reject a mid-run manifest swap @mr @technical', async ({
  browserName: _browserName,
}, testInfo) => {
  const manifestPath = testInfo.outputPath('.live-run.json');
  const lockPath = testInfo.outputPath('.live-run.lock');
  const original = manifest();
  const identity = liveRunIdentity(original);
  await acquireLiveRunLock(identity, lockPath);
  expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
  await writeLiveRunManifestExclusive(original, manifestPath);
  expect((await stat(manifestPath)).mode & 0o777).toBe(0o600);
  await expect(writeLiveRunManifestExclusive(original, manifestPath)).rejects.toThrow(/existing manifest/i);

  const swapped = manifest('ct530-swapped-run');
  await writeFile(manifestPath, `${JSON.stringify(swapped, null, 2)}\n`, 'utf8');
  await expect(readBoundLiveRunManifest(identity, target, { lockPath, manifestPath })).rejects.toThrow(/identity/i);
  await expect(writeBoundLiveRunManifest(identity, target, original, { lockPath, manifestPath })).rejects.toThrow(
    /identity/i,
  );
  expect(z.object({ runId: z.string() }).parse(JSON.parse(await readFile(manifestPath, 'utf8'))).runId).toBe(
    'ct530-swapped-run',
  );
});
