import { createActorToken } from './fixtures/auth';
import { expect, test } from './fixtures/epocaTest';
import {
  changeInvitationRecipient,
  configureInvitationDelivery,
  invitationFixtureRows,
  invitationHandlers,
  seedInvitationRecipient,
} from './fixtures/handlers/invitationHandlers';
import { createMockApiDispatcher, parseMockRequest } from './fixtures/mockApi';

test.describe('invitation administration', () => {
  test.use({ world: 'world-4', actor: 'owner' });
  for (const status of [403, 404]) {
    test(`CT-208 @mr keeps both tabs while invitation access loads or is denied (${status})`, async ({ page }) => {
      await page.setViewportSize({ width: status === 403 ? 1280 : 390, height: 900 });
      let releaseRequest!: () => void;
      const pendingAccess = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      const invitationListUrl = '**/organizations/epoca-e2e/invitations?*';
      await page.route(invitationListUrl, async (route) => {
        await pendingAccess;
        await route.fulfill({ status, json: { type: 'not-found' } });
      });
      await page.goto('/team-settings/members/list');
      const members = page.getByRole('button', { name: 'Członkowie', exact: true });
      const invitations = page.getByRole('button', { name: 'Zaproszenia', exact: true });
      await expect(members).toBeEnabled();
      await expect(invitations).toBeVisible();
      await expect(invitations).toBeDisabled();
      await expect(invitations).toHaveAttribute('aria-busy', 'true');
      const widthWhileLoading = (await invitations.boundingBox())?.width;
      expect(widthWhileLoading).toBeGreaterThan(0);
      const deniedResponse = page.waitForResponse(
        (response) => response.url().includes('/organizations/epoca-e2e/invitations?') && response.status() === status,
      );
      releaseRequest();
      await deniedResponse;
      await page.clock.runFor(1500);
      await expect(members).toBeEnabled();
      await expect(invitations).toBeVisible();
      await expect(invitations).toBeDisabled();
      await expect(invitations).not.toHaveAttribute('aria-busy');
      expect((await invitations.boundingBox())?.width).toBe(widthWhileLoading);
      await expect(page).toHaveURL(/\/team-settings\/members\/list$/);

      await page.unroute(invitationListUrl);
      await page.reload();
      await expect(invitations).toBeEnabled();
      await expect(invitations).not.toHaveAttribute('aria-busy');
      expect((await invitations.boundingBox())?.width).toBe(widthWhileLoading);
      await invitations.click();
      await expect(page).toHaveURL(/\/team-settings\/members\/invitations$/);
    });
  }
  for (const outcome of ['Sent', 'Failed'] as const) {
    test(`CT-208 @mr keeps resend cooldown and waits for asynchronous ${outcome} delivery`, async ({
      page,
      runtime,
    }) => {
      const invitation = seedInvitationRecipient(runtime);
      configureInvitationDelivery(runtime, outcome, { delayMs: 4000, cooldownSeconds: 60 });
      const startedAt = Date.parse(runtime.state.clock) + 120000;
      runtime.state.clock = new Date(startedAt).toISOString();
      await page.clock.install({ time: new Date(startedAt) });
      await page.goto('/team-settings/members/invitations');
      const row = page.locator(`[data-invitation-id="${invitation.id}"]`);
      const resend = row.getByRole('button', { name: 'Wyślij ponownie', exact: true });
      const startedMessage = 'Zaproszenie zapisane. Trwa wysyłanie wiadomości.';
      const finalMessage =
        outcome === 'Sent'
          ? 'Zaproszenie zapisane, a wiadomość wysłana.'
          : 'Zaproszenie zapisane. Nie udało się wysłać wiadomości.';

      await resend.click();
      await expect(resend).toBeDisabled();
      await expect(row.getByRole('timer')).toContainText(/(?:59|60) s\./);
      await expect(page.getByText(startedMessage, { exact: true })).toHaveCount(2);
      await expect(page.getByText(finalMessage, { exact: true })).toHaveCount(0);
      await page.getByRole('columnheader', { name: /Nazwa użytkownika/ }).click();
      await expect(resend).toBeDisabled();

      runtime.state.clock = new Date(startedAt + 5000).toISOString();
      await page.clock.fastForward(5000);
      await expect(page.getByText(finalMessage, { exact: true })).toHaveCount(2);
      await expect(resend).toBeDisabled();
      await expect(row.getByRole('timer')).toContainText(/5[0-5] s\./);

      await page.getByRole('button', { name: 'Członkowie', exact: true }).click();
      await page.getByRole('button', { name: 'Zaproszenia', exact: true }).click();
      await expect(resend).toBeDisabled();
      await expect(page.getByText(finalMessage, { exact: true })).toHaveCount(2);
      await page.reload();
      await expect(resend).toBeDisabled();
      await expect(row.getByRole('timer')).toContainText(/5[0-5] s\./);
      await expect(page.getByText(finalMessage, { exact: true })).toHaveCount(1);

      runtime.state.clock = new Date(startedAt + 60000).toISOString();
      await page.clock.fastForward(55000);
      await expect(row.getByRole('timer')).toHaveCount(0);
      await expect(resend).toBeEnabled();
    });
  }

  for (const width of [1280, 811, 390]) {
    test(`CT-208 @mr sorts invitations from the table headers at ${width}px`, async ({ page, runtime }) => {
      await page.setViewportSize({ width, height: 900 });
      const dispatcher = createMockApiDispatcher(runtime, invitationHandlers);

      for (const [firstName, role] of [
        ['Piotr', 'Employee'],
        ['Anna', 'Manager'],
      ]) {
        const response = await dispatcher.dispatch(
          parseMockRequest({
            method: 'POST',
            url: 'http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/invitations?version=2',
            headers: { 'Idempotency-Key': firstName },
            body: {
              firstName,
              lastName: 'Invited',
              email: `${firstName.toLowerCase()}@example.test`,
              role,
              locale: 'pl',
            },
          }),
        );
        expect(response?.status).toBe(201);
      }

      await page.goto('/team-settings/members/invitations');
      const rows = page.locator('[data-invitation-id]');
      const nameHeader = page.getByRole('columnheader', { name: /Nazwa użytkownika/ });
      const roleHeader = page.getByRole('columnheader', { name: /Rola użytkownika/ });
      await expect(rows).toHaveText([/Anna Invited/, /Piotr Invited/]);
      const reads = (): number =>
        runtime.journal.entries.filter((entry) => entry.method === 'GET' && entry.path.endsWith('/invitations')).length;
      const readsBefore = reads();

      await nameHeader.click();
      await expect(rows).toHaveText([/Piotr Invited/, /Anna Invited/]);
      await nameHeader.click();
      await expect(rows).toHaveText([/Anna Invited/, /Piotr Invited/]);

      if (width >= 768) {
        await roleHeader.click();
        await expect(rows).toHaveText([/Anna Invited/, /Piotr Invited/]);
        await roleHeader.click();
        await expect(rows).toHaveText([/Piotr Invited/, /Anna Invited/]);
      } else {
        await nameHeader.click();
      }

      expect(reads()).toBe(readsBefore);
      await page.reload();
      await expect(rows).toHaveText([/Piotr Invited/, /Anna Invited/]);

      await page.getByRole('button', { name: 'Członkowie', exact: true }).click();
      await expect(page.locator('tbody tr').first()).toContainText('Manager User');
      await nameHeader.click();
      await expect(page.locator('tbody tr').first()).toContainText('Regular User');
    });
  }

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 992, height: 900 },
    { width: 811, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`CT-208 @mr creates a minimal invitation and manages pending roles at ${viewport.width}px`, async ({
      page,
      runtime,
    }) => {
      await page.setViewportSize(viewport);
      configureInvitationDelivery(runtime, 'Failed');
      const membersBefore = runtime.state.users.length;
      await page.goto('/team-settings/members/list');
      const expectControlsToFit = async (): Promise<void> => {
        for (const name of ['Członkowie', 'Zaproszenia', 'Dodaj członka zespołu']) {
          const button = page.getByRole('button', { name, exact: true });
          await expect(button).toBeVisible();
          await expect
            .poll(() =>
              button.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return bounds.left >= 0 && bounds.right <= window.innerWidth;
              }),
            )
            .toBe(true);
        }
      };
      await expectControlsToFit();
      await page.getByRole('button', { name: 'Dodaj członka zespołu', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Dodaj członka zespołu' });
      await expect(dialog.getByLabel('Imię', { exact: true })).toBeFocused();
      await dialog.getByLabel('Imię', { exact: true }).fill('Anna');
      await dialog.getByLabel('Nazwisko', { exact: true }).fill('Invited');
      await dialog.getByLabel('E-mail', { exact: true }).fill('anna@example.test');
      await expect(dialog.getByLabel('Rola', { exact: true })).toHaveValue('Pracownik');
      await dialog.getByRole('button', { name: 'Zamknij', exact: true }).click();
      await page.getByRole('button', { name: 'Wróć do edycji', exact: true }).click();
      await expect(dialog.getByLabel('Imię', { exact: true })).toHaveValue('Anna');
      await dialog.getByRole('button', { name: 'Utwórz zaproszenie', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/team-settings\/members\/invitations$/);
      const row = page.locator('[data-invitation-id]').filter({ hasText: 'anna@example.test' });
      await expect(row).toContainText('oczekuje na przyjęcie');
      await expect(row).toContainText('Nie udało się wysłać wiadomości');
      await expectControlsToFit();
      await expect
        .poll(() =>
          page.getByRole('table', { name: 'Zaproszenia', exact: true }).evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= window.innerWidth;
          }),
        )
        .toBe(true);
      expect(runtime.state.users).toHaveLength(membersBefore);
      expect(invitationFixtureRows(runtime)[0]).toMatchObject({ roles: ['Employee'] });
      const listReads = (): number =>
        runtime.journal.entries.filter(
          (entry) => entry.method === 'GET' && entry.path === '/organizations/epoca-e2e/invitations',
        ).length;
      const readsBeforeSwitching = listReads();
      await page.getByRole('button', { name: 'Członkowie', exact: true }).click();
      await expect(page).toHaveURL(/\/team-settings\/members\/list$/);
      await expect(row).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(/\/team-settings\/members\/invitations$/);
      await expect(row).toBeVisible();
      expect(listReads()).toBe(readsBeforeSwitching);
      await page.reload();
      await expect(page).toHaveURL(/\/team-settings\/members\/invitations$/);
      await expect(row).toBeVisible();
      await row.getByLabel('Rola', { exact: true }).and(row.locator(':visible')).click();
      await page.getByRole('option', { name: 'Menedżer', exact: true }).click();
      await expect.poll(() => invitationFixtureRows(runtime)[0].roles).toEqual(['Manager']);
      configureInvitationDelivery(runtime, 'Sent');
      await row.getByRole('button', { name: 'Wyślij ponownie', exact: true }).click();
      await expect(row).toContainText('wiadomość wysłana');
      await row.getByRole('button', { name: 'Anuluj zaproszenie', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Anuluj zaproszenie', exact: true }).click();
      await expect(row).toHaveCount(0);
      expect(invitationFixtureRows(runtime)[0].status).toBe('Cancelled');
    });
  }
});

test.describe('invitation recipient', () => {
  test.use({ world: 'world-4', actor: 'anonymous' });
  test('CT-208 @mr keeps a new invitation through expired-session reauthentication', async ({
    page,
    runtime,
    worldData,
  }) => {
    const email = worldData.actors.owner!.email;
    const fixture = seedInvitationRecipient(runtime, 'SignIn', false, email);
    const segments = createActorToken(runtime.state, 'owner').split('.');
    const user = JSON.parse(Buffer.from(segments[1], 'base64url').toString()) as { exp: number };
    user.exp = 1;
    const expired = `${segments[0]}.${Buffer.from(JSON.stringify(user)).toString('base64url')}.${segments[2]}`;
    // Seed after the anonymous fixture has initialized; init script ordering is unspecified.
    await page.goto('/invitations/sign-in?joined=1');
    await expect(page.getByTestId('loginEmailInput')).toBeVisible();
    await page.evaluate(
      ({ expired, user }) => {
        localStorage.setItem(
          `IteratorsEpoca__auth__access_tok_${window.location.hostname}`,
          JSON.stringify({ token: expired, user }),
        );
      },
      { expired, user },
    );
    // Match InvitationAccessRouter: rejected bearer credentials prevent cookie creation.
    await page.route('**/__e2e_api/invitation-access/exchange', async (route) => {
      if (route.request().headers().authorization === `Bearer ${expired}`)
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ type: 'result:invitation:sign-in-required' }),
        });
      else await route.fallback();
    });
    await page.goto(`/invitations/accept#token=${fixture.token}`);
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await page.getByTestId('loginEmailInput').fill(email);
    await page.getByTestId('loginPasswordInput').fill('E2e-password-1!');
    await page.getByTestId('loginButton').click();
    await expect(page).toHaveURL(/\/invitations\/accept$/);
    await expect(page.getByTestId('invitationSubmit')).toBeVisible();
    expect(invitationFixtureRows(runtime)[0].status).toBe('Pending');
    await page.getByTestId('invitationSubmit').click();
    await expect(page).toHaveURL(/\/working-time$/);
  });
  test('CT-208 @mr retries a disconnected exchange without reopening the email link', async ({ page, runtime }) => {
    const fixture = seedInvitationRecipient(runtime);
    let exchanges = 0;
    await page.route('**/__e2e_api/invitation-access/exchange', async (route) => {
      exchanges++;
      if (exchanges <= 2) await route.abort('internetdisconnected');
      else await route.fallback();
    });
    await page.goto(`/invitations/accept#token=${fixture.token}`);
    await expect(page.getByRole('alert')).toContainText('Try again');
    await expect(page).toHaveURL(/\/invitations\/accept$/);
    expect(exchanges).toBe(1);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect.poll(() => exchanges).toBe(2);
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByTestId('invitationPassword')).toBeVisible();
    expect(exchanges).toBe(3);
  });
  test('CT-208 @mr recovers normal SSO when refresh token storage fails', async ({ page, runtime }) => {
    await page.addInitScript(() => {
      // Invoke the saved native method with the original Storage receiver below.
      // eslint-disable-next-line vitest/unbound-method
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string): void {
        if (key === `IteratorsEpoca__auth__ref_tok_${window.location.hostname}`)
          throw new DOMException('Synthetic storage quota failure', 'QuotaExceededError');
        setItem.call(this, key, value);
      };
    });
    let exchanges = 0;
    await page.route('**/__e2e_api/organizations/epoca-e2e/saml/login', async (route) => {
      exchanges++;
      runtime.setActor('owner');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: createActorToken(runtime.state, 'owner'), refreshToken: 'e2e-refresh' }),
      });
    });
    await page.goto('/login-sso#token=mock-saml-callback&slug=epoca-e2e');
    await expect(page).toHaveURL(/\/invitations\/sign-in\?errorCode=unknown&reason=unknown&sessionRecovery=1$/);
    await expect(page.getByTestId('loginEmailInput')).toBeVisible();
    expect(exchanges).toBe(1);
    await expect(page.getByTestId('invitationSubmit')).toHaveCount(0);
  });
  test('CT-208 @mr removes fragment, restores context and requires confirmation of changed roles', async ({
    page,
    runtime,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fixture = seedInvitationRecipient(runtime);
    await page.goto(`/invitations/accept#token=${fixture.token}`);
    await expect(page.getByTestId('invitationPassword')).toBeVisible();
    await expect(page).toHaveURL(/\/invitations\/accept$/);
    await page.reload();
    await page.getByTestId('invitationPassword').fill('Test-password-1!');
    await page.getByTestId('invitationConfirmation').fill('Mismatch');
    await page.getByTestId('invitationSubmit').click();
    await expect(page.getByRole('alert')).toContainText('same password');
    expect(runtime.journal.entries.filter((entry) => entry.path === '/invitation-access/password')).toHaveLength(0);
    runtime.setActor('owner');
    await createMockApiDispatcher(runtime, invitationHandlers).dispatch(
      parseMockRequest({
        method: 'PATCH',
        url: `http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/invitations/${fixture.id}?version=2`,
        body: { expectedRevision: '0', role: 'Manager' },
      }),
    );
    runtime.setActor('anonymous');
    await page.getByTestId('invitationConfirmation').fill('Test-password-1!');
    await page.getByTestId('invitationSubmit').click();
    await expect(page.getByRole('alert')).toContainText('invitation has changed');
    await expect(page.getByText('Manager', { exact: true })).toBeVisible();
    expect(invitationFixtureRows(runtime)[0].status).toBe('Pending');
    await page.getByTestId('invitationSubmit').click();
    await expect(page).toHaveURL(/\/working-time$/);
  });
  test('CT-208 @mr signs in an existing recipient before explicit acceptance', async ({ page, runtime, worldData }) => {
    const email = worldData.actors.owner!.email;
    const fixture = seedInvitationRecipient(runtime, 'SignIn', false, email);
    await page.goto(`/invitations/accept#token=${fixture.token}`);
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await page.getByTestId('loginEmailInput').fill(email);
    await page.getByTestId('loginPasswordInput').fill('E2e-password-1!');
    await page.getByTestId('loginButton').click();
    await expect(page).toHaveURL(/\/invitations\/accept$/);
    await expect(page.getByTestId('invitationPassword')).toHaveCount(0);
    await expect(page.getByTestId('invitationSubmit')).toBeVisible();
    expect(invitationFixtureRows(runtime)[0].status).toBe('Pending');
    await page.getByTestId('invitationSubmit').click();
    await expect(page).toHaveURL(/\/working-time$/);
  });
  test('CT-208 @mr refuses expired, resent and cancelled recipient links', async ({ page, runtime }) => {
    for (const operation of ['expired', 'resent', 'cancelled']) {
      const fixture = seedInvitationRecipient(runtime);
      if (operation === 'expired')
        runtime.state.clock = new Date(Date.parse(runtime.state.clock) + 7 * 86400_000).toISOString();
      else {
        runtime.setActor('owner');
        await createMockApiDispatcher(runtime, invitationHandlers).dispatch(
          parseMockRequest({
            method: operation === 'resent' ? 'POST' : 'DELETE',
            url: `http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/invitations/${fixture.id}${operation === 'resent' ? '/resend?version=2' : '?version=2&expectedRevision=0'}`,
            headers: { 'Idempotency-Key': 'stale-link-case' },
            body: { expectedRevision: '0' },
          }),
        );
        runtime.setActor('anonymous');
      }
      await page.goto(`/invitations/accept#token=${fixture.token}`);
      await expect(page.getByRole('alert')).toContainText('unavailable');
      await expect(page.getByTestId('invitationPassword')).toHaveCount(0);
      await expect(page.getByTestId('invitationSubmit')).toHaveCount(0);
    }
  });
  for (const action of ['SignIn', 'VerifyLegacySso'] as const) {
    test(`CT-208 @mr shows ${action} continuation without an existing-password form`, async ({ page, runtime }) => {
      const fixture = seedInvitationRecipient(runtime, action, true);
      await page.goto(`/invitations/accept#token=${fixture.token}`);
      await expect(page.getByTestId('invitationSso')).toBeVisible();
      await expect(page.getByTestId('invitationPassword')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
      if (action === 'VerifyLegacySso') await expect(page.getByText(/open the original invitation link/)).toBeVisible();
      await page.route('**/mock-idp?*', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<p>Mock identity provider handoff</p>' }),
      );
      await page.getByTestId('invitationSso').click();
      await expect(page).toHaveURL(/\/mock-idp\?SAMLRequest=/);
      changeInvitationRecipient(runtime, fixture.id, 'Accept');
      await page.goto('/invitations/accept');
      await expect(page.getByTestId('invitationSubmit')).toBeVisible();
      await expect(page.getByTestId('invitationPassword')).toHaveCount(0);
      await page.getByTestId('invitationSubmit').click();
      await expect(page).toHaveURL(/\/working-time$/);
    });
  }
});
