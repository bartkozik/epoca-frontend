import { assertReleaseRequest } from './releasePolicy';
import { readFile } from 'node:fs/promises';
import type { Browser, BrowserContext, Locator, Page, Request, Response, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { parseCsvTable } from '../../pivotTable/fixtures/parseCsvTable';
import {
  WorkUnitOverrideResponseSchema,
  type WorkUnitOverrideResponse,
} from '../../workUnitOverrides/fixtures/contract';
import { loadLiveActors, type LiveActorName } from './actors';
import { createReportExportFile, readReportedHours, type ReportExportFile } from './exportReaders';
import { assertManifestOwnership, loadLiveTarget } from './guard';
import { type LiveRunManifest, type LiveWorkUnitIntent } from './metadata';
import { persistMutationIntent } from './mutationLifecycle';
import {
  persistResponseCandidate,
  reconcilePendingIntent,
  verifyCandidateAndPersist,
  verifyOwnedCandidate,
} from './ownership';
import { resolvePmCorrectionFixture, type PmCorrectionFixture } from './pmCorrection';
import {
  readActiveLiveRunIdentitySync,
  readBoundLiveRunManifestSync,
  writeBoundLiveRunManifest,
  type LiveRunIdentity,
} from './runState';

import { fillLiveWorkUnitOverride, saveLiveWorkUnitOverride, undoLiveWorkUnitOverride } from './workUnitOverrideUi';

export { resolvePmCorrectionFixture } from './pmCorrection';

interface ProjectSnapshot {
  description: string;
  memberIds: string[];
  name: string;
  ownerIds: string[];
  userIds: string[];
}

interface SourceWorkUnitSnapshot {
  clientId: string;
  clientName: string;
  date: string;
  description: string;
  duration: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  userId: string;
}

interface LivePivotEvidence {
  cellCount: number;
  csvColumns: number;
  csvRows: number;
  filename: string;
}

interface BrowserApiResult {
  body: unknown;
  status: number;
}

interface BrowserApiResponse {
  contentType: string;
  status: number;
  text: string;
}

interface MutationResponse {
  json(): Promise<unknown>;
  ok(): boolean;
  status(): number;
}

interface PlaywrightResponseBoundary {
  status(): number;
  url(): string;
}

interface ArchivedWorkUnitsRequest {
  apiBaseURL: string;
  archivedWorkUnitId: string;
  method: string;
  organizationSlug: string;
  requestURL: string;
}

const guardedPages = new WeakSet<Page>();
let cachedRunIdentity: LiveRunIdentity | undefined;

const activeRunIdentity = (): LiveRunIdentity => {
  cachedRunIdentity ??= readActiveLiveRunIdentitySync();
  return cachedRunIdentity;
};

const readManifest = (): LiveRunManifest => readBoundLiveRunManifestSync(activeRunIdentity(), loadLiveTarget());

const persistManifest = (manifest: LiveRunManifest): Promise<void> =>
  writeBoundLiveRunManifest(activeRunIdentity(), loadLiveTarget(), manifest);

const projectId = (manifest: LiveRunManifest): string => {
  const id = manifest.owned.projectIds[0];
  if (!id) throw new Error('Live manifest has no owned project');
  return id;
};

const preciseDescription = (manifest: LiveRunManifest): string => `E2E ${manifest.runId} precise hours`;
const retryDescription = (manifest: LiveRunManifest): string => `E2E ${manifest.runId} idempotency retry`;

const apiEndpoint = (apiBaseURL: string, pathname: string): URL => {
  const base = new URL(apiBaseURL);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(pathname.replace(/^\//, ''), base);
};

export const guardedPlaywrightCall = async <TOptions, TResponse extends PlaywrightResponseBoundary>(
  expectedURL: string,
  options: TOptions,
  call: (options: TOptions & { maxRedirects: 0 }) => Promise<TResponse>
): Promise<TResponse> => {
  const guardedOptions = { ...options, maxRedirects: 0 as const } as TOptions & { maxRedirects: 0 };
  const response = await call(guardedOptions);
  const status = response.status();
  if (status >= 300 && status < 400) {
    throw new Error(`Credentialed Playwright redirect response is forbidden (${status})`);
  }
  if (response.url() !== new URL(expectedURL).href) {
    throw new Error(`Credentialed Playwright response URL differs from approved API URL: ${response.url()}`);
  }
  return response;
};

export const constrainArchivedWorkUnitsGet = ({
  apiBaseURL,
  archivedWorkUnitId,
  method,
  organizationSlug,
  requestURL,
}: ArchivedWorkUnitsRequest): string | null => {
  if (method !== 'GET') return null;
  const request = new URL(requestURL);
  const endpoint = apiEndpoint(apiBaseURL, `/organizations/${encodeURIComponent(organizationSlug)}/work-units`);
  if (request.origin !== endpoint.origin || request.pathname !== endpoint.pathname) return null;
  request.searchParams.set('id', archivedWorkUnitId);
  return request.href;
};

const assertAllowedRequestURL = (requestUrl: string, manifest: LiveRunManifest): void => {
  const url = new URL(requestUrl);
  if (url.protocol === 'data:' || url.protocol === 'blob:') return;
  if (url.origin !== manifest.frontendOrigin && url.origin !== manifest.apiOrigin) {
    throw new Error(`Unexpected live request origin: ${url.origin}`);
  }
};

export const shouldBlockExternalFontRequest = ({
  method,
  requestUrl,
  resourceType,
}: {
  method: string;
  requestUrl: string;
  resourceType: string;
}): boolean => {
  if (method !== 'GET') return false;
  const origin = new URL(requestUrl).origin;
  return (
    (origin === 'https://fonts.googleapis.com' && resourceType === 'stylesheet') ||
    (origin === 'https://fonts.gstatic.com' && resourceType === 'font')
  );
};

const installNetworkGuard = async (page: Page, manifest: LiveRunManifest): Promise<void> => {
  if (guardedPages.has(page)) return;
  const target = loadLiveTarget();
  assertManifestOwnership(manifest, target);

  await page.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = request.url();
    if (
      shouldBlockExternalFontRequest({
        method: request.method(),
        requestUrl,
        resourceType: request.resourceType(),
      })
    ) {
      await route.abort('blockedbyclient');
      return;
    }
    try {
      assertAllowedRequestURL(requestUrl, manifest);
      if (process.env.EPOCA_RELEASE_VERIFICATION === 'true') {
        const body: unknown = request.postData() ? request.postDataJSON() : undefined;
        assertReleaseRequest({ phase: 'deploy', frontendOrigin: manifest.frontendOrigin,
          apiBaseURL: manifest.apiBaseURL, organizationSlug: manifest.organizationSlug,
          projectIds: manifest.owned.projectIds, runId: manifest.runId }, requestUrl, request.method(), body);
      }
      await route.continue();
    } catch (error) {
      await route.abort('blockedbyclient');
      throw error;
    }
  });
  if (process.env.EPOCA_RELEASE_VERIFICATION !== 'true') await page.route(`${manifest.frontendOrigin}/assets/env.js`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.env={API_BASE_URL:${JSON.stringify(manifest.apiBaseURL)},PUBLIC_URL:''};`,
    });
  });
  guardedPages.add(page);
};

const browserApi = async (
  page: Page,
  pathname: string,
  options: { body?: unknown; method?: string } = {}
): Promise<BrowserApiResult> => {
  const manifest = readManifest();
  const response: BrowserApiResponse = await page.evaluate(
    async ({ apiBaseURL, body, method, pathname }) => {
      const suffix = window.location.hostname;
      const raw = localStorage.getItem(`IteratorsEpoca__auth__access_tok_${suffix}`);
      if (!raw) throw new Error('Authenticated browser session is missing');
      const token = (JSON.parse(raw) as { token?: unknown }).token;
      if (typeof token !== 'string' || !token) throw new Error('Authenticated browser session is malformed');
      const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const base = new URL(apiBaseURL);
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      const response = await fetch(new URL(pathname.replace(/^\//, ''), base), {
        method: method ?? 'GET',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        contentType: response.headers.get('content-type') ?? '',
        status: response.status,
        text,
      };
    },
    { apiBaseURL: manifest.apiBaseURL, body: options.body, method: options.method, pathname }
  );
  return decodeBrowserApiResponse(response.status, response.contentType, response.text);
};

export const decodeBrowserApiResponse = (
  status: number,
  contentType: string,
  responseText: string
): BrowserApiResult => {
  if (!responseText) return { body: null, status };
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    if (status >= 400) return { body: null, status };
    throw new Error(`Live API returned ${status} with unexpected ${contentType || 'missing content type'}`);
  }
  try {
    return { body: JSON.parse(responseText) as unknown, status };
  } catch {
    throw new Error(`Live API returned ${status} with malformed JSON`);
  }
};

const responseRows = (value: unknown): Array<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null) return [];
  const root = value as Record<string, unknown>;
  const nested = typeof root.workUnits === 'object' && root.workUnits !== null ? root.workUnits : root;
  const results = (nested as Record<string, unknown>).results;
  return Array.isArray(results)
    ? results.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    : [];
};

export const resolveAllowedOrganizationChoice = (value: unknown, expectedId: string, expectedSlug: string): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Organizations response is malformed');
  }
  const results = (value as Record<string, unknown>).results;
  if (!Array.isArray(results)) throw new Error('Organizations response is malformed');
  const matches = results.filter(
    (candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' &&
      candidate !== null &&
      !Array.isArray(candidate) &&
      (candidate as Record<string, unknown>).id === expectedId &&
      (candidate as Record<string, unknown>).slug === expectedSlug &&
      (candidate as Record<string, unknown>).archived !== true &&
      !(candidate as Record<string, unknown>).archivedAt
  );
  if (matches.length !== 1) throw new Error('Organizations response does not contain one exact active organization');
  const name = matches[0].name;
  return typeof name === 'string' && name.trim() ? name.trim() : expectedSlug;
};

const login = async (page: Page, actorName: LiveActorName): Promise<void> => {
  const manifest = readManifest();
  await installNetworkGuard(page, manifest);
  const actor = loadLiveActors()[actorName];
  const apiBase = new URL(manifest.apiBaseURL);
  if (!apiBase.pathname.endsWith('/')) apiBase.pathname += '/';
  const organizationsUrl = new URL('organizations', apiBase);
  await page.goto('/login');
  await page.evaluate((slug) => {
    const suffix = window.location.hostname;
    localStorage.setItem(`IteratorsEpoca__org__slug_${suffix}`, slug);
    localStorage.setItem(`IteratorsEpoca__user__lang_${suffix}`, 'pl');
  }, manifest.organizationSlug);
  await page.getByTestId('loginEmailInput').fill(actor.email);
  await page.getByTestId('loginPasswordInput').fill(actor.password);
  const organizationsResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url() === organizationsUrl.href
  );
  await page.getByTestId('loginButton').click();
  const organizationsResponse = await organizationsResponsePromise;
  if (organizationsResponse.status() !== 200) {
    throw new Error(`Organizations request failed with ${organizationsResponse.status()}`);
  }
  const choice = resolveAllowedOrganizationChoice(
    await organizationsResponse.json(),
    manifest.organizationId,
    manifest.organizationSlug
  );
  await expect(page).toHaveURL(/\/(?:select-organization|working-time)$/);
  if (new URL(page.url()).pathname === '/select-organization') {
    const organization = page.getByText(choice, { exact: true });
    await expect(organization).toHaveCount(1);
    await organization.click();
  }
  await expect(page).toHaveURL(/\/working-time$/);
};

const requiredRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value as Record<string, unknown>;
};

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is missing`);
  return value;
};

const readSourceWorkUnit = async (
  page: Page,
  manifest: LiveRunManifest,
  workUnitId: string
): Promise<SourceWorkUnitSnapshot> => {
  const query = new URLSearchParams({
    id: workUnitId,
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
  });
  const result = await browserApi(
    page,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units?${query}`
  );
  if (result.status !== 200) throw new Error(`Worklog override source read failed with ${result.status}`);
  const candidate = responseRows(result.body).find(({ id }) => id === workUnitId);
  if (!candidate) throw new Error('PM correction source work unit is missing');
  const projectClient = requiredRecord(candidate.projectClient, 'PM correction source project/client');
  const taskId = candidate.taskId;
  if (taskId !== null && taskId !== undefined && typeof taskId !== 'string') {
    throw new Error('PM correction source task ID is malformed');
  }
  return {
    clientId: requiredText(projectClient.clientId, 'PM correction source client ID'),
    clientName: requiredText(projectClient.clientName, 'PM correction source client name'),
    date: requiredText(candidate.date, 'PM correction source date'),
    description: requiredText(candidate.description, 'PM correction source description'),
    duration: requiredText(candidate.duration, 'PM correction source duration'),
    projectId: requiredText(projectClient.projectId, 'PM correction source project ID'),
    projectName: requiredText(projectClient.projectName, 'PM correction source project name'),
    taskId: taskId ?? null,
    userId: requiredText(candidate.userId, 'PM correction source user ID'),
  };
};

export const parseLiveWorkUnitOverride = (value: unknown, expectedId: string): WorkUnitOverrideResponse => {
  const result = WorkUnitOverrideResponseSchema.parse(value);
  if (result.id !== expectedId) throw new Error('Worklog override response ID differs from the owned worklog');
  return result;
};

export const assertLiveWorkUnitSourceUnchanged = (
  actual: WorkUnitOverrideResponse,
  original: WorkUnitOverrideResponse
): void => {
  for (const field of [
    'id',
    'userId',
    'date',
    'duration',
    'entryType',
    'description',
    'state',
    'createdAt',
    'projectClient',
    'taskId',
  ] as const) {
    expect(actual[field], `Override write changed source ${field}`).toEqual(original[field]);
  }
};

export const restoreAcceptedLiveOverride = async (
  accepted: WorkUnitOverrideResponse,
  remove: (expectedRevision: number) => Promise<BrowserApiResult>
): Promise<WorkUnitOverrideResponse> => {
  const result = await remove(accepted.revision);
  if (result.status !== 200) throw new Error(`Owned worklog override cleanup failed with ${result.status}`);
  const restored = parseLiveWorkUnitOverride(result.body, accepted.id);
  expect(restored.override.active).toBe(false);
  expect(restored.override.hasHistory).toBe(true);
  assertLiveWorkUnitSourceUnchanged(restored, accepted);
  expect(restored.effectiveProjectClient).toEqual(accepted.projectClient);
  expect(restored.effectiveTaskId).toBe(accepted.taskId);
  expect(restored.revision).toBe(accepted.revision + 1);
  expect(restored.override.version).toBe(accepted.override.version + 1);
  return restored;
};

const readWorkUnitOverride = async (
  page: Page,
  manifest: LiveRunManifest,
  workUnitId: string
): Promise<WorkUnitOverrideResponse> => {
  const result = await browserApi(
    page,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units/${encodeURIComponent(
      workUnitId
    )}/override`
  );
  if (result.status !== 200) throw new Error(`Worklog override verification failed with ${result.status}`);
  return parseLiveWorkUnitOverride(result.body, workUnitId);
};

const applyWorkUnitOverride = async (
  page: Page,
  secondManagerPage: Page,
): Promise<{
  firstOverride: WorkUnitOverrideResponse;
  restoredPrevious: WorkUnitOverrideResponse;
  override: WorkUnitOverrideResponse;
  restored: WorkUnitOverrideResponse;
  sourceAfter: SourceWorkUnitSnapshot;
  sourceBefore: SourceWorkUnitSnapshot;
  target: PmCorrectionFixture;
}> => {
  const manifest = readManifest();
  const target = resolvePmCorrectionFixture(manifest);
  const sourceBefore = await readSourceWorkUnit(page, manifest, target.sourceWorkUnitId);
  if (sourceBefore.projectId !== target.sourceProjectId) {
    throw new Error('Worklog override source project differs from verified ownership evidence');
  }
  const initial = await readWorkUnitOverride(page, manifest, target.sourceWorkUnitId);
  if (initial.override.active) throw new Error('Owned worklog must start without an override');
  const overridePath = `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units/${encodeURIComponent(target.sourceWorkUnitId)}/override`;
  const endpoint = apiEndpoint(manifest.apiBaseURL, overridePath);
  let accepted: WorkUnitOverrideResponse | undefined;
  let firstOverride: WorkUnitOverrideResponse | undefined;
  let restoredPrevious: WorkUnitOverrideResponse | undefined;
  let verified: WorkUnitOverrideResponse | undefined;
  let restored: WorkUnitOverrideResponse | undefined;
  let sourceAfter: SourceWorkUnitSnapshot | undefined;
  const failures: unknown[] = [];

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/report?startDate=${sourceBefore.date}&endDate=${sourceBefore.date}`);
    const row = page.locator('tbody tr').filter({ hasText: sourceBefore.description });
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
    await expect(page.getByRole('button', { name: 'PM Filters', exact: true })).toHaveCount(0);
    await row
      .getByRole('button', { name: /^(?:Edytuj|Edit)$/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: /^(?:Edycja wpisu w raporcie|Edit report entry)$/ });
    await fillLiveWorkUnitOverride(dialog, target.targetProjectName, 'CT-565-OVERRIDE');
    const response = await saveLiveWorkUnitOverride(page, dialog, endpoint);
    if (response.status() !== 200) throw new Error(`Worklog override write failed with ${response.status()}`);
    accepted = parseLiveWorkUnitOverride(await response.json(), target.sourceWorkUnitId);
    assertLiveWorkUnitSourceUnchanged(accepted, initial);
    expect(accepted.override.active).toBe(true);
    expect(accepted.revision).toBe(initial.revision + 1);
    expect(accepted.override.version).toBe(initial.override.version + 1);
    await expect(dialog.getByText(/^(?:Korekta zapisana\.|Correction saved\.)$/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^(?:Klienci i projekty|Client and project)$/ })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(row.locator('[data-th="Client"]')).toHaveText(target.targetClientName);
    await expect(row.locator('[data-th="Project"]')).toHaveText(target.targetProjectName);
    await expect(row.locator('[data-th="Task ID"]')).toHaveText('CT-565-OVERRIDE');
    await expect(row.getByRole('button', { name: /^(?:Skorygowano|Corrected)$/ })).toBeVisible();
    [sourceAfter, verified] = await Promise.all([
      readSourceWorkUnit(page, manifest, target.sourceWorkUnitId),
      readWorkUnitOverride(page, manifest, target.sourceWorkUnitId),
    ]);
    expect(verified).toEqual(accepted);
    firstOverride = verified;

    await secondManagerPage.setViewportSize({ width: 1440, height: 900 });
    await secondManagerPage.goto(`/report?startDate=${sourceBefore.date}&endDate=${sourceBefore.date}`);
    const secondRow = secondManagerPage.locator('tbody tr').filter({ hasText: sourceBefore.description });
    await expect(secondRow).toHaveCount(1);
    await secondRow
      .getByRole('button', { name: /^(?:Edytuj|Edit)$/ })
      .first()
      .click();
    const secondDialog = secondManagerPage.getByRole('dialog', {
      name: /^(?:Edycja wpisu w raporcie|Edit report entry)$/,
    });
    await fillLiveWorkUnitOverride(secondDialog, target.targetProjectName, 'CT-565-SECOND-MANAGER');
    const secondResponse = await saveLiveWorkUnitOverride(secondManagerPage, secondDialog, endpoint);
    if (secondResponse.status() !== 200)
      throw new Error(`Second manager override failed with ${secondResponse.status()}`);
    accepted = parseLiveWorkUnitOverride(await secondResponse.json(), target.sourceWorkUnitId);
    assertLiveWorkUnitSourceUnchanged(accepted, initial);
    expect(accepted.revision).toBe(firstOverride.revision + 1);
    expect(accepted.override.version).toBe(firstOverride.override.version + 1);
    expect(firstOverride.override.lastChangedBy?.id).toBeTruthy();
    expect(accepted.override.lastChangedBy?.id).toBeTruthy();
    expect(accepted.override.lastChangedBy?.id).not.toBe(firstOverride.override.lastChangedBy?.id);
    verified = await readWorkUnitOverride(secondManagerPage, manifest, target.sourceWorkUnitId);
    expect(verified).toEqual(accepted);
    await expect(secondDialog.getByLabel(/^(?:ID zadania|Task ID)$/)).toHaveValue('CT-565-SECOND-MANAGER');

    const previousResponse = await undoLiveWorkUnitOverride(secondManagerPage, secondDialog, endpoint);
    if (previousResponse.status() !== 200)
      throw new Error(`Undo second correction failed with ${previousResponse.status()}`);
    accepted = parseLiveWorkUnitOverride(await previousResponse.json(), target.sourceWorkUnitId);
    restoredPrevious = accepted;
    assertLiveWorkUnitSourceUnchanged(restoredPrevious, initial);
    expect(restoredPrevious.effectiveProjectClient).toEqual(firstOverride.effectiveProjectClient);
    expect(restoredPrevious.effectiveTaskId).toBe(firstOverride.effectiveTaskId);
    await expect(secondDialog.getByLabel(/^(?:ID zadania|Task ID)$/)).toHaveValue('CT-565-OVERRIDE');

    const sourceResponse = await undoLiveWorkUnitOverride(secondManagerPage, secondDialog, endpoint);
    if (sourceResponse.status() !== 200)
      throw new Error(`Undo first correction failed with ${sourceResponse.status()}`);
    accepted = parseLiveWorkUnitOverride(await sourceResponse.json(), target.sourceWorkUnitId);
    restored = accepted;
    assertLiveWorkUnitSourceUnchanged(restored, initial);
    expect(restored.override.active).toBe(false);
    expect(restored.effectiveProjectClient).toEqual(initial.projectClient);
    expect(restored.effectiveTaskId).toBe(initial.taskId);
    sourceAfter = await readSourceWorkUnit(page, manifest, target.sourceWorkUnitId);
  } catch (error) {
    failures.push(error);
  }
  if (accepted?.override.active) {
    try {
      restored = await restoreAcceptedLiveOverride(accepted, (expectedRevision) =>
        browserApi(page, `${overridePath}?expectedRevision=${expectedRevision}`, { method: 'DELETE' }),
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 1) throw new AggregateError(failures, 'Worklog override verification and cleanup failed');
  if (failures.length === 1) throw failures[0];
  if (!verified || !firstOverride || !restoredPrevious || !restored || !sourceAfter)
    throw new Error('Worklog override evidence is incomplete');
  return { firstOverride, override: verified, restoredPrevious, restored, sourceAfter, sourceBefore, target };
};

const responseMatchesOwnedPivot = (
  response: Response,
  manifest: LiveRunManifest,
  source: SourceWorkUnitSnapshot,
  resource: 'query' | 'export'
): boolean => {
  const url = new URL(response.url());
  const endpoint = apiEndpoint(
    manifest.apiBaseURL,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/pivot-tables/work-units/${resource}`
  );
  return (
    response.request().method() === 'POST' &&
    url.origin === endpoint.origin &&
    url.pathname === endpoint.pathname &&
    url.searchParams.get('dateFrom') === source.date &&
    url.searchParams.get('dateTo') === source.date &&
    url.searchParams.getAll('clientId').length === 1 &&
    url.searchParams.get('clientId') === source.clientId &&
    url.searchParams.getAll('projectId').length === 1 &&
    url.searchParams.get('projectId') === source.projectId &&
    url.searchParams.getAll('userId').length === 1 &&
    url.searchParams.get('userId') === source.userId &&
    (resource === 'query' || url.searchParams.get('format') === 'csv')
  );
};

const verifyPivotQueryAndExport = async (page: Page): Promise<LivePivotEvidence> => {
  const manifest = readManifest();
  const ownedWorkUnitId = manifest.owned.workUnitIds[0];
  if (!ownedWorkUnitId) throw new Error('Live manifest has no owned work unit for pivot verification');
  const source = await readSourceWorkUnit(page, manifest, ownedWorkUnitId);
  const filters = new URLSearchParams({
    startDate: source.date,
    endDate: source.date,
    clients: source.clientId,
    projects: source.projectId,
    users: source.userId,
  });
  const queryResponsePromise = page.waitForResponse((response) =>
    responseMatchesOwnedPivot(response, manifest, source, 'query')
  );
  await page.goto(`/pivot-table?${filters}`);
  const queryResponse = await queryResponsePromise;
  if (!queryResponse.ok()) throw new Error(`Live pivot query failed with ${queryResponse.status()}`);
  const queryDocument = requiredRecord(await queryResponse.json(), 'Live pivot query response');
  const queryCells = queryDocument.cells;
  if (!Array.isArray(queryCells) || queryCells.length === 0) {
    throw new Error('Live pivot query returned no cells for the owned work unit');
  }
  await expect(page.getByRole('table', { name: /Tabela przestawna|Pivot table/ })).toBeVisible();

  await page.getByRole('button', { name: /Pobierz|Download/, exact: true }).click();
  const exportResponsePromise = page.waitForResponse((response) =>
    responseMatchesOwnedPivot(response, manifest, source, 'export')
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const [exportResponse, download] = await Promise.all([exportResponsePromise, downloadPromise]);
  if (!exportResponse.ok()) throw new Error(`Live pivot export failed with ${exportResponse.status()}`);
  const expectedFilename = `pivot_table_${source.date}_${source.date}.csv`;
  if (download.suggestedFilename() !== expectedFilename) {
    throw new Error(`Live pivot export filename differs from ${expectedFilename}`);
  }
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Live pivot CSV download has no completed file');
  const table = parseCsvTable((await readFile(downloadPath, 'utf8')).replace(/^\uFEFF/, ''));
  const csvColumns = table[0]?.length ?? 0;
  if (table.length < 2 || csvColumns < 2 || table.some((row) => row.length !== csvColumns)) {
    throw new Error('Live pivot CSV export is empty or malformed');
  }
  if (
    !table
      .slice(1)
      .flat()
      .some((value) => /^\d{2}:\d{2}(?::\d{2})?$/.test(value))
  ) {
    throw new Error('Live pivot CSV export has no duration value for the owned work unit');
  }
  return {
    cellCount: queryCells.length,
    csvColumns,
    csvRows: table.length,
    filename: download.suggestedFilename(),
  };
};

const downloadPreciseExports = async (page: Page): Promise<{ csv: ReportExportFile; xlsx: ReportExportFile }> => {
  const manifest = readManifest();
  const year = new Date().getUTCFullYear();
  await page.goto(
    `/report?startDate=${year}-01-01&endDate=${year}-12-31&projects=${encodeURIComponent(projectId(manifest))}`
  );
  const row = page.getByRole('row', { name: new RegExp(preciseDescription(manifest)) });
  await row.getByRole('checkbox').check();

  const isReportExportRequest = (request: Request, format: 'csv' | 'xlsx'): boolean => {
    const url = new URL(request.url());
    return (
      request.method() === 'POST' &&
      url.origin === manifest.apiOrigin &&
      url.pathname ===
        apiEndpoint(
          manifest.apiBaseURL,
          `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units/export`
        ).pathname &&
      url.searchParams.get('format') === format
    );
  };
  const durationHeader = (request: Request): string => {
    const body = request.postDataJSON() as unknown;
    const document = requiredRecord(body, 'Live report export request');
    const columnNames = requiredRecord(document.columnNames, 'Live report export column names');
    return requiredText(columnNames.duration, 'Live report export duration header');
  };

  const [csvDownload, csvRequest] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForRequest((request) => isReportExportRequest(request, 'csv')),
    page.getByRole('button', { name: 'CSV', exact: true }).click(),
  ]);
  const [xlsxDownload, xlsxRequest] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForRequest((request) => isReportExportRequest(request, 'xlsx')),
    page.getByRole('button', { name: 'XLS', exact: true }).click(),
  ]);
  const csvPath = await csvDownload.path();
  const xlsxPath = await xlsxDownload.path();
  if (!csvPath || !xlsxPath) throw new Error('Live report downloads did not expose local files');
  return {
    csv: createReportExportFile(csvPath, csvDownload.suggestedFilename(), 'csv', durationHeader(csvRequest)),
    xlsx: createReportExportFile(xlsxPath, xlsxDownload.suggestedFilename(), 'xlsx', durationHeader(xlsxRequest)),
  };
};

export const buildLongFilterRequest = (
  apiBaseURL: string,
  organizationSlug: string,
  ownedProjectId: string
): { absoluteURL: string; pathname: string } => {
  const query = new URLSearchParams({ dateFrom: '1970-01-01', dateTo: '2099-12-31' });
  const pathnameFor = (): string =>
    `/organizations/${encodeURIComponent(organizationSlug)}/work-units?${query.toString()}`;
  let pathname = pathnameFor();
  let absoluteURL = apiEndpoint(apiBaseURL, pathname).href;
  while (absoluteURL.length <= 2048) {
    query.append('projectId', ownedProjectId);
    pathname = pathnameFor();
    absoluteURL = apiEndpoint(apiBaseURL, pathname).href;
  }
  if (absoluteURL.length > 4096) throw new Error('Long-filter contract exceeds the proxy-safe ceiling');
  return { absoluteURL, pathname };
};

const openLongFilterReport = async (page: Page): Promise<Response> => {
  const manifest = readManifest();
  await page.goto('/report');
  const { absoluteURL, pathname } = buildLongFilterRequest(
    manifest.apiBaseURL,
    manifest.organizationSlug,
    projectId(manifest)
  );
  const responsePromise = page.waitForResponse((response) => response.url() === absoluteURL);
  const resultPromise = browserApi(page, pathname);
  const response = await responsePromise;
  const result = await resultPromise;
  if (result.status < 200 || result.status >= 300) throw new Error(`Long-filter API returned ${result.status}`);
  return response;
};

const openProvisionedReport = async (page: Page): Promise<Locator> => {
  const manifest = readManifest();
  const query = new URLSearchParams({
    id: manifest.archivedWorkUnitId,
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
  });
  const fixtureResult = await browserApi(
    page,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units?${query}`
  );
  const exactFixture = responseRows(fixtureResult.body).find(({ id }) => id === manifest.archivedWorkUnitId);
  if (
    !exactFixture ||
    exactFixture.description !== manifest.historicalDescription ||
    exactFixture.userFullName !== manifest.archivedUserName
  ) {
    throw new Error('Archived fixture changed after guarded preflight');
  }
  const date = typeof exactFixture.date === 'string' ? exactFixture.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Archived fixture date is malformed');
  const workUnitsEndpoint = apiEndpoint(
    manifest.apiBaseURL,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units`
  );
  const escapedEndpoint = workUnitsEndpoint.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const workUnitsMatcher = new RegExp(`^${escapedEndpoint}(?:\\?.*)?$`);
  const constrainRequest = async (route: Route, request: Request): Promise<void> => {
    const constrainedURL = constrainArchivedWorkUnitsGet({
      apiBaseURL: manifest.apiBaseURL,
      archivedWorkUnitId: manifest.archivedWorkUnitId,
      method: request.method(),
      organizationSlug: manifest.organizationSlug,
      requestURL: request.url(),
    });
    if (!constrainedURL) return route.fallback();
    await route.fallback({ url: constrainedURL });
  };

  await page.route(workUnitsMatcher, constrainRequest);
  try {
    const exactFixtureResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.origin === workUnitsEndpoint.origin &&
        url.pathname === workUnitsEndpoint.pathname &&
        url.searchParams.getAll('id').length === 1 &&
        url.searchParams.get('id') === manifest.archivedWorkUnitId
      );
    });
    await page.goto(`/report?startDate=${date}&endDate=${date}`);
    const response = await exactFixtureResponse;
    if (!response.ok()) throw new Error(`Archived report request failed with ${response.status()}`);
    const row = page.locator('tbody tr').filter({ hasText: manifest.historicalDescription }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    return row;
  } finally {
    await page.unroute(workUnitsMatcher, constrainRequest);
  }
};

const expectUserDetailsAccess = async (
  browser: Browser,
  actorName: LiveActorName,
  expectedStatus: number | readonly number[]
): Promise<void> => {
  const manifest = readManifest();
  const context: BrowserContext = await browser.newContext({
    baseURL: manifest.frontendOrigin,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  });
  const page = await context.newPage();
  try {
    await login(page, actorName);
    const result = await browserApi(
      page,
      `/organizations/${encodeURIComponent(manifest.organizationSlug)}/users/${encodeURIComponent(
        manifest.userId
      )}/details`
    );
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    expect(expectedStatuses).toContain(result.status);
  } finally {
    await context.close();
  }
};

export const parseProjectSnapshot = (value: unknown): ProjectSnapshot => {
  const project = requiredRecord(value, 'Provisioned project response');
  const name = requiredText(project.name, 'Provisioned project name');
  const description = requiredText(project.description, 'Provisioned project description');
  if (!Array.isArray(project.projectUsers)) throw new Error('Provisioned project response is malformed');
  const seen = new Set<string>();
  const ownerIds: string[] = [];
  const memberIds: string[] = [];
  for (const value of project.projectUsers) {
    const projectUser = requiredRecord(value, 'Provisioned project user');
    const id = requiredText(projectUser.id, 'Provisioned project user ID');
    if (seen.has(id)) throw new Error('Provisioned project response contains duplicate users');
    seen.add(id);
    if (projectUser.role === 'Owner') ownerIds.push(id);
    else if (projectUser.role === 'Member') memberIds.push(id);
    else throw new Error('Provisioned project response contains an unknown user role');
  }
  return { description, memberIds, name, ownerIds, userIds: [...ownerIds, ...memberIds] };
};

const readProject = async (page: Page): Promise<ProjectSnapshot> => {
  const manifest = readManifest();
  const id = projectId(manifest);
  await page.goto(`/projects/${encodeURIComponent(id)}/project-details`);
  const result = await browserApi(
    page,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/projects/${encodeURIComponent(id)}`
  );
  if (result.status !== 200) throw new Error('Provisioned project could not be read');
  const project = requiredRecord(result.body, 'Provisioned project response');
  const evidence = manifest.ownership.find((entry) => entry.kind === 'project' && entry.id === id);
  if (!evidence) throw new Error('Provisioned project has no ownership evidence');
  verifyOwnedCandidate(manifest, evidence, project);
  return parseProjectSnapshot(project);
};

const assignPersonAndEditDescription = async (page: Page): Promise<ProjectSnapshot> => {
  const manifest = readManifest();
  const currentProject = await readProject(page);
  const users = await browserApi(
    page,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/users?includeArchived=true`
  );
  const userList = Array.isArray(users.body) ? users.body : [];
  const user = userList.find(
    (candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as Record<string, unknown>).id === manifest.userId
  );
  const userName = user
    ? `${typeof user.firstName === 'string' ? user.firstName : ''} ${
        typeof user.lastName === 'string' ? user.lastName : ''
      }`.trim()
    : '';
  if (!userName) throw new Error('Provisioned live user has no display name');

  let membershipWasReset = false;
  const restoreProjectMember = async (): Promise<void> => {
    if (!membershipWasReset) return;
    const restored = await browserApi(
      page,
      `/organizations/${encodeURIComponent(manifest.organizationSlug)}/projects/${encodeURIComponent(
        projectId(manifest)
      )}`,
      {
        method: 'PATCH',
        body: {
          name: currentProject.name,
          description: currentProject.description,
          ownerIds: currentProject.ownerIds,
          memberIds: currentProject.memberIds,
        },
      }
    );
    if (restored.status !== 200) {
      throw new Error(`Live project membership recovery failed with ${restored.status}`);
    }
    membershipWasReset = false;
  };

  if (currentProject.memberIds.includes(manifest.userId)) {
    const reset = await browserApi(
      page,
      `/organizations/${encodeURIComponent(manifest.organizationSlug)}/projects/${encodeURIComponent(
        projectId(manifest)
      )}`,
      {
        method: 'PATCH',
        body: {
          name: currentProject.name,
          description: currentProject.description,
          ownerIds: currentProject.ownerIds,
          memberIds: currentProject.memberIds.filter((id) => id !== manifest.userId),
        },
      }
    );
    if (reset.status !== 200) throw new Error(`Live project membership reset failed with ${reset.status}`);
    membershipWasReset = true;
    await page.reload();
  }

  try {
    await page.getByRole('button', { name: /Edytuj|Edit/ }).click();
    const form = page
      .getByText(/Edytuj projekt|Edit project/, { exact: true })
      .locator('..')
      .locator('..');
    const memberSection = form
      .getByText(/Członkowie projektu|Project members/, { exact: true })
      .locator('..')
      .locator('..');
    await memberSection.getByRole('button', { name: '+' }).click();
    const memberSearch = form.getByPlaceholder(/Wyszukaj użytkowników|Search users/);
    await memberSearch.click();
    await memberSearch.fill(userName);
    await form.getByText(userName, { exact: true }).click();
    await form.getByText(/^(Opis projektu|Project description)$/).click();
    await expect(memberSearch).toBeHidden();
    await form
      .getByText(/^(Opis projektu|Project description)$/)
      .locator('..')
      .locator('..')
      .getByRole('textbox')
      .fill(manifest.updatedDescription);
    const patchResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith(`/projects/${projectId(manifest)}`)
    );
    await form.getByRole('button', { name: /Zapisz|Save/ }).click();
    if (!(await patchResponse).ok()) throw new Error('Live project edit failed');
    membershipWasReset = false;
    return readProject(page);
  } catch (error) {
    try {
      await restoreProjectMember();
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], 'Live project edit and membership recovery both failed');
    }
    throw error;
  }
};

const idFromResponse = async (response: MutationResponse): Promise<string> => {
  const body = await response.json();
  const id = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).id : undefined;
  if (typeof id !== 'string' || id.trim() === '' || id.trim() !== id) {
    throw new Error('Created work-unit response has no ID');
  }
  return id;
};

export const registerWorkUnitResponseCandidate = async (
  manifest: LiveRunManifest,
  sourceIntent: LiveWorkUnitIntent,
  response: MutationResponse,
  dependencies: {
    persist: (manifest: LiveRunManifest) => Promise<void>;
    readById: (id: string, intent: LiveWorkUnitIntent) => Promise<unknown>;
  }
): Promise<{ id: string; manifest: LiveRunManifest }> => {
  if (!response.ok()) throw new Error(`Live work-unit mutation failed with ${response.status()}`);
  const id = await idFromResponse(response);
  const recovery = await persistResponseCandidate(manifest, sourceIntent, id, dependencies.persist);
  const candidate = await dependencies.readById(id, sourceIntent);
  if (recovery.owned) {
    const evidence = recovery.manifest.ownership.find((entry) => entry.kind === 'workUnit' && entry.id === id);
    if (!evidence) throw new Error(`Owned live work-unit candidate ${id} is missing evidence`);
    verifyOwnedCandidate(recovery.manifest, evidence, candidate);
    return { id, manifest: recovery.manifest };
  }
  const next = await verifyCandidateAndPersist(recovery.manifest, recovery.intentId, candidate, dependencies.persist);
  return { id, manifest: next };
};

const loadWorkUnitCandidates = async (
  page: Page,
  manifest: LiveRunManifest,
  authorization: string,
  query: URLSearchParams
): Promise<Array<Record<string, unknown>>> => {
  if (!authorization) throw new Error('Live work-unit verification is missing authorization');
  const url = apiEndpoint(
    manifest.apiBaseURL,
    `/organizations/${encodeURIComponent(manifest.organizationSlug)}/work-units?${query}`
  );
  assertAllowedRequestURL(url.href, manifest);
  const response = await guardedPlaywrightCall(
    url.href,
    {
      headers: { Accept: 'application/json', Authorization: authorization },
      timeout: 15_000,
    },
    (options) => page.request.get(url.href, options)
  );
  if (!response.ok()) throw new Error(`Live work-unit verification failed with ${response.status()}`);
  return responseRows(await response.json());
};

export const recoverFirstWorkUnitResponse = async (
  readCurrentManifest: () => LiveRunManifest,
  sourceIntent: LiveWorkUnitIntent,
  submit: () => Promise<string>,
  loadCandidates: () => Promise<unknown[]>,
  persist: (manifest: LiveRunManifest) => Promise<void>
): Promise<string | undefined> => {
  try {
    return await submit();
  } catch (error) {
    const current = readCurrentManifest();
    const hasConcreteQuarantine = current.quarantined.some(
      ({ intentId, reason }) => intentId === sourceIntent.intentId && reason !== 'unknown'
    );
    if (hasConcreteQuarantine) throw error;
    const hasPersistedCandidate = current.quarantined.some(
      ({ candidateId, intentId, kind, reason }) =>
        candidateId !== null &&
        kind === 'workUnit' &&
        reason === 'unknown' &&
        current.intents.some(
          (intent) =>
            intent.intentId === intentId &&
            intent.kind === 'workUnit' &&
            intent.idempotencyKey === sourceIntent.idempotencyKey
        )
    );
    if (hasPersistedCandidate) throw error;
    const reconciled = await reconcilePendingIntent(current, sourceIntent.intentId, loadCandidates, persist);
    return reconciled.ownership.find(({ intentId }) => intentId === sourceIntent.intentId)?.id;
  }
};

const submitWithLostResponseAndRetry = async (
  page: Page,
  scenario = ''
): Promise<{ keys: string[]; reportedRows: Array<{ id: string }> }> => {
  const manifest = readManifest();
  const description = `${retryDescription(manifest)}${scenario ? ` ${scenario}` : ''}`;
  const keys: string[] = [];
  let firstRequest = true;
  let firstResponseId: string | undefined;
  let authorization = '';
  let workUnitIntent: LiveWorkUnitIntent | undefined;
  const workUnitsApiPath = `/organizations/${manifest.organizationSlug}/work-units`;
  const workUnitsEndpoint = apiEndpoint(manifest.apiBaseURL, workUnitsApiPath);
  const workUnitsPath = workUnitsEndpoint.pathname;
  const routeMatcher = new RegExp(`${workUnitsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\?.*)?$`);

  await page.route(routeMatcher, async (route: Route, request: Request) => {
    assertAllowedRequestURL(request.url(), manifest);
    if (process.env.EPOCA_RELEASE_VERIFICATION === 'true') {
      const body: unknown = request.postData() ? request.postDataJSON() : undefined;
      assertReleaseRequest({ phase: 'deploy', frontendOrigin: manifest.frontendOrigin,
        apiBaseURL: manifest.apiBaseURL, organizationSlug: manifest.organizationSlug,
        projectIds: manifest.owned.projectIds, runId: manifest.runId }, request.url(), request.method(), body);
    }
    const requestURL = new URL(request.url());
    if (requestURL.origin !== workUnitsEndpoint.origin || requestURL.pathname !== workUnitsEndpoint.pathname) {
      throw new Error('Live work-unit mutation did not target the approved API endpoint');
    }
    if (request.method() !== 'POST') return route.fallback();
    const key = request.headers()['idempotency-key'];
    if (!key) throw new Error('Live work-unit request has no Idempotency-Key');
    keys.push(key);
    if (!firstRequest) return route.continue();
    authorization = request.headers().authorization ?? '';
    workUnitIntent = {
      kind: 'workUnit',
      intentId: `${manifest.runId}-retry-${key}`,
      marker: `E2E ${manifest.runId}`,
      organizationId: manifest.organizationId,
      projectId: projectId(manifest),
      actorUserId: manifest.userId,
      descriptionPrefix: description,
      idempotencyKey: key,
    };
    const responseIntent = workUnitIntent;
    await persistMutationIntent(readManifest(), responseIntent, persistManifest);
    firstRequest = false;
    firstResponseId = await recoverFirstWorkUnitResponse(
      readManifest,
      responseIntent,
      async () => {
        const upstream = await guardedPlaywrightCall(request.url(), { timeout: 15_000 }, (options) =>
          route.fetch(options)
        );
        const registration = await registerWorkUnitResponseCandidate(readManifest(), responseIntent, upstream, {
          persist: persistManifest,
          readById: async (id) => {
            const query = new URLSearchParams({ id, dateFrom: '1970-01-01', dateTo: '2099-12-31' });
            const candidate = (await loadWorkUnitCandidates(page, manifest, authorization, query)).find(
              (entry) => entry.id === id
            );
            if (!candidate) throw new Error('Created live work unit could not be re-read');
            return candidate;
          },
        });
        return registration.id;
      },
      async () => {
        const query = new URLSearchParams({
          dateFrom: '1970-01-01',
          dateTo: '2099-12-31',
          userId: responseIntent.actorUserId,
          projectId: responseIntent.projectId,
        });
        return (await loadWorkUnitCandidates(page, manifest, authorization, query)).filter(
          (entry) => entry.description === responseIntent.descriptionPrefix
        );
      },
      persistManifest
    );
    if (!firstResponseId) throw new Error('Lost-response mutation did not produce verified ownership evidence');
    await route.abort('failed');
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/working-time');
  await page
    .getByRole('button', { name: /\+ Dodaj aktywność|\+ Add activity/ })
    .first()
    .click();
  await page
    .getByRole('group', { name: /Co chcesz dodać\?|What do you want to add\?/ })
    .getByRole('button', { name: /Czas pracy|Working time/ })
    .click();
  await page.getByLabel(/Klienci i projekty|Clients and projects/).click();
  await page.getByLabel(/Modal/).getByText(manifest.projectName, { exact: true }).click();
  await page
    .getByText(/Opis działań|Description of activity/, { exact: true })
    .locator('..')
    .getByRole('textbox')
    .fill(description);
  await page.getByLabel(/Godziny|Hours/, { exact: true }).fill('1:00');

  const submit = page.getByRole('button', { name: /Złóż raport|Submit report/, exact: true });
  const failedRequest = page.waitForEvent('requestfailed', {
    predicate: (request) => request.method() === 'POST' && new URL(request.url()).pathname === workUnitsPath,
  });
  await submit.click();
  await failedRequest;
  await expect(submit).toBeEnabled();

  const replay = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).origin === manifest.apiOrigin &&
      new URL(response.url()).pathname === workUnitsPath
  );
  await submit.click();
  const replayResponse = await replay;
  if (!firstResponseId) throw new Error('Lost-response mutation did not return an owned work-unit ID');
  if (!workUnitIntent) throw new Error('Lost-response mutation intent is missing');
  await registerWorkUnitResponseCandidate(readManifest(), workUnitIntent, replayResponse, {
    persist: persistManifest,
    readById: async (id) => {
      const current = readManifest();
      const query = new URLSearchParams({ id, dateFrom: '1970-01-01', dateTo: '2099-12-31' });
      const candidate = (await loadWorkUnitCandidates(page, current, authorization, query)).find(
        (entry) => entry.id === id
      );
      if (!candidate) throw new Error('Idempotent replay work unit could not be re-read');
      return candidate;
    },
  });
  await page.unroute(routeMatcher);

  const query = new URLSearchParams({
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
    userId: manifest.userId,
    projectId: projectId(manifest),
  });
  const report = await browserApi(page, `${workUnitsApiPath}?${query}`);
  const reportedRows = responseRows(report.body)
    .filter((row) => row.description === description)
    .map(({ id }) => ({ id: typeof id === 'string' ? id : '' }))
    .filter(({ id }) => id !== '');
  return { keys, reportedRows };
};

export const live = {
  get manifest(): LiveRunManifest {
    return readManifest();
  },
  login,
  downloadPreciseExports,
  readReportedHours,
  openLongFilterReport,
  openProvisionedReport,
  expectUserDetailsAccess,
  readProject,
  assignPersonAndEditDescription,
  applyWorkUnitOverride,
  verifyPivotQueryAndExport,
  submitWithLostResponseAndRetry,
};
