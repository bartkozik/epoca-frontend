import { calculatePivotDockLayout, type PivotDockLayoutInput } from './pivotMatrixDocking';

const input = (overrides: Partial<PivotDockLayoutInput> = {}): PivotDockLayoutInput => ({
  bottomInset: 0,
  grandTotalHeight: 48,
  headerHeight: 88,
  matrix: { bottom: 920, top: 120 },
  naturalGrandTotalTop: 872,
  naturalHeaderTop: 120,
  scroller: { bottom: 700, top: 100 },
  ...overrides,
});

describe('pivot matrix docking geometry', () => {
  it.each([
    ['before the matrix reaches the scroll boundary', input(), { mode: 'natural', top: 120 }],
    [
      'while the matrix crosses the scroll boundary',
      input({ matrix: { bottom: 800, top: 0 }, naturalGrandTotalTop: 752, naturalHeaderTop: 0 }),
      { mode: 'sticky', top: 100 },
    ],
    [
      'at the matrix bottom boundary',
      input({ matrix: { bottom: 150, top: -650 }, naturalGrandTotalTop: 102, naturalHeaderTop: -650 }),
      { mode: 'boundary', top: 62 },
    ],
  ])('places the header %s', (_label, layoutInput, expected) => {
    expect(calculatePivotDockLayout(layoutInput).header).toEqual(expected);
  });

  it('docks the grand total of a long intersecting matrix at the effective viewport bottom', () => {
    const layout = calculatePivotDockLayout(
      input({ matrix: { bottom: 800, top: 0 }, naturalGrandTotalTop: 752, naturalHeaderTop: 0 }),
    );

    expect(layout.grandTotal).toEqual({ docked: true, top: 652 });
  });

  it('hands off to the natural grand total at full overlap', () => {
    const layout = calculatePivotDockLayout(
      input({ matrix: { bottom: 700, top: -100 }, naturalGrandTotalTop: 652, naturalHeaderTop: -100 }),
    );

    expect(layout.grandTotal).toEqual({ docked: false, top: 652 });
  });

  it('never docks a short matrix while it enters the viewport from below', () => {
    const layout = calculatePivotDockLayout(
      input({ matrix: { bottom: 850, top: 350 }, naturalGrandTotalTop: 802, naturalHeaderTop: 350 }),
    );

    expect(layout.grandTotal.docked).toBe(false);
  });

  it('uses the export inset for both long-matrix classification and dock position', () => {
    const matrix = { bottom: 760, top: 160 };
    const withoutExport = calculatePivotDockLayout(input({ matrix, naturalGrandTotalTop: 712, naturalHeaderTop: 160 }));
    const withExport = calculatePivotDockLayout(
      input({ bottomInset: 120, matrix, naturalGrandTotalTop: 712, naturalHeaderTop: 160 }),
    );

    expect(withoutExport.grandTotal.docked).toBe(false);
    expect(withExport.grandTotal).toEqual({ docked: true, top: 532 });
  });

  it('does not dock once the matrix stops intersecting the effective viewport', () => {
    const layout = calculatePivotDockLayout(
      input({ matrix: { bottom: 90, top: -710 }, naturalGrandTotalTop: 42, naturalHeaderTop: -710 }),
    );

    expect(layout.grandTotal.docked).toBe(false);
  });
});
