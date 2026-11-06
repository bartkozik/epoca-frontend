import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/epocaTest';
import { openProjectDetails } from '../support/navigation';
import { IDS } from '../worlds/ids';

const USER_DETAILS_PATH = '/__e2e_api/organizations/epoca-e2e/users/20000000-0000-4000-8000-000000000004/details';

interface ApiResult {
  body: unknown;
  status: number;
}

const callApi = async (page: Page, path: string, method = 'GET', body?: unknown): Promise<ApiResult> =>
  page.evaluate(
    async ({ requestBody, requestMethod, requestPath }) => {
      const response = await fetch(`/__e2e_api${requestPath}`, {
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
        headers: requestBody === undefined ? undefined : { 'content-type': 'application/json' },
        method: requestMethod,
      });
      const text = await response.text();
      return { body: text ? (JSON.parse(text) as unknown) : null, status: response.status };
    },
    { requestBody: body, requestMethod: method, requestPath: path }
  );

test.describe('projects and people', () => {
  test.use({ world: 'world-4' });

  test.describe('as owner', () => {
    test.use({ actor: 'owner' });

    test('CT-450 CT-501 @mr assigns a person and edits description without changing the name', async ({
      page,
      runtime,
    }) => {
      const project = runtime.state.projects.find(({ name }) => name === 'Beta Project');
      expect(project).toBeDefined();
      const originalName = project?.name;

      await openProjectDetails(page, 'Beta Project');
      await page.getByRole('button', { name: 'Edytuj' }).click();
      const editForm = page.getByText('Edytuj projekt', { exact: true }).locator('..').locator('..');
      await editForm
        .getByText('Członkowie projektu', { exact: true })
        .locator('..')
        .locator('..')
        .getByRole('button', { name: '+' })
        .click();
      const memberSearch = editForm.getByPlaceholder('Wyszukaj użytkowników');
      await memberSearch.click();
      await memberSearch.fill('Regular User');
      await editForm.getByText('Regular User', { exact: true }).click();
      await editForm.getByText(/^Opis projektu$/).click();
      await expect(memberSearch).toBeHidden();
      await editForm
        .getByText(/^Opis projektu$/)
        .locator('..')
        .locator('..')
        .getByRole('textbox')
        .fill('Opis zapisany przez E2E');
      const saveButton = editForm.getByRole('button', { name: 'Zapisz' });
      await saveButton.click();

      await expect.poll(() => runtime.journal.entries.filter(({ method }) => method === 'PATCH').length).toBe(1);
      const updatedProject = runtime.state.projects.find(({ id }) => id === project?.id);
      expect(updatedProject?.description).toBe('Opis zapisany przez E2E');
      expect(updatedProject?.name).toBe(originalName);
      expect(updatedProject?.memberIds).toContain('20000000-0000-4000-8000-000000000004');
      expect(runtime.journal.entries.find(({ method }) => method === 'PATCH')?.requestBody).toEqual({
        description: 'Opis zapisany przez E2E',
        memberIds: ['20000000-0000-4000-8000-000000000004'],
        name: originalName,
        ownerIds: ['20000000-0000-4000-8000-000000000002'],
      });

      await test.step('read filters and project details preserve production shapes without mutating state', async () => {
        const activeClients = (await callApi(page, '/organizations/epoca-e2e/clients')).body as {
          count: number;
          results: Array<{ id: string }>;
        };
        expect(activeClients.count).toBe(2);
        expect(activeClients.results.map(({ id }) => id)).not.toContain('30000000-0000-4000-8000-000000000003');

        const allClients = (
          await callApi(page, '/organizations/epoca-e2e/clients?includeArchived=true&includeArchivedConnections=true')
        ).body as { count: number; results: Array<{ id: string; projectCount: number }> };
        expect(allClients.count).toBe(3);
        expect(allClients.results.find(({ id }) => id === '30000000-0000-4000-8000-000000000003')).toMatchObject({
          projectCount: 1,
        });

        const projectsWithoutArchivedConnections = (
          await callApi(page, '/organizations/epoca-e2e/projects?includeArchived=true')
        ).body as { count: number; results: Array<{ id: string }> };
        expect(projectsWithoutArchivedConnections.count).toBe(3);

        const allProjects = (
          await callApi(page, '/organizations/epoca-e2e/projects?includeArchived=true&includeArchivedConnections=true')
        ).body as { count: number; results: Array<{ id: string }> };
        expect(allProjects.count).toBe(4);

        const detailsPath = '/organizations/epoca-e2e/projects/40000000-0000-4000-8000-000000000002';
        const firstDetails = (await callApi(page, detailsPath)).body as {
          description: string;
          projectUsers: Array<{ fullName: string; identities: unknown[]; role: string }>;
          userCount: number;
          userIds: string[];
        };
        expect(firstDetails).toMatchObject({
          projectUsers: expect.arrayContaining([
            expect.objectContaining({ fullName: 'Manager User', identities: expect.any(Array), role: 'Owner' }),
            expect.objectContaining({ fullName: 'Regular User', identities: expect.any(Array), role: 'Member' }),
          ]),
          userCount: 2,
          userIds: ['20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004'],
        });
        firstDetails.description = 'client-side mutation';
        expect(((await callApi(page, detailsPath)).body as { description: string }).description).toBe(
          'Opis zapisany przez E2E'
        );
      });

      await test.step('project mutations validate before atomically replacing state', async () => {
        const stateBeforeInvalidPatch = structuredClone(updatedProject);
        const invalidPatch = await callApi(
          page,
          '/organizations/epoca-e2e/projects/40000000-0000-4000-8000-000000000002',
          'PATCH',
          { description: 'partial update', name: 'Beta Project', ownerIds: [] }
        );
        expect(invalidPatch.status).toBe(400);
        expect(runtime.state.projects.find(({ id }) => id === updatedProject?.id)).toEqual(stateBeforeInvalidPatch);

        const created = await callApi(page, '/organizations/epoca-e2e/projects', 'POST', {
          clientId: '30000000-0000-4000-8000-000000000002',
          description: 'Created by handler contract',
          memberIds: [],
          name: 'Created Project',
          ownerIds: ['20000000-0000-4000-8000-000000000001'],
        });
        expect(created.status).toBe(201);
        const createdProjectId = (created.body as { id: string }).id;

        expect(
          (
            await callApi(
              page,
              `/organizations/epoca-e2e/projects/${createdProjectId}/users/20000000-0000-4000-8000-000000000003`,
              'POST',
              { role: 'Member' }
            )
          ).status
        ).toBe(204);
        expect(runtime.state.projects.find(({ id }) => id === createdProjectId)?.memberIds).toContain(
          '20000000-0000-4000-8000-000000000003'
        );

        expect(
          (
            await callApi(
              page,
              `/organizations/epoca-e2e/projects/${createdProjectId}/users/20000000-0000-4000-8000-000000000003`,
              'DELETE'
            )
          ).status
        ).toBe(204);
        expect(runtime.state.projects.find(({ id }) => id === createdProjectId)?.memberIds).not.toContain(
          '20000000-0000-4000-8000-000000000003'
        );

        const bulkUserId = '20000000-0000-4000-8000-000000000006';
        const bulkAssigned = await callApi(page, `/organizations/epoca-e2e/projects/all/users/${bulkUserId}`, 'POST', {
          clientType: 'External',
        });
        expect(bulkAssigned).toMatchObject({
          body: {
            changedProjectIds: expect.arrayContaining(['40000000-0000-4000-8000-000000000002', createdProjectId]),
          },
          status: 200,
        });

        const bulkRemoved = await callApi(page, `/organizations/epoca-e2e/projects/all/users/${bulkUserId}`, 'PATCH', {
          clientType: 'External',
        });
        expect(bulkRemoved).toMatchObject({
          body: {
            changedProjectIds: expect.arrayContaining(['40000000-0000-4000-8000-000000000002', createdProjectId]),
          },
          status: 200,
        });

        expect((await callApi(page, `/organizations/epoca-e2e/projects/${createdProjectId}`, 'DELETE')).status).toBe(
          204
        );
        expect(runtime.state.projects.find(({ id }) => id === createdProjectId)?.archivedAt).not.toBeNull();
        expect(
          (await callApi(page, `/organizations/epoca-e2e/projects/${createdProjectId}/unarchive`, 'POST')).status
        ).toBe(204);
        expect(runtime.state.projects.find(({ id }) => id === createdProjectId)?.archivedAt).toBeNull();

        const createdBeforeRoleChange = structuredClone(
          runtime.state.projects.find(({ id }) => id === createdProjectId)
        );
        const roleChangeWithoutOwner = await callApi(
          page,
          `/organizations/epoca-e2e/projects/${createdProjectId}/users/20000000-0000-4000-8000-000000000001`,
          'POST',
          { role: 'Member' }
        );
        const createdAfterRoleChange = structuredClone(
          runtime.state.projects.find(({ id }) => id === createdProjectId)
        );

        const alphaProjectId = '40000000-0000-4000-8000-000000000001';
        const alphaBeforeOwnerRemoval = structuredClone(runtime.state.projects.find(({ id }) => id === alphaProjectId));
        const removeLastOwner = await callApi(
          page,
          `/organizations/epoca-e2e/projects/${alphaProjectId}/users/20000000-0000-4000-8000-000000000003`,
          'DELETE'
        );
        const alphaAfterOwnerRemoval = structuredClone(runtime.state.projects.find(({ id }) => id === alphaProjectId));

        const projectsBeforeBulkOwnerRemoval = structuredClone(runtime.state.projects);
        const bulkRemoveLastOwner = await callApi(
          page,
          '/organizations/epoca-e2e/projects/all/users/20000000-0000-4000-8000-000000000002',
          'PATCH',
          { clientType: 'External' }
        );
        const projectsAfterBulkOwnerRemoval = structuredClone(runtime.state.projects);

        expect(roleChangeWithoutOwner.status).toBe(400);
        expect(createdAfterRoleChange).toEqual(createdBeforeRoleChange);
        expect(removeLastOwner.status).toBe(400);
        expect(alphaAfterOwnerRemoval).toEqual(alphaBeforeOwnerRemoval);
        expect(bulkRemoveLastOwner.status).toBe(400);
        expect(projectsAfterBulkOwnerRemoval).toEqual(projectsBeforeBulkOwnerRemoval);
      });
    });

    test('CT-516 @mr preserves every person in a project with more than twenty people', async ({ page, runtime }) => {
      const project = runtime.state.projects.find(({ name }) => name === 'Large Project');
      expect(project).toBeDefined();
      const expectedDescription = project?.description;
      const expectedMemberIds = [...(project?.memberIds ?? [])];
      const expectedName = project?.name;
      const expectedOwnerIds = [...(project?.ownerIds ?? [])];
      const projectPath = `/organizations/epoca-e2e/projects/${project?.id}`;

      await openProjectDetails(page, 'Large Project');
      await page.getByRole('button', { name: 'Edytuj' }).click();
      const grouped = page.getByRole('button', { name: /Pokaż pozostałych użytkowników/ });
      await expect(grouped).toBeVisible();
      await grouped.click();
      await expect(page.getByText('Person 26', { exact: true })).toBeVisible();
      await grouped.press('Escape');
      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect
        .poll(
          () => runtime.journal.entries.filter(({ method, path }) => method === 'PATCH' && path === projectPath).length
        )
        .toBe(1);
      const patches = runtime.journal.entries.filter(({ method, path }) => method === 'PATCH' && path === projectPath);
      expect(patches).toHaveLength(1);
      expect(patches[0].responseStatus).toBe(200);
      expect(patches[0].requestBody).toEqual({
        description: expectedDescription,
        memberIds: expectedMemberIds,
        name: expectedName,
        ownerIds: expectedOwnerIds,
      });
      expect(runtime.state.projects.find(({ id }) => id === project?.id)?.memberIds).toEqual(expectedMemberIds);
    });

    test('CT-539 @mr seeds the client edit form texture swatch with the resolved asset for an old-format hashed value', async ({
      page,
    }) => {
      await page.goto(`/clients/${IDS.clientInternal}/client-details`);

      const textureSwatch = page.getByTestId('clientTextureSwatch');
      await expect(textureSwatch).toBeVisible();
      await expect(textureSwatch).toHaveCSS('background-image', /\/theme\/assets\/images\/textures\/texture7\.png"\)$/);
    });

    test('CT-65 @mr renders the client logo in the client details page title for a client with a logo', async ({
      page,
    }) => {
      const logoUrl = 'https://static.e2e.test/clients/external-logo.png';
      await page.route(logoUrl, (route) =>
        route.fulfill({
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64'
          ),
          contentType: 'image/png',
          status: 200,
        })
      );
      const logoResponse = page.waitForResponse(logoUrl);
      await page.goto(`/clients/${IDS.clientExternal}/client-details`);

      const clientLogo = page.getByTestId('clientLogo');
      await expect(clientLogo).toBeVisible();
      await expect(clientLogo).toHaveCSS('background-image', `url("${logoUrl}")`);
      expect((await logoResponse).ok()).toBe(true);
      await expect
        .poll(() =>
          page.evaluate(
            (src) =>
              new Promise<number>((resolve) => {
                const image = new Image();
                image.onload = () => resolve(image.naturalWidth);
                image.onerror = () => resolve(0);
                image.src = src;
              }),
            logoUrl
          )
        )
        .toBeGreaterThan(0);
    });

    test('CT-65 @mr falls back to the client name initial in the client details page title for a client without a logo', async ({
      page,
    }) => {
      await page.goto(`/clients/${IDS.clientInternal}/client-details`);

      const clientLogo = page.getByTestId('clientLogo');
      await expect(clientLogo).toBeVisible();
      await expect(clientLogo).toHaveCSS('background-image', 'none');
      await expect(clientLogo).toHaveText('I');
    });

    test('CT-65 @mr keeps a long unbroken client name within the client details page title at a mobile viewport', async ({
      page,
      runtime,
    }) => {
      const client = runtime.state.clients.find(({ id }) => id === IDS.clientExternal);
      if (!client) throw new Error('External Client fixture is missing');
      client.name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/clients/${IDS.clientExternal}/client-details`);

      const heading = page.getByRole('heading', { level: 2, name: client.name });
      await expect(heading).toBeVisible();
      const overflow = await heading.evaluate((element) => {
        const container = element.parentElement as HTMLElement;
        const headingBox = element.getBoundingClientRect();
        const containerBox = container.getBoundingClientRect();
        return {
          headingRight: headingBox.right,
          containerRight: containerBox.right,
          scrollOverflow: element.scrollWidth - element.clientWidth,
        };
      });
      expect(overflow.headingRight).toBeLessThanOrEqual(overflow.containerRight + 0.5);
      expect(overflow.scrollOverflow).toBeLessThanOrEqual(0);
    });
  });

  test.describe('as regular user', () => {
    test.use({ actor: 'user' });

    test('CT-539 @mr requests the resolved texture asset on the calendar for a client with an old-format hashed value', async ({
      page,
    }) => {
      const [textureRequest] = await Promise.all([
        page.waitForRequest(
          (request) =>
            request.resourceType() === 'image' &&
            new URL(request.url()).pathname === '/src/core/theme/assets/images/textures/texture7.png'
        ),
        page.goto('/working-time'),
      ]);

      await expect(page.getByText('Precyzyjne godziny', { exact: true })).toBeVisible();
      expect(new URL(textureRequest.url()).pathname).toBe('/src/core/theme/assets/images/textures/texture7.png');
    });
  });

  test.describe('as manager', () => {
    test.use({ actor: 'manager' });

    test('CT-441 @mr allows manager to read organization user project details', async ({ page, runtime }) => {
      await page.goto('/working-time');
      const fetchDetails = async (): Promise<{ body: unknown; status: number }> =>
        page.evaluate(async (path) => {
          const result = await fetch(path);
          return { body: (await result.json()) as unknown, status: result.status };
        }, USER_DETAILS_PATH);

      const expectedProjects = [
        {
          clientId: '30000000-0000-4000-8000-000000000001',
          clientName: 'Internal Client',
          projectId: '40000000-0000-4000-8000-000000000001',
          projectName: 'Alpha Project',
          role: 'Employee',
        },
      ];

      const managerResponse = await fetchDetails();
      expect(managerResponse.status).toBe(200);
      expect(managerResponse.body).toEqual(expectedProjects);

      runtime.setActor('owner');
      const ownerResponse = await fetchDetails();
      expect(ownerResponse.status).toBe(200);
      expect(ownerResponse.body).toEqual(expectedProjects);

      runtime.setActor('user');
      const employeeResponse = await fetchDetails();
      expect(employeeResponse.status).toBe(403);
      expect(employeeResponse.body).toEqual({ message: 'Forbidden' });

      const externalActor = runtime.state.actors.user;
      if (!externalActor) throw new Error('User actor is unavailable');
      externalActor.organizationRoles = ['External'];
      const externalResponse = await fetchDetails();
      expect(externalResponse.status).toBe(403);
      expect(externalResponse.body).toEqual({ message: 'Forbidden' });
      externalActor.organizationRoles = ['Employee'];
    });
  });
});
