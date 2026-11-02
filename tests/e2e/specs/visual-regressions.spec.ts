import { expect, test } from '../fixtures/epocaTest';

const PROJECT_DESCRIPTION_TOOLTIP = 'Tutaj zostanie wyświetlony opis projektu, po wybraniu projektu, który go posiada.';
const PINNED_VISUAL_PLATFORM = 'playwright-1.49.1-noble';
const shouldComparePinnedVisual = process.env.EPOCA_E2E_VISUAL_PLATFORM === PINNED_VISUAL_PLATFORM;

test.use({ world: 'world-5', actor: 'user' });

test('ct-513-info-icon-follow-up @mr @visual keeps project InfoIcon and Tooltip typography shared', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The approved visual baseline is Chromium-only');
  const googleFontRequests: string[] = [];
  const finishedFontRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      googleFontRequests.push(request.url());
    }
  });
  page.on('requestfinished', (request) => {
    if (request.resourceType() === 'font') finishedFontRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1048, height: 900 });
  await page.goto('/working-time');
  await page.getByRole('button', { name: '+ Dodaj aktywność', exact: true }).first().click();
  await page.getByLabel('Klienci i projekty', { exact: true }).click();
  await page.getByLabel('Modal', { exact: true }).getByText('Alpha Project', { exact: true }).click();

  const tooltip = page.locator('[role="tooltip"]').filter({ hasText: PROJECT_DESCRIPTION_TOOLTIP });
  await expect(tooltip).toHaveText(PROJECT_DESCRIPTION_TOOLTIP);
  const tooltipId = await tooltip.getAttribute('id');
  if (!tooltipId) throw new Error('Project description tooltip must have an ID');

  const projectInfo = page.locator(`[aria-describedby~="${tooltipId}"]`);
  await projectInfo.focus();
  await expect(projectInfo).toBeFocused();
  await expect(tooltip).toBeVisible();

  const fontEvidence = await page.evaluate(async (sample) => {
    await document.fonts.load('400 12px "Poppins"', sample);
    await document.fonts.ready;
    const faces: Array<{ family: string; status: FontFace['status']; style: string; weight: string }> = [];
    document.fonts.forEach((face) => {
      if (face.family.replace(/["']/g, '') === 'Poppins') {
        faces.push({ family: face.family, status: face.status, style: face.style, weight: face.weight });
      }
    });

    return {
      check: document.fonts.check('400 12px "Poppins"', sample),
      faces,
    };
  }, PROJECT_DESCRIPTION_TOOLTIP);
  expect(fontEvidence.check).toBe(true);
  expect(fontEvidence.faces).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: 'loaded', weight: '400' })])
  );
  // Unlike CRA's production-style content-hashed `/static/media/...` output, Vite's dev server
  // serves imported assets straight from their source-relative path with no hash.
  expect(finishedFontRequests).toEqual(
    expect.arrayContaining([expect.stringMatching(/\/src\/core\/theme\/fonts\/Poppins-Regular\.ttf(?:$|\?)/)])
  );
  expect(googleFontRequests).toEqual([]);

  const computedFontFamily = await tooltip.evaluate((element) => getComputedStyle(element).fontFamily);
  expect(computedFontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Poppins');
  if (shouldComparePinnedVisual) {
    await expect(tooltip).toHaveScreenshot('project-description-info-tooltip.png');
  }
});
