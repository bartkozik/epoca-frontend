import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/epocaTest';
import { generatedUserId, IDS } from '../worlds/ids';

const WORK_UNITS_PATH = '/organizations/epoca-e2e/work-units';
const PIVOT_QUERY_PATH = '/organizations/epoca-e2e/pivot-tables/work-units/query';
const REPORT_RANGE = 'startDate=2026-07-01&endDate=2026-07-31';
const NO_HOURS_HEADING = 'Bez godzin przy obecnych filtrach';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const optionsViewport = (page: Page): Locator => page.getByTestId('multi-search-options');
const filterInput = (page: Page, translatedLabel: string): Locator =>
  page.getByRole('combobox', { name: `${translatedLabel}:`, exact: true });
// An option's accessible name starts with its label, followed by the client, archive tag and hours.
const option = (page: Page, label: string): Locator =>
  page.getByRole('option', { name: new RegExp(`^${escapeRegExp(label)}(?: |$)`) });
// Group headings, the divider and the archived toggle are list rows next to the options.
const listRows = (page: Page): Locator => page.getByRole('listbox').locator(':scope > li');
const clearButton = (page: Page, translatedLabel: string): Locator =>
  page
    .locator('label')
    .filter({ hasText: new RegExp(`^${escapeRegExp(translatedLabel)}:$`) })
    .locator('xpath=following-sibling::button');
const urlParam = (page: Page, name: string): string | null => new URL(page.url()).searchParams.get(name);

const expectSingleVerticalOverflowOwner = async (viewport: Locator): Promise<void> => {
  const ownerCount = await viewport.evaluate((root) => {
    const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
    return candidates.filter((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      return ['auto', 'scroll'].includes(getComputedStyle(candidate).overflowY);
    }).length;
  });

  expect(ownerCount).toBe(1);
};

test.use({ world: 'world-4', actor: 'owner' });

test('@mr @multi-search-sections dzieli opcje na zaznaczone, z godzinami i bez godzin oraz filtruje wszystkie grupy', async ({
  page,
  runtime,
}) => {
  await page.goto(`/report?${REPORT_RANGE}&projects=${IDS.projectAlpha}`);

  const input = filterInput(page, 'Projekt');
  await expect(input).toHaveValue('Alpha Project');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.click();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', 'Szukaj projektu');
  // Opening a list starts loading the hours, and the option order is frozen while a list is open, so the
  // groups that the hours produce appear when the list opens again.
  await expect(option(page, 'Alpha Project')).toContainText('08:00');
  await input.press('Escape');
  await input.click();

  await expect(listRows(page)).toHaveText([
    'Zaznaczone (1)',
    /^Alpha Project/,
    '',
    /^Archived Project/,
    NO_HOURS_HEADING,
    /^Beta Project/,
    /^Large Project/,
  ]);
  await expect(option(page, 'Alpha Project')).toHaveAttribute('aria-selected', 'true');
  await expect(option(page, 'Archived Project')).toHaveAccessibleName(
    'Archived Project Archived Client Archiwum 00:30',
  );
  await expect(option(page, 'Archived Project')).not.toHaveClass(/optionInactive/);
  for (const label of ['Beta Project', 'Large Project']) {
    await expect(option(page, label)).toContainText('—');
    await expect(option(page, label)).toHaveAttribute('aria-selected', 'false');
    await expect(option(page, label)).toHaveClass(/optionInactive/);
  }
  expect(runtime.journal.entries.filter(({ path }) => path === PIVOT_QUERY_PATH)).toHaveLength(1);

  await input.fill('l');
  await expect(listRows(page)).toHaveText(['Zaznaczone (1)', /^Alpha Project/, NO_HOURS_HEADING, /^Large Project/]);
  await expect(page.getByRole('button', { name: 'Zaznacz pasujące (1)', exact: true })).toBeVisible();
  await input.fill('');
  await input.press('Escape');

  // The user list counts hours inside the selected project only.
  const userInput = filterInput(page, 'Użytkownik');
  await userInput.click();
  await expect(listRows(page).nth(0)).toHaveText(/^Regular User/);
  await expect(listRows(page).nth(1)).toHaveText(NO_HOURS_HEADING);
  await expect(option(page, 'Regular User')).toHaveAccessibleName('Regular User 08:00');
  await expect(option(page, 'Owner User')).toHaveAccessibleName('Owner User —');
  await expect(option(page, 'Owner User')).toHaveClass(/optionInactive/);
  await expect(page.getByRole('option')).toHaveCount(25);
  await userInput.press('Escape');

  // Swapping Alpha for Beta in place leaves no user with hours.
  await input.click();
  await option(page, 'Alpha Project').click();
  await option(page, 'Beta Project').click();
  await expect(option(page, 'Alpha Project')).toHaveAttribute('aria-selected', 'false');
  await expect(option(page, 'Beta Project')).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await expect(input).toHaveValue('Beta Project');
  await expect.poll(() => urlParam(page, 'projects')).toBe(IDS.projectBeta);
  await userInput.click();
  await expect(listRows(page).nth(0)).toHaveText(NO_HOURS_HEADING);
  await expect(option(page, 'Regular User')).toHaveAccessibleName('Regular User —');
  await expect(option(page, 'Regular User')).toHaveClass(/optionInactive/);
  expect(runtime.journal.entries.filter(({ path }) => path === PIVOT_QUERY_PATH)).toHaveLength(1);
});

test('@mr @multi-search-transfer zaznacza opcję w miejscu bez utraty wyszukiwania i przenosi ją do zaznaczonych po ponownym otwarciu', async ({
  page,
  runtime,
}) => {
  await page.goto(`/report?${REPORT_RANGE}`);

  const input = filterInput(page, 'Użytkownik');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', 'Wszyscy użytkownicy');
  await input.click();
  await expect(input).toHaveAttribute('placeholder', 'Szukaj użytkownika');
  await input.fill('Person 1');
  const listedPeople = Array.from({ length: 10 }, (_, index) => new RegExp(`^Person 1${index}`));
  await expect(page.getByRole('option')).toHaveText(listedPeople);
  await expect(page.getByRole('button', { name: 'Zaznacz pasujące (10)', exact: true })).toBeVisible();

  await option(page, 'Person 13').click();

  await expect(input).toHaveValue('Person 1');
  await expect(page.getByRole('option')).toHaveText(listedPeople);
  await expect(option(page, 'Person 13')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('option', { selected: true })).toHaveCount(1);
  await expect.poll(() => urlParam(page, 'users')).toBe(generatedUserId(13));

  await page.getByRole('button', { name: 'Zaznacz pasujące (9)', exact: true }).click();
  await expect(page.getByRole('option', { selected: true })).toHaveCount(10);
  await expect(page.getByRole('option')).toHaveText(listedPeople);
  await expect(page.getByRole('button', { name: /^Zaznacz pasujące/ })).toHaveCount(0);
  const selectedIds = [13, 10, 11, 12, 14, 15, 16, 17, 18, 19].map(generatedUserId);
  await expect.poll(() => urlParam(page, 'users')?.split(',')).toEqual(selectedIds);

  await input.press('Escape');
  await expect(input).toHaveValue('Person 13 +9');
  await expect(page.getByText('Użytkownik: Person 13 +9', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuń filtr: użytkownik', exact: true })).toBeVisible();
  await expect
    .poll(() => [...(runtime.journal.last('GET', WORK_UNITS_PATH)?.query.userId ?? [])].sort())
    .toEqual([...selectedIds].sort());

  await input.click();
  await expect(input).toHaveValue('');
  await expect(listRows(page).nth(0)).toHaveText('Zaznaczone (10)');
  await expect(page.getByRole('option').nth(0)).toHaveText(/^Person 10/);
  await expect(page.getByRole('option').nth(9)).toHaveText(/^Person 19/);
  await expect(page.getByRole('option').nth(10)).toHaveText(/^Regular User/);
});

test('@mr @multi-search-keyboard przełącza opcje klawiaturą, a Escape i Tab zamykają listę', async ({ page }) => {
  await page.goto(`/report?${REPORT_RANGE}&clients=${IDS.clientInternal}`);

  const input = filterInput(page, 'Klient');
  await expect(input).toHaveValue('Internal Client');
  await input.focus();
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(input).not.toHaveAttribute('aria-activedescendant', /./);
  const options = page.getByRole('option');
  const listedClients = [/^Internal Client/, /^Archived Client/, /^External Client/];
  await expect(options).toHaveText(listedClients);
  const optionIds = await options.evaluateAll((elements) => elements.map(({ id }) => id));
  await expect(input).toHaveAttribute('aria-controls', (await page.getByRole('listbox').getAttribute('id')) ?? '');

  for (const [key, highlightedIndex] of [
    ['ArrowDown', 0],
    ['ArrowDown', 1],
    ['End', 2],
    ['Home', 0],
    ['ArrowUp', 2],
  ] as const) {
    await input.press(key);
    await expect(input).toHaveAttribute('aria-activedescendant', optionIds[highlightedIndex]);
  }

  await input.press('Enter');
  await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('Home');
  await input.press(' ');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(options).toHaveText(listedClients);
  await expect(input).toHaveValue('');

  await input.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(optionsViewport(page)).toHaveCount(0);
  await expect(input).toHaveValue('External Client');
  await expect.poll(() => urlParam(page, 'clients')).toBe(IDS.clientExternal);

  await input.press('ArrowDown');
  await expect(optionsViewport(page)).toHaveJSProperty('scrollTop', 0);
  await expect(input).toHaveValue('');
  await expect(options.nth(0)).toHaveText(/^External Client/);
  await input.fill('Inter');
  await input.press('ArrowDown');
  await input.press(' ');
  await expect(input).toHaveValue('Inter ');
  await expect(page.getByText('Nie znaleziono wyników', { exact: true })).toBeVisible();
  await input.fill('Inter');
  await expect(page.getByRole('button', { name: 'Zaznacz pasujące (1)', exact: true })).toBeVisible();

  await input.press('Tab');
  await expect(optionsViewport(page)).toHaveCount(0);
  await expect(input).not.toBeFocused();
  await expect(filterInput(page, 'Projekt')).toBeFocused();
  await expect(input).toHaveValue('External Client');
});

test('@full @multi-search-mobile zachowuje jeden scroll na telefonie i komputerze, grupę zarchiwizowanych i angielskie etykiety', async ({
  page,
  runtime,
}) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/report?${REPORT_RANGE}`);

    const userInput = filterInput(page, 'Użytkownik');
    await userInput.click();
    const viewport = optionsViewport(page);
    await expectSingleVerticalOverflowOwner(viewport);
    await expect(page.getByRole('option')).toHaveCount(25);
    await expect(option(page, 'Regular User')).toContainText('08:00');
    await userInput.fill('person26@example.test');
    await expect(page.getByRole('option')).toHaveText([/^Person 26/]);
    await userInput.fill('');
    await userInput.press('Escape');
  }

  // With Regular User picked, the archived project has no hours and folds into the archived group.
  const userInput = filterInput(page, 'Użytkownik');
  await userInput.click();
  await option(page, 'Regular User').click();
  await userInput.press('Escape');
  const projectInput = filterInput(page, 'Projekt');
  await projectInput.click();
  await expect(listRows(page)).toHaveText([
    /^Alpha Project/,
    NO_HOURS_HEADING,
    /^Beta Project/,
    /^Large Project/,
    'Zarchiwizowane (1)',
  ]);
  await expect(option(page, 'Archived Project')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zarchiwizowane (1)', exact: true }).click();
  await expect(listRows(page).nth(4)).toHaveText('Zarchiwizowane (1)');
  await expect(option(page, 'Archived Project')).toHaveAccessibleName('Archived Project Archived Client Archiwum —');
  await option(page, 'Archived Project').click();
  await projectInput.press('Escape');

  await expect(page.getByText('Projekt: Archived Project', { exact: true })).toBeVisible();
  await expect(page.getByText('Użytkownik: Regular User', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wyczyść wszystko', exact: true })).toBeVisible();
  await clearButton(page, 'Projekt').click();
  await expect(projectInput).toHaveValue('');
  await expect(projectInput).toHaveAttribute('placeholder', 'Wszystkie projekty');
  await expect(page.getByText('Projekt: Archived Project', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Wyczyść wszystko', exact: true })).toHaveCount(0);
  await expect.poll(() => urlParam(page, 'projects')).toBeNull();

  const clientInput = filterInput(page, 'Klient');
  await clientInput.click();
  await option(page, 'Internal Client').click();
  await clientInput.press('Escape');
  await page.getByRole('button', { name: 'Wyczyść wszystko', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Usuń filtr:/ })).toHaveCount(0);
  await expect(clientInput).toHaveValue('');
  await expect(userInput).toHaveValue('');
  await expect.poll(() => [urlParam(page, 'clients'), urlParam(page, 'users')]).toEqual([null, null]);

  await page
    .getByRole('button')
    .filter({ has: page.getByAltText('Placeholder awatara użytkownika') })
    .click();
  await page.getByRole('button', { name: 'Zmień język', exact: true }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();

  const englishProjectInput = filterInput(page, 'Project');
  await expect(englishProjectInput).toHaveAttribute('placeholder', 'All projects');
  await englishProjectInput.click();
  await expect(englishProjectInput).toHaveAttribute('placeholder', 'Search projects');
  await option(page, 'Alpha Project').click();
  await englishProjectInput.press('Escape');
  await englishProjectInput.click();
  await expect(listRows(page)).toHaveText([
    'Selected (1)',
    /^Alpha Project/,
    '',
    /^Archived Project/,
    'No hours with the current filters',
    /^Beta Project/,
    /^Large Project/,
  ]);
  await expect(option(page, 'Archived Project')).toHaveAccessibleName(
    'Archived Project Archived Client Archived 00:30',
  );
  await englishProjectInput.fill('a');
  await expect(page.getByRole('button', { name: 'Select 3 matching', exact: true })).toBeVisible();
  await englishProjectInput.press('Escape');

  await expect(clearButton(page, 'Project')).toHaveText('Clear');
  await expect(page.getByText('Project: Alpha Project', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove project filter', exact: true })).toBeVisible();
  await expect.poll(() => urlParam(page, 'projects')).toBe(IDS.projectAlpha);
  await expect
    .poll(() => runtime.journal.last('GET', WORK_UNITS_PATH)?.query)
    .toMatchObject({
      dateFrom: ['2026-07-01'],
      dateTo: ['2026-07-31'],
      projectId: [IDS.projectAlpha],
    });
  await expect(page.getByText('1 entry', { exact: true })).toBeVisible();
});

test('@mr keeps the final MultiSearch option keyboard and scroll reachable', async ({ page }) => {
  await page.goto(`/report?${REPORT_RANGE}`);

  const input = filterInput(page, 'Użytkownik');
  await input.click();
  await input.fill('Person');
  const viewport = optionsViewport(page);
  await expect(page.getByRole('option')).toHaveCount(21);

  for (let index = 0; index < 21; index += 1) await input.press('ArrowDown');

  const finalOption = option(page, 'Person 26');
  await expect(input).toHaveAttribute('aria-activedescendant', (await finalOption.getAttribute('id')) ?? '');
  await expect(finalOption).toBeInViewport();
  const [viewportBox, optionBox] = await Promise.all([viewport.boundingBox(), finalOption.boundingBox()]);
  expect(viewportBox).not.toBeNull();
  expect(optionBox).not.toBeNull();
  expect(optionBox?.y).toBeGreaterThanOrEqual(viewportBox?.y ?? 0);
  expect((optionBox?.y ?? 0) + (optionBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportBox?.y ?? 0) + (viewportBox?.height ?? 0),
  );

  await input.press('Enter');
  await expect(finalOption).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveValue('Person');
  await input.press('Escape');
  await expect(input).toHaveValue('Person 26');
  await input.press('ArrowDown');
  await expect(listRows(page).nth(0)).toHaveText('Zaznaczone (1)');
  await expect(page.getByRole('option').nth(0)).toHaveText(/^Person 26/);
});

test('@mr keeps filtering when per-option hours fail and loads them on retry', async ({ page, runtime }) => {
  let failuresLeft = 1;
  await page.route(
    (url) => url.pathname === `/__e2e_api${PIVOT_QUERY_PATH}`,
    async (route) => {
      if (failuresLeft === 0) {
        await route.fallback();
        return;
      }
      failuresLeft -= 1;
      await route.fulfill({ status: 500, json: { message: 'E2E pivot outage' } });
    },
  );
  await page.goto(`/report?${REPORT_RANGE}`);

  const input = filterInput(page, 'Projekt');
  await input.click();
  const unavailable = page.getByText('Godziny są niedostępne. Filtrowanie działa dalej.', { exact: true });
  await expect(unavailable).toBeVisible();
  await expect(option(page, 'Alpha Project')).toHaveAccessibleName('Alpha Project Internal Client');
  await option(page, 'Alpha Project').click();
  await expect(option(page, 'Alpha Project')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => urlParam(page, 'projects')).toBe(IDS.projectAlpha);
  await expect.poll(() => runtime.journal.last('GET', WORK_UNITS_PATH)?.query.projectId).toEqual([IDS.projectAlpha]);
  await expect(page.getByText('1 wpis', { exact: true })).toBeVisible();
  expect(runtime.journal.entries.filter(({ path }) => path === PIVOT_QUERY_PATH)).toHaveLength(0);

  await page.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(option(page, 'Alpha Project')).toHaveAccessibleName('Alpha Project Internal Client 08:00');
  await expect(unavailable).toHaveCount(0);
  expect(runtime.journal.entries.filter(({ path }) => path === PIVOT_QUERY_PATH)).toHaveLength(1);
});

test.describe('as an employee', () => {
  test.use({ actor: 'user' });

  test('@mr lists options without hours and folds archived ones without asking for hours', async ({
    page,
    runtime,
  }) => {
    await page.goto(`/report?${REPORT_RANGE}`);

    const input = filterInput(page, 'Projekt');
    await input.click();
    await expect(listRows(page)).toHaveText([
      /^Alpha Project/,
      /^Beta Project/,
      /^Large Project/,
      'Zarchiwizowane (1)',
    ]);
    await expect(option(page, 'Alpha Project')).toHaveAccessibleName('Alpha Project Internal Client');
    const archivedToggle = page.getByRole('button', { name: 'Zarchiwizowane (1)', exact: true });
    const chevronBounds = await archivedToggle.locator('svg').evaluate((icon: SVGSVGElement) => {
      const painted = icon.getBBox();
      return { top: painted.y, bottom: painted.y + painted.height, viewportHeight: icon.height.baseVal.value };
    });
    expect(chevronBounds.top).toBeGreaterThanOrEqual(-0.01);
    expect(chevronBounds.bottom).toBeLessThanOrEqual(chevronBounds.viewportHeight + 0.01);
    await archivedToggle.click();
    await expect(option(page, 'Archived Project')).toHaveAccessibleName('Archived Project Archived Client Archiwum');
    await input.fill('Arch');
    await expect(listRows(page)).toHaveText(['Zarchiwizowane (1)', /^Archived Project/]);
    await input.press('Escape');

    const clientInput = filterInput(page, 'Klient');
    await clientInput.click();
    await expect(listRows(page)).toHaveText([/^External Client/, /^Internal Client/, 'Zarchiwizowane (1)']);
    await clientInput.press('Escape');
    expect(runtime.journal.entries.filter(({ path }) => path === PIVOT_QUERY_PATH)).toHaveLength(0);
  });
});
