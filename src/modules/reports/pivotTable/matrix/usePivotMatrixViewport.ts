import { RefObject, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  matrixGeometryForViewport,
  matrixTableWidth,
  shouldFreezeRowFields,
  type PivotMatrixGeometry,
} from './pivotMatrixGeometry';

interface PivotMatrixViewport {
  geometry: PivotMatrixGeometry;
  rowFieldsSticky: boolean;
}

interface ViewportMeasurements {
  containerWidth: number;
  viewportWidth: number;
}

const initialMeasurements = (): ViewportMeasurements => ({
  containerWidth: 0,
  viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
});

export const usePivotMatrixViewport = (
  containerRef: RefObject<HTMLDivElement>,
  rowFieldCount: number,
  renderedValueColumnCount: number,
): PivotMatrixViewport => {
  const [measurements, setMeasurements] = useState(initialMeasurements);

  const measure = useCallback(
    (observedWidth?: number): void => {
      const element = containerRef.current;
      if (!element || typeof window === 'undefined') return;
      const next = {
        containerWidth: observedWidth ?? element.clientWidth,
        viewportWidth: window.innerWidth,
      };
      setMeasurements((current) =>
        current.containerWidth === next.containerWidth && current.viewportWidth === next.viewportWidth ? current : next,
      );
    },
    [containerRef],
  );

  useLayoutEffect(() => measure(measurements.containerWidth || undefined));

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof window === 'undefined') return undefined;

    const updateViewport = (): void => measure();
    window.addEventListener('resize', updateViewport);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => measure(entry?.contentRect.width));
    observer?.observe(element);

    return (): void => {
      observer?.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [containerRef, measure]);

  const baseGeometry = matrixGeometryForViewport(measurements.viewportWidth);
  const minimumTableWidth = matrixTableWidth(rowFieldCount, renderedValueColumnCount, baseGeometry);
  const spareWidth = Math.max(0, measurements.containerWidth - minimumTableWidth);
  const geometry =
    rowFieldCount > 0 && spareWidth > 0
      ? {
          ...baseGeometry,
          rowFieldWidth: baseGeometry.rowFieldWidth + spareWidth / rowFieldCount,
        }
      : baseGeometry;
  return {
    geometry,
    rowFieldsSticky: shouldFreezeRowFields(
      measurements.viewportWidth,
      measurements.containerWidth,
      rowFieldCount,
      baseGeometry,
    ),
  };
};
