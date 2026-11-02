import { expect, test } from '../fixtures/epocaTest';
import { selectReleaseLanguage } from './releaseLanguage';

for (const actor of ['owner', 'user'] as const) {
  test.describe(actor, () => {
    test.use({ world: 'world-4', actor, locale: 'pl-PL' });
    test('CT-527 @mr @technical selects and persists EN and PL regardless of browser locale', async ({ page }) => {
      await page.goto('/working-time');
      await selectReleaseLanguage(page, 'en');
      await expect(page.getByRole('heading', { name: 'Working time', exact: true })).toBeVisible();
      await selectReleaseLanguage(page, 'pl');
      await expect(page.getByRole('heading', { name: 'Czas pracy', exact: true })).toBeVisible();
    });
  });
}
