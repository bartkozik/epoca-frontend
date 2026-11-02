import { test } from '@playwright/test';
import { loginReadOnly, verifyCompatibilityReads, verifySamlInitiation } from './releaseBrowser';

test('CT-527 @live rollback reads prepared project worklog report and export without mutations', async ({ page }) => {
  await verifySamlInitiation(page);
  await loginReadOnly(page);
  await verifyCompatibilityReads(page);
});
