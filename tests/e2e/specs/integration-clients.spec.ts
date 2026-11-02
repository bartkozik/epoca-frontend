import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/epocaTest';
import { IDS } from '../worlds/ids';

const collectionPath = '/organizations/epoca-e2e/oauth-clients';
const REQUEST_QUIESCENCE_INTERVAL_MS = 100;
const REQUEST_QUIESCENCE_SAMPLES = 5;

test.use({
  world: 'world-6',
  screenshot: 'off',
  trace: 'off',
  video: 'off',
});

const openCreate = async (page: Page): Promise<{ add: Locator; name: Locator }> => {
  const add = page.getByRole('button', { name: '+ Dodaj klienta' });
  await add.focus();
  await add.press('Enter');
  const name = page.getByRole('textbox', { name: 'Nazwa klienta' });
  await expect(name).toBeFocused();
  return { add, name };
};

const acknowledgeCredentials = async (page: Page): Promise<void> => {
  const heading = page.getByRole('heading', { name: 'Zapisz dane uwierzytelniające klienta' });
  await expect(heading).toBeVisible();
  await page.getByRole('checkbox', { name: 'Sekret klienta został przeze mnie zapisany' }).check();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(heading).toBeHidden();
};

const openRowActions = async (page: Page, clientName: string): Promise<void> => {
  const trigger = page.getByRole('button', { name: `Akcje: ${clientName}` });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
};

const expectOneStableRequest = async <Entry>(readEntries: () => readonly Entry[]): Promise<readonly Entry[]> => {
  await expect.poll(() => readEntries().length).toBe(1);
  for (let sample = 0; sample < REQUEST_QUIESCENCE_SAMPLES; sample += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, REQUEST_QUIESCENCE_INTERVAL_MS));
    expect(readEntries()).toHaveLength(1);
  }
  const entries = readEntries();
  expect(entries).toHaveLength(1);
  return entries;
};

test.describe('Owner OAuth integration clients', () => {
  test.use({ actor: 'owner' });

  test('OAuth client @mr @oauth-client Owner lists creates edits renews rotates and revokes with duplicate guards keyboard and focus', async ({
    page,
    runtime,
  }) => {
    await page.goto('/team-settings/integrations');
    await expect(page.getByRole('heading', { name: 'Klienci integracji' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Klienci integracji' }).getByRole('row')).toHaveCount(4);

    const { add, name } = await openCreate(page);
    const allProjects = page.getByRole('radio', { name: 'Wszystkie obecne i przyszłe projekty' });
    const selectedProjects = page.getByRole('radio', { name: 'Wybrane projekty' });
    const futureProjectsHelper = page.getByText('Nowe projekty będą dołączane automatycznie.');
    const projectExpansionConfirmation = page.getByRole('heading', { name: 'Uwzględnić przyszłe projekty?' });

    await expect(allProjects).toBeChecked();
    await expect(futureProjectsHelper).toBeVisible();
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await selectedProjects.check();
    await expect(futureProjectsHelper).toHaveCount(0);
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await allProjects.check();
    await expect(futureProjectsHelper).toBeVisible();
    await expect(projectExpansionConfirmation).toHaveCount(0);

    await name.fill('Runtime browser integration');
    await page.getByRole('checkbox', { name: 'Odczyt organizacji' }).check();
    const create = page.getByRole('button', { name: 'Utwórz klienta' });
    await create.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    const createRequests = await expectOneStableRequest(() =>
      runtime.journal.entries.filter(({ method, path }) => method === 'POST' && path === collectionPath)
    );
    await acknowledgeCredentials(page);
    await expect(add).toBeFocused();
    expect(createRequests[0]?.requestBody).toEqual({
      expiresAt: null,
      name: 'Runtime browser integration',
      projectAccess: { mode: 'AllProjects' },
      scopes: ['organization:read'],
    });

    await openRowActions(page, 'Active reporting client');
    await page.getByRole('button', { name: 'Edytuj: Active reporting client' }).click();
    const editName = page.getByRole('textbox', { name: 'Nazwa klienta' });
    await expect(selectedProjects).toBeChecked();
    await editName.fill('Active reporting client edited');
    await page.getByRole('checkbox', { name: 'Odczyt użytkowników' }).check();
    await allProjects.check();
    await expect(futureProjectsHelper).toBeVisible();
    await expect(projectExpansionConfirmation).toHaveCount(0);

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await expect(projectExpansionConfirmation).toBeVisible();
    expect(runtime.journal.entries.filter(({ method }) => method === 'PATCH')).toHaveLength(0);

    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await expect(editName).toHaveValue('Active reporting client edited');
    await expect(page.getByRole('checkbox', { name: 'Odczyt użytkowników' })).toBeChecked();
    await expect(allProjects).toBeChecked();
    await expect(futureProjectsHelper).toBeVisible();
    await expect(allProjects).toBeFocused();
    expect(runtime.journal.entries.filter(({ method }) => method === 'PATCH')).toHaveLength(0);

    await selectedProjects.check();
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await expect(futureProjectsHelper).toHaveCount(0);
    const availableProjects = page.getByRole('combobox', { name: 'Dostępne projekty' });
    await expect(availableProjects).toHaveValue('Alpha Project');
    await availableProjects.click();
    await expect(page.getByRole('option', { name: 'Alpha Project', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await allProjects.check();
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await expect(futureProjectsHelper).toBeVisible();

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    const confirmProjectExpansion = page.getByRole('button', { name: 'Użyj wszystkich projektów' });
    await confirmProjectExpansion.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    const activeClientPath = `${collectionPath}/epoca_oauth_client_v1_active`;
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await expect(page.getByText('Active reporting client edited', { exact: true })).toBeVisible();
    const activeClientUpdates = await expectOneStableRequest(() =>
      runtime.journal.entries.filter(({ method, path }) => method === 'PATCH' && path === activeClientPath)
    );
    expect(activeClientUpdates[0]?.requestBody).toEqual({
      expectedVersion: 5,
      name: 'Active reporting client edited',
      projectAccess: { mode: 'AllProjects' },
      scopes: ['organization:read', 'users:read', 'projects:read'],
    });

    await openRowActions(page, 'Expired reporting client');
    await page.getByRole('button', { name: 'Odnów: Expired reporting client' }).click();
    await expect(selectedProjects).toBeChecked();
    await page.getByRole('radio', { name: 'Bez daty wygaśnięcia' }).check();
    await allProjects.check();
    await expect(projectExpansionConfirmation).toHaveCount(0);
    await page.getByRole('button', { name: 'Odnów klienta' }).click();
    await expect(projectExpansionConfirmation).toBeVisible();
    const expiredClientPath = `${collectionPath}/epoca_oauth_client_v1_expired`;
    expect(
      runtime.journal.entries.filter(({ method, path }) => method === 'PATCH' && path === expiredClientPath)
    ).toHaveLength(0);
    await page.getByRole('button', { name: 'Użyj wszystkich projektów' }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await openRowActions(page, 'Expired reporting client');
    await expect(page.getByRole('button', { name: 'Edytuj: Expired reporting client' })).toBeVisible();
    const expiredClientUpdates = await expectOneStableRequest(() =>
      runtime.journal.entries.filter(({ method, path }) => method === 'PATCH' && path === expiredClientPath)
    );
    expect(expiredClientUpdates[0]?.requestBody).toEqual({
      expectedVersion: 5,
      expiresAt: null,
      projectAccess: { mode: 'AllProjects' },
    });

    await openRowActions(page, 'Active reporting client edited');
    await page.getByRole('button', { name: 'Zmień sekret: Active reporting client edited' }).click();
    await page.getByRole('button', { name: 'Zmień sekret teraz' }).click();
    await acknowledgeCredentials(page);

    await openRowActions(page, 'Runtime browser integration');
    await page.getByRole('button', { name: 'Unieważnij: Runtime browser integration' }).click();
    const revoke = page.getByRole('button', { name: 'Unieważnij klienta teraz' });
    await revoke.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByText('Runtime browser integration', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unieważnij: Runtime browser integration' })).toHaveCount(0);
    expect(
      runtime.journal.entries.filter(
        ({ method, path }) => method === 'POST' && path.endsWith('/revoke') && path.includes('runtime')
      )
    ).toHaveLength(1);
  });

  test('OAuth client @mr @oauth-client Owner keeps drafts across 400 500 timeout and stale 409 without automatic replay', async ({
    page,
    runtime,
  }) => {
    await page.goto('/team-settings/integrations');
    await openRowActions(page, 'Active reporting client');
    await page.getByRole('button', { name: 'Edytuj: Active reporting client' }).click();
    const name = page.getByRole('textbox', { name: 'Nazwa klienta' });
    await name.fill('Draft retained after conflict');
    runtime.activateFailure('oauth-conflict');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await expect(page.getByRole('alert')).toContainText('aktualna wersja: 5');
    await expect(name).toHaveValue('Draft retained after conflict');
    expect(runtime.journal.entries.filter(({ method }) => method === 'PATCH')).toHaveLength(1);

    await page.getByRole('button', { name: 'Anuluj' }).click();
    const createForm = await openCreate(page);
    await createForm.name.fill('Failure boundary integration');
    await page.getByRole('checkbox', { name: 'Odczyt organizacji' }).check();
    const submit = page.getByRole('button', { name: 'Utwórz klienta' });
    for (const failure of ['oauth-bad-request', 'oauth-server-error', 'oauth-timeout'] as const) {
      runtime.activateFailure(failure);
      await submit.click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(createForm.name).toHaveValue('Failure boundary integration');
    }
    expect(
      runtime.journal.entries.filter(({ method, path }) => method === 'POST' && path === collectionPath)
    ).toHaveLength(3);
  });

  test('OAuth client @mr @oauth-client Owner opens Details with safe audit fields and paginates isolated events', async ({
    page,
    runtime,
  }) => {
    const integration = runtime.state.oauthIntegration;
    if (!integration) throw new Error('world-6 OAuth integration fixture is missing');
    const activeEvent = integration.auditEvents.find(({ clientId }) => clientId === 'epoca_oauth_client_v1_active');
    if (!activeEvent) throw new Error('world-6 active-client audit fixture is missing');
    const auditIdPrefix = IDS.oauthAuditExpired.slice(0, -12);
    integration.auditEvents = Array.from({ length: 21 }, (_, index) => ({
      ...structuredClone(activeEvent),
      id: index === 0 ? IDS.oauthAuditActive : `${auditIdPrefix}${String(index + 1).padStart(12, '0')}`,
      occurredAt: new Date(Date.parse(activeEvent.occurredAt) + index * 1_000).toISOString(),
    }));

    await page.goto('/team-settings/integrations');
    await openRowActions(page, 'Active reporting client');
    await page.getByRole('button', { name: 'Szczegóły: Active reporting client' }).click();
    await expect
      .poll(() => {
        const requests = runtime.journal.entries.filter(({ path }) => path.includes('/epoca_oauth_client_v1_active'));
        return {
          audit: requests.filter(({ method, path }) => method === 'GET' && path.endsWith('/audit-events')).length,
          detail: requests.filter(({ method, path }) => method === 'GET' && !path.endsWith('/audit-events')).length,
        };
      })
      .toEqual({ audit: 1, detail: 1 });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Szczegóły klienta integracji' })).toBeVisible();
    await expect(dialog.getByText('Integration Active reporting client')).toBeVisible();
    await expect(dialog.getByText('Odczyt organizacji')).toBeVisible();
    await expect(dialog.locator('[data-audit-event="true"]')).toHaveCount(20);
    await expect(dialog).not.toContainText(/clientSecret|client_secret|secretHash|access_token/i);

    await dialog.getByRole('button', { name: 'Wczytaj więcej zdarzeń audytowych' }).click();
    await expect(dialog.locator('[data-audit-event="true"]')).toHaveCount(21);
    const auditRequests = runtime.journal.entries.filter(
      ({ method, path }) => method === 'GET' && path.endsWith('/epoca_oauth_client_v1_active/audit-events')
    );
    expect(auditRequests).toHaveLength(2);
    expect(auditRequests.map(({ query }) => query.pageNumber)).toEqual([['1'], ['2']]);
    expect(
      runtime.journal.entries.some(
        ({ path, responseBody }) => path.includes('epoca_oauth_client_v1_expired') && responseBody !== undefined
      )
    ).toBe(false);
  });
});

test.describe('ordinary user OAuth isolation', () => {
  test.use({ actor: 'user' });

  test('OAuth client @mr @oauth-client ordinary user has hidden UI direct-link rejection and forced-request 403', async ({
    page,
    runtime,
  }) => {
    await page.goto('/team-settings/integrations');
    await expect(page).toHaveURL(/\/working-time$/);
    await expect(page.getByRole('heading', { name: 'Klienci integracji' })).toHaveCount(0);
    expect(runtime.journal.entries.filter(({ path }) => path.includes('/oauth-clients'))).toHaveLength(0);

    const status = await page.evaluate(
      async (path) => (await fetch(`/__e2e_api${path}?pageSize=20&pageNumber=1`)).status,
      collectionPath
    );
    expect(status).toBe(403);
    expect(runtime.state.oauthIntegration?.clients).toHaveLength(3);
  });
});
