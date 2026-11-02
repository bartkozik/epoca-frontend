import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useCallback, useEffect, useState } from 'react';
import type { PivotKey } from './constants';
import { clonePivotLayout, DEFAULT_PIVOT_LAYOUT, movePivotField } from './layout/pivotLayout';
import { loadPivotLayout, savePivotLayout } from './layout/pivotLayoutStorage';
import type { PivotFieldMove, PivotLayout, PivotMoveResult } from './layout/types';
import type { PivotFilterValue, PivotOptions } from './types';

const resolveInitialLayout = (userId: string | undefined, organizationSlug: string): PivotLayout =>
  userId
    ? (loadPivotLayout(userId, organizationSlug) ?? clonePivotLayout(DEFAULT_PIVOT_LAYOUT))
    : clonePivotLayout(DEFAULT_PIVOT_LAYOUT);

export interface PivotTableView {
  layout: PivotLayout;
  moveField: (move: PivotFieldMove) => PivotMoveResult;
  applyFilter: (key: PivotKey, includedValues: PivotFilterValue[] | null) => boolean;
  setOption: (key: keyof PivotOptions, value: boolean) => boolean;
  replaceLayout: (next: PivotLayout) => void;
  resetLayout: () => void;
}

// Layout is per-(user, organization) persisted config, not server-state -- it lives in local
// state backed by localStorage, not the TanStack Query cache. Reloads whenever the (userId,
// organizationSlug) identity changes, mirroring the removed pivot table store's former
// cache-key-scoped `layout` getter. Unlike that store's moveField/applyFilter/setOption, this
// hook does not itself trigger a data refetch -- PivotTable.tsx's usePivotTableQuery call does
// that by depending on `layout` in its query key.
export function usePivotTableView(): PivotTableView {
  const auth = useAuth();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const userId = auth.loggedInUser?.id;

  const [layout, setLayoutState] = useState<PivotLayout>(() => resolveInitialLayout(userId, organizationSlug));

  useEffect(() => {
    setLayoutState(resolveInitialLayout(userId, organizationSlug));
  }, [userId, organizationSlug]);

  const persist = useCallback(
    (next: PivotLayout): void => {
      setLayoutState(next);
      if (userId) savePivotLayout(userId, organizationSlug, next);
    },
    [organizationSlug, userId],
  );

  const moveField = useCallback(
    (move: PivotFieldMove): PivotMoveResult => {
      const result = movePivotField(layout, move);
      if (result.accepted) persist(result.layout);
      return result;
    },
    [layout, persist],
  );

  const applyFilter = useCallback(
    (key: PivotKey, includedValues: PivotFilterValue[] | null): boolean => {
      if (includedValues?.length === 0) return false;
      const filterIndex = layout.filters.findIndex((filter) => filter.key === key);
      if (filterIndex < 0) return false;

      const next = clonePivotLayout(layout);
      const previous = next.filters[filterIndex].includedValues;
      const normalized = includedValues === null ? null : [...includedValues];
      if (JSON.stringify(previous) === JSON.stringify(normalized)) return false;
      next.filters[filterIndex] = { key, includedValues: normalized };
      persist(next);
      return true;
    },
    [layout, persist],
  );

  const setOption = useCallback(
    (key: keyof PivotOptions, value: boolean): boolean => {
      if (layout.options[key] === value) return false;
      const next = clonePivotLayout(layout);
      next.options[key] = value;
      persist(next);
      return true;
    },
    [layout, persist],
  );

  const replaceLayout = useCallback((next: PivotLayout): void => persist(clonePivotLayout(next)), [persist]);
  const resetLayout = useCallback((): void => persist(clonePivotLayout(DEFAULT_PIVOT_LAYOUT)), [persist]);

  return { layout, moveField, applyFilter, setOption, replaceLayout, resetLayout };
}
