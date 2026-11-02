import { expect, test } from '@playwright/test';
import path from 'path';
import { compile } from 'sass';

const themeCss = compile(path.resolve(__dirname, '../src/core/theme/theme-style.scss'), {
  loadPaths: [path.resolve(__dirname, '../src')],
}).css;
const pivotTableBoardCss = compile(
  path.resolve(__dirname, '../src/modules/reports/pivotTable/pivotTableBoard/PivotTableBoard.module.scss'),
  { loadPaths: [path.resolve(__dirname, '../src')] }
).css.replace(/\.([_a-zA-Z][\w-]*)/g, '.pivot-$1');

for (const viewportWidth of [1280, 390]) {
  test(`keeps body duration aligned at ${viewportWidth}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await page.setContent(`
      <style>
        ${themeCss}
        ${pivotTableBoardCss}
      </style>
      <table class="table pivot-table">
        <thead>
          <tr><th>Rows</th><th>Hours</th></tr>
        </thead>
        <tbody>
          <tr><td>Anna</td><td class="pivot-durationCell" data-testid="body-duration">01:00</td></tr>
        </tbody>
      </table>
    `);

    const styles = await page.getByTestId('body-duration').evaluate((element) => {
      const computedStyle = getComputedStyle(element);

      return {
        justifyContent: computedStyle.justifyContent,
        paddingRight: computedStyle.paddingRight,
        textAlign: computedStyle.textAlign,
      };
    });

    expect(styles).toEqual({ justifyContent: 'flex-end', paddingRight: '16px', textAlign: 'right' });
  });
}
