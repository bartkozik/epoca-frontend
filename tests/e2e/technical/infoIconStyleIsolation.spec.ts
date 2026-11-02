import { expect, Page, test } from '@playwright/test';
import path from 'path';
import { compile } from 'sass';

const compileModuleCss = (relativePath: string, namespace: string): string =>
  compile(path.resolve(__dirname, relativePath), {
    loadPaths: [path.resolve(__dirname, '../../../src')],
  }).css.replace(/\.([_a-zA-Z][\w-]*)/g, `.${namespace}-$1`);

const unitFormCss = compileModuleCss('../../../src/modules/workingTime/Calendar/UnitForm/UnitForm.module.scss', 'unit');
const infoIconCss = compileModuleCss('../../../src/core/theme/infoIcon/InfoIcon.module.scss', 'info');
const tooltipCss = compileModuleCss('../../../src/core/theme/tooltip/Tooltip.module.scss', 'tooltip');

const ICON_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'height', 'width'] as const;
const TOOLTIP_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'line-height'] as const;

const readStyles = async (page: Page, testId: string, properties: readonly string[]): Promise<Record<string, string>> =>
  page.getByTestId(testId).evaluate((element, propertyNames) => {
    const computedStyle = window.getComputedStyle(element);

    return Object.fromEntries(
      propertyNames.map((propertyName) => [propertyName, computedStyle.getPropertyValue(propertyName)])
    );
  }, properties);

test('keeps UnitForm label styles out of InfoIcon and Tooltip internals @full @technical', async ({ page }) => {
  await page.setContent(`
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      ${infoIconCss}
      ${tooltipCss}
      ${unitFormCss}
    </style>
    <div class="unit-projectDescriptionLabel">
      <span class="unit-projectDescriptionLabelText" data-testid="project-label">Project description</span>
      <span class="tooltip-root info-root">
        <span class="info-icon unit-projectDescriptionInfoIcon" data-testid="project-icon">i</span>
        <span class="tooltip-tooltip" data-testid="project-tooltip">Project tooltip</span>
      </span>
    </div>
    <div>
      <span class="tooltip-root info-root">
        <span class="info-icon" data-testid="reference-icon">i</span>
        <span class="tooltip-tooltip" data-testid="reference-tooltip">Reference tooltip</span>
      </span>
    </div>
  `);

  expect(await readStyles(page, 'project-icon', ICON_PROPERTIES)).toEqual(
    await readStyles(page, 'reference-icon', ICON_PROPERTIES)
  );
  expect(await readStyles(page, 'project-tooltip', TOOLTIP_PROPERTIES)).toEqual(
    await readStyles(page, 'reference-tooltip', TOOLTIP_PROPERTIES)
  );
  expect(await page.getByTestId('project-label').evaluate((element) => getComputedStyle(element).marginBottom)).toBe(
    '6px'
  );
  expect(await page.getByTestId('project-tooltip').evaluate((element) => getComputedStyle(element).marginBottom)).toBe(
    '0px'
  );
});
