import { expect, test, WEBKIT_INTERRUPTED_MODULE_IMPORT_ERROR } from '../fixtures/epocaTest';
import { openProjectDetails, openWorkUnitForm } from '../support/navigation';

// These specs exist for CT-525 (the CRA-to-Vite migration): they are the E2E evidence that the
// build-tool swap did not silently break the user-facing flows the app already supported. Four of
// the six scenarios below are plain regression checks -- the same kind of thing the rest of the
// `@mr` suite already covers -- run once more here specifically to anchor CT-525's own record of
// what still works. The last two (root and non-root navigation) are different: see their own
// comment below.

test.describe('anonymous login', () => {
  test.use({ world: 'world-1', actor: 'anonymous' });

  test('CT-525 @mr anonymous visitor reaches a working login page with no runtime errors', async ({ page }) => {
    await page.goto('/working-time');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('loginEmailInput')).toBeVisible();
    await expect(page.getByTestId('loginPasswordInput')).toBeVisible();
    await expect(page.getByTestId('loginButton')).toBeVisible();
    // The shared `page` fixture (tests/e2e/fixtures/epocaTest.ts) already fails this test on any
    // uncaught page error -- e.g. a stray CommonJS `require()` call (fine under webpack, fatal
    // under Vite) or any other broken module graph -- so no local `pageerror` listener is needed
    // here.
  });
});

test.describe('calendar and worklog', () => {
  test.use({ world: 'world-4', actor: 'owner' });

  test('CT-525 @mr the working-time calendar keeps showing and accepting worklogs', async ({ page, runtime }) => {
    // The taller form (project description + duration + notes fields all present at once) needs
    // more vertical space than the default viewport to keep the submit button reachable.
    await page.setViewportSize({ width: 1048, height: 900 });
    await page.goto('/working-time');

    // World-4 renders in Polish (its preseeded session persists `pl` as the user's language).
    await expect(page.getByRole('heading', { name: 'Czas pracy', exact: true })).toBeVisible();

    await openWorkUnitForm(page);
    await page
      .getByRole('group', { name: 'Co chcesz dodać?', exact: true })
      .getByRole('button', { name: 'Czas pracy', exact: true })
      .click();
    await page.getByLabel('Klienci i projekty', { exact: true }).click();
    // World-4's owner actor only owns "Large Project" (its own preseeded project) -- "Alpha
    // Project" belongs to a different owner and does not show up in this search.
    await page.getByLabel('Modal', { exact: true }).getByText('Large Project', { exact: true }).click();
    const selectedDate = page.getByLabel('Wybrana data', { exact: true });
    await selectedDate.fill('15.07.2026');
    await selectedDate.press('Enter');
    await page.getByText('Opis działań', { exact: true }).locator('..').getByRole('textbox').fill('CT-525 E2E worklog');
    await page.getByLabel('Godziny', { exact: true }).fill('1:00');

    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/work-units')
    );
    await page.getByRole('button', { name: 'Złóż raport', exact: true }).click();
    expect((await responsePromise).status()).toBe(201);

    await expect(page.getByText('CT-525 E2E worklog', { exact: true })).toBeVisible();
    const created = runtime.state.workUnits.find(({ description }) => description === 'CT-525 E2E worklog');
    expect(created).toMatchObject({ entryType: 'Worklog', date: '2026-07-15' });
  });
});

test.describe('projects and description', () => {
  test.use({ world: 'world-4', actor: 'owner' });

  test('CT-525 @mr project details keep showing and saving the description', async ({ page, runtime }) => {
    const project = runtime.state.projects.find(({ name }) => name === 'Large Project');
    expect(project).toBeDefined();

    await openProjectDetails(page, 'Large Project');
    await expect(page.getByLabel('Opis projektu', { exact: true })).toHaveValue(
      'Project with more than twenty people'
    );

    await page.getByRole('button', { name: 'Edytuj' }).click();
    const editForm = page.getByText('Edytuj projekt', { exact: true }).locator('..').locator('..');
    await editForm
      .getByText(/^Opis projektu$/)
      .locator('..')
      .locator('..')
      .getByRole('textbox')
      .fill('CT-525 opis zapisany przez E2E');
    await editForm.getByRole('button', { name: 'Zapisz' }).click();

    await expect.poll(() => runtime.journal.entries.filter(({ method }) => method === 'PATCH').length).toBe(1);
    const updatedProject = runtime.state.projects.find(({ id }) => id === project?.id);
    expect(updatedProject?.description).toBe('CT-525 opis zapisany przez E2E');
    expect(updatedProject?.name).toBe('Large Project');
    await expect(page.getByLabel('Opis projektu', { exact: true })).toHaveValue('CT-525 opis zapisany przez E2E');
  });
});

test.describe('report filters', () => {
  test.use({ world: 'world-4', actor: 'owner' });

  test('CT-525 @mr the report keeps filtering by period and showing archived history', async ({ page, runtime }) => {
    await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');

    const historicalRow = page.getByRole('row', { name: /Historyczne godziny/ });
    await expect(historicalRow.getByText('Archived User', { exact: true })).toBeVisible();
    await expect(page.getByText('Precyzyjne godziny', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Następny okres' }).click();
    await expect(page).toHaveURL(/startDate=2026-08-01.*endDate=2026-08-31/);
    await expect(page.getByText('Precyzyjne godziny', { exact: true })).toHaveCount(0);
    await expect
      .poll(() => runtime.journal.last('GET', '/organizations/epoca-e2e/work-units')?.query)
      .toMatchObject({ dateFrom: ['2026-08-01'], dateTo: ['2026-08-31'] });
  });
});

test.describe('root and non-root navigation', () => {
  test.use({ world: 'world-4', actor: 'owner' });

  // Task 6's spec-compliance review found that `Router.tsx`'s `<BrowserRouter>` took no
  // `basename` prop: nginx correctly serves `index.html` for any path under a non-root
  // `PUBLIC_URL` prefix (e.g. `/teams/epoca`), but React Router then matched routes against the
  // *full* pathname including that prefix, found nothing, and its wildcard `<Navigate>` redirected
  // to a bare, unprefixed path -- silently dropping `/teams/epoca` from the address bar. A later
  // hard reload or shared link at that dropped-prefix URL then fell outside nginx's
  // `location /teams/epoca/` block: a real 404, just not on the redirect itself.
  //
  // Fixed by wiring `basename={env.publicUrl}` into `<BrowserRouter>`. The two scenarios below
  // cover both directions:
  test('CT-525 @mr a non-root PUBLIC_URL is honored end-to-end by client-side routing', async ({ page, runtime }) => {
    runtime.setPublicUrl('/teams/epoca');

    await page.goto('/teams/epoca/working-time');

    await expect(page).toHaveURL(/\/teams\/epoca\/working-time$/);
    await expect(page.getByRole('heading', { name: 'Czas pracy', exact: true })).toBeVisible();

    // In-app navigation (not a fresh page load) must keep the prefix too -- this is exactly the
    // case that used to drop it, via the wildcard route's `<Navigate>`.
    await page.getByRole('link', { name: 'Projekty', exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/epoca\/projects$/);
    await expect(page).toHaveTitle('Epoca — Projekty');
  });

  // Regression guard for the other direction: an empty/root `PUBLIC_URL` (the default) must keep
  // resolving plain, unprefixed routes -- `basename=""` should stay a no-op.
  test('CT-525 @mr an empty (root) PUBLIC_URL leaves routing unprefixed', async ({ page, runtime }) => {
    runtime.setPublicUrl('');

    await page.goto('/working-time');

    await expect(page).toHaveURL(/\/working-time$/);
    await expect(page.getByRole('heading', { name: 'Czas pracy', exact: true })).toBeVisible();
  });
});

test.describe('lazy chunk load failure', () => {
  test.use({ world: 'world-4', actor: 'owner' });
  // A failed dynamic import also surfaces as a browser-level page error, separately from
  // ChunkLoadErrorBoundary catching it for rendering. This test deliberately causes that failure,
  // so it must allow through the one error it provokes (message differs by engine -- see
  // WEBKIT_INTERRUPTED_MODULE_IMPORT_ERROR); any other page error still fails the test.
  test.use({
    ignoredPageErrors: {
      patterns: [
        /(?:Failed to fetch|error loading) dynamically imported module.*\/src\/modules\/reports\/report\/Report\.tsx/,
        WEBKIT_INTERRUPTED_MODULE_IMPORT_ERROR,
      ],
    },
  });

  // Simulates a deploy removing a page's hashed chunk out from under an already-open tab: 404s the
  // Report chunk on a client-side navigation, then proves both halves -- the fallback appears, and
  // Reload recovers once the chunk is reachable again.
  test('CT-547 @mr a failed lazy chunk import shows a recoverable fallback instead of a blank page', async ({
    page,
  }) => {
    await page.goto('/working-time');
    await expect(page.getByRole('heading', { name: 'Czas pracy', exact: true })).toBeVisible();

    let blockReportChunk = true;
    await page.route('**/src/modules/reports/report/Report.tsx*', (route) =>
      blockReportChunk ? route.fulfill({ status: 404, body: 'Not Found' }) : route.continue()
    );

    await page.getByRole('link', { name: 'Raporty', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'Dostępna jest nowa wersja aplikacji Época. Odśwież, aby kontynuować.' })
    ).toBeVisible();

    blockReportChunk = false;
    await page.getByRole('button', { name: 'Odśwież', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Raporty', exact: true })).toBeVisible();
  });
});
