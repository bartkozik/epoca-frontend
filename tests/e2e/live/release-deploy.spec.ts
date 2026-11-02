import { expect, test } from '@playwright/test';
import { live } from './liveFlows';
import { verifyCompatibilityReads, verifySamlInitiation } from './releaseBrowser';
import { selectReleaseLanguage } from './releaseLanguage';

for (const [language, locale] of [
  ['pl', 'pl-PL'],
  ['en', 'en-US'],
] as const) {
  test.describe(language, () => {
    test.use({ locale });

    test(`CT-527 @live deploy [${language}] checks SAML initiation, login, owned worklog, project edit and reports`, async ({
      browser,
      page,
    }) => {
      const samlPage = await browser.newPage({
        baseURL: process.env.PLAYWRIGHT_LIVE_BASE_URL,
        serviceWorkers: 'block',
      });
      try {
        await verifySamlInitiation(samlPage);
      } finally {
        await samlPage.close();
      }
      await live.login(page, 'owner');
      await selectReleaseLanguage(page, language);
      await page.goto('/projects');
      await expect(page.getByText(live.manifest.projectName, { exact: true }).first()).toBeVisible();
      const before = await live.readProject(page);
      const after = await live.assignPersonAndEditDescription(page);
      expect(after.name).toBe(before.name);
      expect(after.description).toBe(live.manifest.updatedDescription);
      const report = await live.verifyPivotQueryAndExport(page);
      expect(report.cellCount).toBeGreaterThan(0);
      expect(report.csvRows).toBeGreaterThan(1);
      await verifyCompatibilityReads(page);
      const userContext = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_LIVE_BASE_URL,
        locale,
        timezoneId: 'Europe/Warsaw',
        serviceWorkers: 'block',
      });
      try {
        const userPage = await userContext.newPage();
        await live.login(userPage, 'user');
        await selectReleaseLanguage(userPage, language);
        const worklog = await live.submitWithLostResponseAndRetry(userPage, language);
        expect(worklog.reportedRows).toHaveLength(1);
        expect(worklog.keys[0]).toBe(worklog.keys[1]);
      } finally {
        await userContext.close();
      }
    });
  });
}
