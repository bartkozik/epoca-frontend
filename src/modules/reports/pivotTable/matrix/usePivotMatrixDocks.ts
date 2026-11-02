import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { calculatePivotDockLayout } from './pivotMatrixDocking';

interface PivotMatrixDockRefs {
  grandTotalDockRef: RefObject<HTMLDivElement>;
  grandTotalDockRowHeaderRef: RefObject<HTMLTableCellElement>;
  grandTotalDockTableRef: RefObject<HTMLTableElement>;
  headerDockRef: RefObject<HTMLDivElement>;
  headerDockTableRef: RefObject<HTMLTableElement>;
  horizontalContainerRef: RefObject<HTMLDivElement>;
  masterToggleRef: RefObject<HTMLButtonElement>;
  matrixShellRef: RefObject<HTMLDivElement>;
  rowFieldsSticky: boolean;
  semanticGrandTotalRef: RefObject<HTMLTableRowElement>;
  semanticHeaderRef: RefObject<HTMLTableSectionElement>;
  semanticMasterAnchorRef: RefObject<HTMLTableCellElement>;
  semanticTableRef: RefObject<HTMLTableElement>;
  verticalScrollContainerRef: RefObject<HTMLDivElement>;
}

const cssPixels = (value: number): string => `${value}px`;

const readNonNegativeCssPixels = (shell: HTMLElement, property: string): number => {
  const value = Number.parseFloat(window.getComputedStyle(shell).getPropertyValue(property));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export const usePivotMatrixDocks = ({
  grandTotalDockRef,
  grandTotalDockRowHeaderRef,
  grandTotalDockTableRef,
  headerDockRef,
  headerDockTableRef,
  horizontalContainerRef,
  masterToggleRef,
  matrixShellRef,
  rowFieldsSticky,
  semanticGrandTotalRef,
  semanticHeaderRef,
  semanticMasterAnchorRef,
  semanticTableRef,
  verticalScrollContainerRef,
}: PivotMatrixDockRefs): void => {
  const animationFrameRef = useRef<number | null>(null);

  const measure = useCallback((): void => {
    const grandTotalDock = grandTotalDockRef.current;
    const headerDock = headerDockRef.current;
    const headerDockTable = headerDockTableRef.current;
    const horizontalContainer = horizontalContainerRef.current;
    const matrixShell = matrixShellRef.current;
    const semanticHeader = semanticHeaderRef.current;
    const semanticTable = semanticTableRef.current;
    const verticalScrollContainer = verticalScrollContainerRef.current;
    if (
      !headerDock ||
      !headerDockTable ||
      !horizontalContainer ||
      !matrixShell ||
      !semanticHeader ||
      !semanticTable ||
      !verticalScrollContainer
    ) {
      return;
    }

    const grandTotalRect = semanticGrandTotalRef.current?.getBoundingClientRect();
    const headerRect = semanticHeader.getBoundingClientRect();
    const horizontalRect = horizontalContainer.getBoundingClientRect();
    const tableRect = semanticTable.getBoundingClientRect();
    const scrollerRect = verticalScrollContainer.getBoundingClientRect();
    const grandTotalHeight =
      (grandTotalRect?.height ?? 0) + readNonNegativeCssPixels(matrixShell, '--pivot-grand-total-clearance');
    const layout = calculatePivotDockLayout({
      bottomInset: readNonNegativeCssPixels(matrixShell, '--pivot-sticky-bottom-inset'),
      grandTotalHeight,
      headerHeight: headerRect.height,
      matrix: tableRect,
      naturalGrandTotalTop: grandTotalRect?.top ?? tableRect.bottom,
      naturalHeaderTop: headerRect.top,
      scroller: scrollerRect,
    });
    const contentLeft = horizontalRect.left + horizontalContainer.clientLeft;
    const contentWidth =
      horizontalContainer.clientWidth || Math.max(0, horizontalRect.width - horizontalContainer.clientLeft * 2);
    const headerIntersectsScroller = tableRect.bottom > scrollerRect.top && tableRect.top < scrollerRect.bottom;
    const headerVisible = layout.header.mode !== 'natural' && headerIntersectsScroller;

    headerDock.dataset.mode = layout.header.mode;
    headerDock.style.height = cssPixels(headerRect.height);
    headerDock.style.left = cssPixels(contentLeft);
    headerDock.style.position = 'fixed';
    headerDock.style.top = cssPixels(layout.header.top);
    headerDock.style.visibility = headerVisible ? 'visible' : 'hidden';
    headerDock.style.width = cssPixels(contentWidth);

    const scrollLeft = horizontalContainer.scrollLeft;
    headerDockTable.style.transform = `translateX(${-scrollLeft}px)`;
    headerDock.querySelectorAll<HTMLElement>('[data-pivot-dock-row-header]').forEach((rowHeader) => {
      rowHeader.style.transform = `translateX(${rowFieldsSticky ? scrollLeft : 0}px)`;
    });

    const masterToggle = masterToggleRef.current;
    const semanticMasterAnchor = semanticMasterAnchorRef.current;
    if (masterToggle && semanticMasterAnchor) {
      const anchorRect = semanticMasterAnchor.getBoundingClientRect();
      const masterHeight = masterToggle.offsetHeight || 32;
      const masterWidth = masterToggle.offsetWidth || 32;
      const stickyMasterLeft = contentLeft + (rowFieldsSticky ? 4 : 4 - scrollLeft);
      const masterLeft = layout.header.mode === 'natural' ? anchorRect.left + 4 : stickyMasterLeft;
      const masterHeaderTop = layout.header.mode === 'natural' ? anchorRect.top : layout.header.top;
      const masterTop = masterHeaderTop + (anchorRect.height - masterHeight) / 2;
      const horizontallyVisible = masterLeft + masterWidth > contentLeft && masterLeft < contentLeft + contentWidth;
      const naturallyVisible = anchorRect.bottom > scrollerRect.top && anchorRect.top < scrollerRect.bottom;
      const masterVisible =
        horizontallyVisible && (layout.header.mode === 'natural' ? naturallyVisible : headerVisible);

      masterToggle.style.left = cssPixels(masterLeft);
      masterToggle.style.position = 'fixed';
      masterToggle.style.top = cssPixels(masterTop);
      masterToggle.style.visibility = masterVisible ? 'visible' : 'hidden';
    }

    if (!grandTotalDock) return;
    grandTotalDock.dataset.docked = String(layout.grandTotal.docked);
    grandTotalDock.style.height = cssPixels(grandTotalHeight);
    grandTotalDock.style.left = cssPixels(contentLeft);
    grandTotalDock.style.position = 'fixed';
    grandTotalDock.style.top = cssPixels(layout.grandTotal.top);
    grandTotalDock.style.visibility = layout.grandTotal.docked ? 'visible' : 'hidden';
    grandTotalDock.style.width = cssPixels(contentWidth);
    if (grandTotalDockTableRef.current) {
      grandTotalDockTableRef.current.style.transform = `translateX(${-scrollLeft}px)`;
    }
    if (grandTotalDockRowHeaderRef.current) {
      grandTotalDockRowHeaderRef.current.style.transform = `translateX(${rowFieldsSticky ? scrollLeft : 0}px)`;
    }
  }, [
    grandTotalDockRef,
    grandTotalDockRowHeaderRef,
    grandTotalDockTableRef,
    headerDockRef,
    headerDockTableRef,
    horizontalContainerRef,
    masterToggleRef,
    matrixShellRef,
    rowFieldsSticky,
    semanticGrandTotalRef,
    semanticHeaderRef,
    semanticMasterAnchorRef,
    semanticTableRef,
    verticalScrollContainerRef,
  ]);

  const scheduleMeasure = useCallback((): void => {
    if (typeof window === 'undefined' || animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => scheduleMeasure());

  useEffect(() => {
    const horizontalContainer = horizontalContainerRef.current;
    const matrixShell = matrixShellRef.current;
    const semanticHeader = semanticHeaderRef.current;
    const semanticTable = semanticTableRef.current;
    const verticalScrollContainer = verticalScrollContainerRef.current;
    if (!horizontalContainer || !matrixShell || !semanticHeader || !semanticTable || !verticalScrollContainer) {
      return undefined;
    }

    horizontalContainer.addEventListener('scroll', scheduleMeasure, { passive: true });
    verticalScrollContainer.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleMeasure());
    [
      horizontalContainer,
      matrixShell,
      semanticHeader,
      semanticMasterAnchorRef.current,
      semanticTable,
      semanticGrandTotalRef.current,
      verticalScrollContainer,
    ].forEach((element) => {
      if (element) resizeObserver?.observe(element);
    });
    scheduleMeasure();

    return (): void => {
      horizontalContainer.removeEventListener('scroll', scheduleMeasure);
      verticalScrollContainer.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    horizontalContainerRef,
    matrixShellRef,
    scheduleMeasure,
    semanticGrandTotalRef,
    semanticHeaderRef,
    semanticMasterAnchorRef,
    semanticTableRef,
    verticalScrollContainerRef,
  ]);
};
