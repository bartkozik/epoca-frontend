export interface PivotDockVerticalRange {
  bottom: number;
  top: number;
}

export interface PivotDockLayoutInput {
  bottomInset: number;
  grandTotalHeight: number;
  headerHeight: number;
  matrix: PivotDockVerticalRange;
  naturalGrandTotalTop: number;
  naturalHeaderTop: number;
  scroller: PivotDockVerticalRange;
}

export type PivotHeaderDockMode = 'natural' | 'sticky' | 'boundary';

export interface PivotDockLayout {
  grandTotal: {
    docked: boolean;
    top: number;
  };
  header: {
    mode: PivotHeaderDockMode;
    top: number;
  };
}

export const calculatePivotDockLayout = ({
  bottomInset,
  grandTotalHeight,
  headerHeight,
  matrix,
  naturalGrandTotalTop,
  naturalHeaderTop,
  scroller,
}: PivotDockLayoutInput): PivotDockLayout => {
  const effectiveBottom = scroller.bottom - Math.max(0, bottomInset);
  const effectiveViewportHeight = Math.max(0, effectiveBottom - scroller.top);
  const matrixHeight = Math.max(0, matrix.bottom - matrix.top);
  const dockSlotTop = effectiveBottom - grandTotalHeight;
  const matrixIntersectsViewport = matrix.bottom > scroller.top && matrix.top < effectiveBottom;
  const grandTotalDocked =
    matrixHeight > effectiveViewportHeight && matrixIntersectsViewport && naturalGrandTotalTop > dockSlotTop;

  const headerBoundaryTop = matrix.bottom - headerHeight;
  const header =
    naturalHeaderTop >= scroller.top
      ? { mode: 'natural' as const, top: naturalHeaderTop }
      : headerBoundaryTop <= scroller.top
        ? { mode: 'boundary' as const, top: headerBoundaryTop }
        : { mode: 'sticky' as const, top: scroller.top };

  return {
    grandTotal: { docked: grandTotalDocked, top: dockSlotTop },
    header,
  };
};
