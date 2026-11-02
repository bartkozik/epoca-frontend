import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  assertSafeApiTarget,
  assertSafeLiveTarget,
  fetchAndValidateFrontendVersion,
  fetchAndValidateRuntimeApi,
  loadLiveTarget,
} from './guard';
import { boundedFetch } from './network';
import {
  parseBackendSha,
  parseCompatibilityFixture,
  releaseRunId,
  type CompatibilityFixture,
  type ReleasePhase,
} from './releasePolicy';

interface ReleaseEnvironment {
  phase: ReleasePhase;
  runId: string;
  target: ReturnType<typeof loadLiveTarget>;
  frontend: URL;
  api: URL;
  organizationSlug: string;
  frontendSha: string;
  backendSha: string;
  fixtureId: string;
}
export const releaseEnvironment = (): ReleaseEnvironment => {
  if (process.env.EPOCA_RELEASE_VERIFICATION !== 'true')
    throw new Error('Release verification requires explicit opt-in');
  const phase = z.enum(['deploy', 'rollback']).parse(process.env.EPOCA_RELEASE_PHASE);
  const runId = releaseRunId(process.env.EPOCA_RELEASE_RUN_ID ?? '');
  const target = loadLiveTarget();
  const frontend = assertSafeLiveTarget(target);
  const api = assertSafeApiTarget(target);
  if (frontend.hostname.endsWith('.invalid') || api.hostname.endsWith('.invalid'))
    throw new Error('Inert targets cannot execute');
  const organizationSlug = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .parse(process.env.PLAYWRIGHT_LIVE_ORG_SLUG);
  const frontendSha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.PLAYWRIGHT_LIVE_FRONTEND_SHA);
  const backendSha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.PLAYWRIGHT_LIVE_BACKEND_SHA);
  const fixtureId = z
    .string()
    .regex(/^ct527-[a-z0-9-]+$/)
    .parse(process.env.PLAYWRIGHT_RELEASE_FIXTURE_ID);
  return { phase, runId, target, frontend, api, organizationSlug, frontendSha, backendSha, fixtureId };
};

export const readReleaseFixture = async (): Promise<CompatibilityFixture> => {
  const environment = releaseEnvironment();
  const filename = z.string().min(1).parse(process.env.PLAYWRIGHT_RELEASE_FIXTURE_FILE);
  const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
  const fixture = parseCompatibilityFixture(
    value,
    environment.target.organizationId,
    environment.organizationSlug,
    environment.fixtureId,
  );
  if (fixture.frontendOrigin !== environment.frontend.origin || fixture.apiBaseURL !== environment.api.href)
    throw new Error('Compatibility fixture target binding differs');
  return fixture;
};

export const verifyReleaseVersions = async (
  signal?: AbortSignal,
): Promise<{ frontendSha: string; backendSha: string }> => {
  const environment = releaseEnvironment();
  await readReleaseFixture();
  await fetchAndValidateRuntimeApi(environment.target, fetch, signal);
  const frontendSha = await fetchAndValidateFrontendVersion(environment.target, environment.frontendSha, fetch, signal);
  const url = new URL(`${environment.api.href.replace(/\/$/, '')}/build-info`);
  const response = await boundedFetch(url, { redirect: 'error', signal, headers: { Accept: 'application/json' } });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('Backend build-info unavailable');
  const value: unknown = await response.json();
  const backendSha = parseBackendSha(value, environment.backendSha);
  return { frontendSha, backendSha };
};

export const writeReleaseReceipt = async (): Promise<void> => {
  const environment = releaseEnvironment();
  // Recheck after all browser flows AND cleanup; a concurrent deployment must fail the gate.
  const versions = await verifyReleaseVersions();
  await mkdir('test-results', { recursive: true, mode: 0o700 });
  await writeFile(
    'test-results/release-receipt.json',
    JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      runId: environment.runId,
      phase: environment.phase,
      fixtureId: environment.fixtureId,
      ...versions,
      cleanup: true,
    }),
    { mode: 0o600 },
  );
};
