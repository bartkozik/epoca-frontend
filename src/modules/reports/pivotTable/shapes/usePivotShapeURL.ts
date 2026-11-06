import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PivotKey } from '../constants';
import {
  applyPivotShape,
  pivotShapeOf,
  readPivotShape,
  samePivotShape,
  writePivotShape,
} from '../layout/pivotShapeURL';
import type { PivotFieldMove, PivotLayout, PivotMoveResult } from '../layout/types';
import { pivotTablePaths } from '../routes';
import type { PivotTableView } from '../usePivotTableView';
import { PIVOT_SHAPES } from './pivotShapes';

export interface PivotShapeOption {
  levels: PivotKey[];
  columns: PivotKey[];
  url: string;
}

interface PivotShapeURL {
  moveField: (move: PivotFieldMove) => PivotMoveResult;
  shapeOptions: PivotShapeOption[];
  selectedShapeURL: string | null;
  selectShape: (url: string) => void;
}

export function usePivotShapeURL({ layout, moveField, replaceLayout }: PivotTableView): PivotShapeURL {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlShape = readPivotShape(searchParams);
  const urlShapeKey = urlShape ? writePivotShape(new URLSearchParams(), urlShape).toString() : null;

  const writeShape = useCallback(
    (next: PivotLayout): void => {
      navigate({ search: writePivotShape(searchParams, pivotShapeOf(next)).toString() }, { replace: true });
    },
    [navigate, searchParams],
  );

  useEffect(() => {
    if (!urlShape) writeShape(layout);
    else if (!samePivotShape(urlShape, pivotShapeOf(layout))) replaceLayout(applyPivotShape(layout, urlShape));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlShapeKey]);

  const moveFieldAndURL = useCallback(
    (move: PivotFieldMove): PivotMoveResult => {
      const result = moveField(move);
      if (result.accepted) writeShape(result.layout);
      return result;
    },
    [moveField, writeShape],
  );

  const shapeOptions = useMemo(
    () =>
      PIVOT_SHAPES.map((shape) => ({
        levels: shape.rows,
        columns: shape.columns,
        url: `${pivotTablePaths.main}?${writePivotShape(searchParams, shape).toString()}`,
      })),
    [searchParams],
  );
  const currentShape = urlShape ?? pivotShapeOf(layout);
  const selectedIndex = PIVOT_SHAPES.findIndex((shape) => samePivotShape(shape, currentShape));

  return {
    moveField: moveFieldAndURL,
    shapeOptions,
    selectedShapeURL: selectedIndex < 0 ? null : shapeOptions[selectedIndex].url,
    selectShape: (url) => navigate(url),
  };
}
