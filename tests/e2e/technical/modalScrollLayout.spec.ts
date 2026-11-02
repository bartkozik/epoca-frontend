import { expect, test } from '@playwright/test';
import path from 'path';
import { compile } from 'sass';

const styles = (file: string): string =>
  compile(path.resolve(__dirname, '../../../src', file), {
    loadPaths: [path.resolve(__dirname, '../../../src')],
  }).css;
const shared = styles('core/theme/modal/Modal.module.scss')
  .replace(/\.root\b/g, '.sharedModal')
  .replace(/\.overlay\b/g, '.sharedOverlay');
const cases = [
  { name: 'shared modal', css: '', modal: '', overlay: '' },
  {
    name: 'report editor',
    css:
      styles('modules/reports/report/reportBoard/ReportBoard.module.scss') +
      styles('modules/reports/report/workUnitOverride/WorkUnitOverrideForm.module.scss'),
    modal: 'modal reportEditModal',
    overlay: 'modalOverlay',
  },
  ...['OneTimeCredentialsModal', 'IntegrationClientDetailsModal', 'IntegrationClientConfirmationModal'].map(
    (name) => ({ name, css: styles(`modules/teamSettings/integrations/${name}.module.scss`), modal: 'modal', overlay: '' }),
  ),
];

for (const width of [1280, 390]) {
  for (const scenario of cases) {
    test(`@full @technical ${scenario.name} scrolls on its overlay at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 600 });
      await page.setContent(`
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; }
          ${shared}
          ${scenario.css}
        </style>
        <div class="sharedOverlay ${scenario.overlay}" data-testid="overlay">
          <div role="dialog" class="sharedModal ${scenario.modal}">
            <button type="button">Close</button>
            <div style="height:1100px">Long form</div>
            <button type="button">Save</button>
          </div>
        </div>
      `);
      const dialog = page.getByRole('dialog');
      const overlay = page.getByTestId('overlay');
      expect(await dialog.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
      await expect(page.getByRole('button', { name: 'Close' })).toBeInViewport();
      expect(await overlay.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      await page.getByRole('button', { name: 'Save' }).focus();
      await expect(page.getByRole('button', { name: 'Save' })).toBeInViewport();
      expect(await overlay.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
      await page.getByRole('button', { name: 'Close' }).focus();
      await expect(page.getByRole('button', { name: 'Close' })).toBeInViewport();
      expect(await overlay.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

      await dialog.locator('div').evaluate((el) => { el.style.height = '40px'; });
      const bounds = await dialog.boundingBox();
      expect(Math.abs(bounds!.y + bounds!.height / 2 - 300)).toBeLessThan(2);
    });
  }
}
