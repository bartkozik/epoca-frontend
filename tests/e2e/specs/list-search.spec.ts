import { expect, test } from '../fixtures/epocaTest';

for (const actor of ['owner', 'user'] as const) {
  test.describe(`list search as ${actor}`, () => {
    test.use({ world: 'world-4', actor, hasTouch: true });

    for (const list of [
      { path: '/clients', placeholder: 'Wyszukaj według nazwy', match: 'Internal Client', other: 'External Client' },
      {
        path: '/projects',
        placeholder: 'Wyszukaj wg nazwy lub klienta',
        match: 'Alpha Project',
        other: 'Beta Project',
      },
    ]) {
      test(`@mr searches and resets ${list.path} at mobile and desktop widths`, async ({ page }, testInfo) => {
        // Each scenario covers five page loads and debounced URL updates on shared CI runners.
        test.setTimeout(60_000);
        for (const width of [390, 320, 767, 768, 1280]) {
          await test.step(`${width}px`, async () => {
            await page.setViewportSize({ width, height: 844 });
            await page.goto(list.path);
            const input = page.getByPlaceholder(list.placeholder);
            await expect(page.getByText(list.match, { exact: true })).toBeVisible();
            await expect(input).toBeVisible();
            await input.tap();
            await input.fill(list.match);
            await expect(page.getByText(list.match, { exact: true })).toBeVisible();
            await expect(page.getByText(list.other, { exact: true })).toHaveCount(0);
            await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(list.match);
            await input.fill('no-matching-item');
            await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('no-matching-item');
            await expect(
              page.getByText('Nie znaleziono elementów. Sprawdź swoje kryteria wyszukiwania.'),
            ).toBeVisible();
            await expect(input).toBeVisible();
            const reset = page.getByRole('button', { name: 'Resetuj', exact: true });
            await expect(reset).toBeVisible();
            await page.screenshot({ path: testInfo.outputPath(`empty-${width}.png`) });
            await reset.tap();
            await expect(input).toHaveValue('');
            await expect(page.getByText(list.match, { exact: true })).toBeVisible();
            await expect(page.getByText(list.other, { exact: true })).toBeVisible();
            const bounds = await input.boundingBox();
            expect(bounds?.x).toBeGreaterThanOrEqual(0);
            expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
            const header = await input.locator('xpath=ancestor::header').boundingBox();
            const firstRow = await page.locator('tbody tr').first().boundingBox();
            expect(header).not.toBeNull();
            expect(firstRow?.y).toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0));
            await page.screenshot({ path: testInfo.outputPath(`reset-${width}.png`) });
          });
        }
      });
    }
  });
}
