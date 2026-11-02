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
  /** Row levels from outer to inner, then column fields; the option's name is built from them. */
  levels: PivotKey[];
  columns: PivotKey[];
  url: string;
}

interface PivotShapeURL {
  moveField: (move: PivotFieldMove) => PivotMoveResult;
  shapeOptions: PivotShapeOption[];
  /** The option whose URL describes the current table, or null for a custom layout. */
  selectedShapeURL: string | null;
  selectShape: (url: string) => void;
}

// The URL holds the table's rows, columns and values (?rows=UserKey&columns=MonthYearKey&values=DurationSum),
// so any address can be shared. A URL without them gets the current layout written in; a URL that changes
// them (a link, the select, back and forward) sets the layout.
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
    // Only a change of the URL's shape should move the layout; layout changes write the URL themselves.
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
