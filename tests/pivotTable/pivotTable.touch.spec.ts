import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../workUnitOverrides/fixtures/workUnitOverridesApi';

const pivotPath = '/organizations/overrides-e2e/pivot-tables/work-units/query';

async function touchDrag(page: Page, source: Locator, target: Locator, expectedRegion: Locator): Promise<void> {
  const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
  const viewport = page.viewportSize();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  const from = {
    x: (sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2,
    y: (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2,
  };
  expect(sourceBox?.y).toBeGreaterThanOrEqual(0);
  expect((sourceBox?.y ?? 0) + (sourceBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  expect(targetBox?.y).toBeGreaterThanOrEqual(0);
  expect((targetBox?.y ?? 0) + (targetBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  const to = {
    x: (targetBox?.x ?? 0) + (targetBox?.width ?? 0) / 2,
    y: (targetBox?.y ?? 0) + (targetBox?.height ?? 0) / 2,
  };
  const sourceAtPoint = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(Math.round(x), Math.round(y))?.closest('button')?.getAttribute('aria-label') ?? null,
    from
  );
  expect(sourceAtPoint).toBe(await source.getAttribute('aria-label'));
  const cdp = await page.context().newCDPSession(page);
  let hasEnded = false;
  const dispatchTouch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    point?: { x: number; y: number }
  ): Promise<void> => {
    const touchPoints =
      type === 'touchEnd'
        ? []
        : [
            {
              x: point?.x ?? 0,
              y: point?.y ?? 0,
            },
          ];
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints,
      type,
    });
  };

  try {
    await dispatchTouch('touchStart', from);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as typeof window & {
                  __pivotTouchEvents?: Array<{
                    isTrusted: boolean;
                    targetLabel: string | null;
                    touches: number;
                    type: string;
                  }>;
                }
              ).__pivotTouchEvents ?? []
          ),
        { message: 'Chromium emitted a trusted touchstart at the whole-chip hit point' }
      )
      .toEqual([{ isTrusted: true, targetLabel: 'Drag Project', touches: 1, type: 'touchstart' }]);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as typeof window & {
                  __pivotPointerEvents?: Array<{ isTrusted: boolean; pointerType: string; targetLabel: string | null }>;
                }
              ).__pivotPointerEvents ?? []
          ),
        { message: 'Chromium emitted the trusted compatibility pointerdown before touch activation' }
      )
      .toEqual([{ isTrusted: true, pointerType: 'touch', targetLabel: 'Drag Project' }]);
    await expect(page.getByText('Picked up Project.')).toBeVisible();
    for (let step = 1; step <= 12; step += 1) {
      await dispatchTouch('touchMove', {
        x: from.x + ((to.x - from.x) * step) / 12,
        y: from.y + ((to.y - from.y) * step) / 12,
      });
    }
    await expect(expectedRegion.getByTestId('pivot-insertion')).toBeVisible();
    await dispatchTouch('touchEnd');
    hasEnded = true;
  } finally {
    if (!hasEnded) {
      await page.keyboard.press('Escape');
      await dispatchTouch('touchEnd');
    }
    await cdp.detach();
  }
}

test('touch moves an Available dimension into Rows through the real delayed whole-chip sensor', async ({
  page,
  overrideApi,
}) => {
  await page.goto('/pivot-table?startDate=2026-08-01&endDate=2026-08-31');
  await page.getByRole('button', { name: 'Configure fields' }).click();
  await expect(page.getByRole('dialog', { name: 'Pivot table fields' })).toBeVisible();
  const before = overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname === pivotPath).length;
  const rows = page.getByRole('region', { name: 'Rows' });
  const projectDragSurface = page.getByRole('button', { name: 'Drag Project' });
  await expect(projectDragSurface.getByTestId('pivot-drag-dots')).toBeVisible();
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __pivotPointerEvents?: Array<{ isTrusted: boolean; pointerType: string; targetLabel: string | null }>;
      __pivotTouchEvents?: Array<{ isTrusted: boolean; targetLabel: string | null; touches: number; type: string }>;
    };
    testWindow.__pivotPointerEvents = [];
    testWindow.__pivotTouchEvents = [];
    document.addEventListener(
      'pointerdown',
      (event) =>
        testWindow.__pivotPointerEvents?.push({
          isTrusted: event.isTrusted,
          pointerType: event.pointerType,
          targetLabel: (event.target as Element | null)?.closest('button')?.getAttribute('aria-label') ?? null,
        }),
      { capture: true }
    );
    ['touchstart', 'touchmove', 'touchend'].forEach((type) => {
      document.addEventListener(
        type,
        (event) =>
          testWindow.__pivotTouchEvents?.push({
            isTrusted: event.isTrusted,
            targetLabel: (event.target as Element | null)?.closest('button')?.getAttribute('aria-label') ?? null,
            touches: (event as TouchEvent).touches.length,
            type: event.type,
          }),
        { capture: true }
      );
    });
  });
  await touchDrag(page, projectDragSurface, page.getByRole('button', { name: 'Drag User' }), rows);
  await expect
    .poll(() => overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname === pivotPath).length)
    .toBe(before + 1);
  const body = overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname === pivotPath).at(-1)
    ?.body as {
    rows: string[];
  };
  expect(body.rows).toEqual(['MonthYearKey', 'ProjectKey', 'UserKey']);
  const touchEvents = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pivotTouchEvents?: Array<{ isTrusted: boolean; targetLabel: string | null; touches: number; type: string }>;
        }
      ).__pivotTouchEvents ?? []
  );
  expect(touchEvents.map(({ type }) => type)).toEqual([
    'touchstart',
    ...Array.from({ length: 12 }, () => 'touchmove'),
    'touchend',
  ]);
  expect(touchEvents.every(({ isTrusted }) => isTrusted)).toBe(true);
});
