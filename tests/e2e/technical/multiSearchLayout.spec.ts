import path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { compile } from 'sass';

const multiSearchCss = compile(path.resolve(__dirname, '../../../src/core/theme/multiSearch/MultiSearch.module.scss'), {
  loadPaths: [path.resolve(__dirname, '../../../src')],
}).css;
const searchCss = compile(path.resolve(__dirname, '../../../src/core/theme/search/Search.module.scss'), {
  loadPaths: [path.resolve(__dirname, '../../../src')],
}).css;

const scenarios = [
  { name: 'desktop with hours and a status line', viewportWidth: 1280, withHours: true },
  { name: 'desktop without hours', viewportWidth: 1280, withHours: false },
  { name: 'mobile with hours and a status line', viewportWidth: 390, withHours: true },
];

const LONG_LABEL = `Option${'WithAVeryLongUnbrokenName'.repeat(4)}`;

// Mirrors the rows MultiSearch renders: group headings, options with a check box, label, secondary
// text and hours, the divider, and the archived toggle.
const option = (label: string, withHours: boolean, extraClass = ''): string => `
  <li class="option ${extraClass}" role="option" aria-selected="false">
    <span class="box" aria-hidden="true"></span>
    <span class="optionText">
      <span class="optionLabel">${label}</span>
      <span class="optionSecondary">Client name</span>
    </span>
    ${withHours ? '<span class="trailing">08:00</span>' : ''}
  </li>`;

const options = (prefix: string, count: number, withHours: boolean, extraClass = ''): string =>
  Array.from({ length: count }, (_, index) => option(`${prefix} ${index + 1}`, withHours, extraClass)).join('');

const renderPanel = async (page: Page, panelContent: string): Promise<void> => {
  await page.setContent(`
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body, ul, p { margin: 0; padding: 0; }
      ${multiSearchCss}
      .fixture { position: relative; margin: 24px; width: 240px; }
      .input { height: 40px; }
    </style>
    <div class="fixture root">
      <div class="labelRow"><label class="label" for="filter">Project:</label><button class="clear">Clear</button></div>
      <div class="inputContainer">
        <div class="input"><input id="filter" role="combobox" aria-expanded="true" /></div>
        <div class="panel" data-testid="panel">${panelContent}</div>
      </div>
    </div>
  `);
};

const verticalOverflowOwners = (page: Page): Promise<string[]> =>
  page
    .getByTestId('options-viewport')
    .evaluate((element: Element): string[] =>
      [element, ...Array.from(element.querySelectorAll('*'))]
        .filter((candidate) => ['auto', 'scroll'].includes(getComputedStyle(candidate).overflowY))
        .map((candidate) => candidate.getAttribute('class') ?? ''),
    );

test.describe('MultiSearch dropdown layout', () => {
  for (const scenario of scenarios) {
    test(`keeps the final option inside the dropdown on ${scenario.name} @full @technical`, async ({ page }) => {
      await page.setViewportSize({ width: scenario.viewportWidth, height: 900 });
      const statusLine = scenario.withHours
        ? '<div class="metaStatus"><span>Hours are unavailable. Filtering still works.</span><button>Try again</button></div>'
        : '';
      await renderPanel(
        page,
        `${statusLine}
        <button class="selectMatching">Select 20 matching</button>
        <div class="options" data-testid="options-viewport">
          <ul class="list" role="listbox" aria-multiselectable="true">
            <li class="groupHeading" role="presentation">Selected (4)</li>
            ${options('Selected option', 4, scenario.withHours)}
            <li class="divider" role="presentation"></li>
            ${option(LONG_LABEL, scenario.withHours)}
            ${options('Option with hours', 8, scenario.withHours)}
            <li class="groupHeading" role="presentation">No hours with the current filters</li>
            ${options('Option without hours', 12, scenario.withHours, 'optionInactive')}
            <li class="archivedToggleRow" role="presentation"><button class="archivedToggle">Archived (3)</button></li>
          </ul>
        </div>`,
      );

      const optionsViewport = page.getByTestId('options-viewport');
      await optionsViewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });

      const panel = await page.getByTestId('panel').boundingBox();
      const listViewport = await optionsViewport.boundingBox();
      const lastRow = await page.locator('.archivedToggle').boundingBox();
      const lastOption = await page.locator('.option').last().boundingBox();
      const viewportLayout = await optionsViewport.evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        scrollWidth: element.scrollWidth,
        listOverflowY: getComputedStyle(element.querySelector('.list') as Element).overflowY,
      }));

      if (!panel || !listViewport || !lastRow || !lastOption) throw new Error('Expected rendered layout bounds');

      expect(viewportLayout.overflowX).toBe('hidden');
      expect(viewportLayout.overflowY).toBe('auto');
      expect(viewportLayout.listOverflowY).toBe('visible');
      expect(viewportLayout.scrollWidth).toBeLessThanOrEqual(viewportLayout.clientWidth);
      expect(viewportLayout.scrollHeight).toBeGreaterThan(viewportLayout.clientHeight);
      expect(viewportLayout.scrollTop).toBeGreaterThan(0);
      expect(await verticalOverflowOwners(page)).toEqual(['options']);
      for (const box of [lastRow, lastOption]) {
        expect(box.y).toBeGreaterThanOrEqual(listViewport.y);
        expect(box.y + box.height).toBeLessThanOrEqual(listViewport.y + listViewport.height);
      }
      expect(listViewport.y + listViewport.height).toBeLessThanOrEqual(panel.y + panel.height);
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(scenario.viewportWidth);

      const panelButtons = page.getByTestId('panel').locator(':scope > button, :scope > .metaStatus button');
      for (let index = 0; index < (await panelButtons.count()); index += 1) {
        const button = await panelButtons.nth(index).boundingBox();
        if (!button) throw new Error('Expected rendered button bounds');
        expect(button.y).toBeGreaterThanOrEqual(panel.y);
        expect(button.y + button.height).toBeLessThanOrEqual(listViewport.y);
      }
    });
  }

  test('keeps the empty state contained and spaced inside the shared options viewport @full @technical', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await renderPanel(
      page,
      `<div class="options" data-testid="options-viewport">
        <p class="emptyState" data-testid="empty-state">No results found</p>
      </div>`,
    );

    const panel = await page.getByTestId('panel').boundingBox();
    const optionsViewport = page.getByTestId('options-viewport');
    const viewport = await optionsViewport.boundingBox();
    const emptyStateBox = await page.getByTestId('empty-state').boundingBox();
    const layout = await optionsViewport.evaluate((element) => {
      const emptyStateElement = element.querySelector('.emptyState');
      if (!emptyStateElement) throw new Error('Expected empty state inside options viewport');

      const emptyStateStyles = getComputedStyle(emptyStateElement);
      return {
        containsEmptyState: element.contains(emptyStateElement),
        emptyStateMargin: emptyStateStyles.margin,
        emptyStateOverflowY: emptyStateStyles.overflowY,
        emptyStatePadding: emptyStateStyles.padding,
        overflowX: getComputedStyle(element).overflowX,
        overflowY: getComputedStyle(element).overflowY,
      };
    });

    if (!panel || !viewport || !emptyStateBox) {
      throw new Error('Expected rendered empty-state layout bounds');
    }

    expect(layout.containsEmptyState).toBe(true);
    expect(layout.overflowX).toBe('hidden');
    expect(layout.overflowY).toBe('auto');
    expect(await verticalOverflowOwners(page)).toEqual(['options']);
    expect(layout.emptyStateOverflowY).toBe('visible');
    expect(layout.emptyStateMargin).toBe('0px');
    expect(layout.emptyStatePadding).toBe('24px 8px');
    expect(emptyStateBox.y).toBeGreaterThanOrEqual(viewport.y);
    expect(emptyStateBox.y + emptyStateBox.height).toBeLessThanOrEqual(viewport.y + viewport.height);
    expect(emptyStateBox.y + emptyStateBox.height).toBeLessThanOrEqual(panel.y + panel.height);
  });

  test('hides horizontal overflow in the shared Search dropdown @full @technical', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(`
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        html, body, ul { margin: 0; padding: 0; }
        ${searchCss}
        .fixture { position: relative; width: 260px; margin: 24px; }
      </style>
      <div class="fixture">
        <div class="dropdownContent">
          <div class="dropdownMenu">
            <ul class="dropdownMenuList">
              <li class="dropdownMenuListItem">
                <span>Representative project member with a long display label</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `);

    const horizontalLayout = await page.locator('.dropdownMenuList').evaluate((list) => ({
      clientWidth: list.clientWidth,
      overflowX: getComputedStyle(list).overflowX,
      scrollWidth: list.scrollWidth,
    }));

    expect(horizontalLayout.overflowX).toBe('hidden');
    expect(horizontalLayout.scrollWidth).toBeLessThanOrEqual(horizontalLayout.clientWidth);
  });
});
