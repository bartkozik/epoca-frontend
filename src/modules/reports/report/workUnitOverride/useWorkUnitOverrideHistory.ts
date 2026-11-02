import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { isTerminalOverrideProblem } from '@/modules/reports/models/problem.model';
import type { WorkUnitOverrideHistoryEntry } from '@/modules/reports/models/workUnitOverride.model';
import { WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE } from '@/modules/reports/models/workUnitOverride.model';
import { workUnitOverrideHistoryQueryKey } from '@/modules/reports/queryKeys';
import { fetchWorkUnitOverrideHistoryPage } from '@/modules/reports/workUnitOverrideHistoryQueries';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface OverrideHistoryOptions {
  isOpen: boolean;
  autoLoadRetainedEntries?: boolean;
  canViewHistory: boolean;
  hasHistory: boolean;
  currentVersion: number;
  organizationSlug: string;
  workUnitId: string;
  resetKey: number;
  handleError: (error: unknown) => boolean;
}

interface OverrideHistoryResult {
  entries: WorkUnitOverrideHistoryEntry[];
  allEntries: WorkUnitOverrideHistoryEntry[];
  totalCount: number | null;
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
}

/** Shared by the expandable history and the badge's lazy hover/focus/touch content. */
export function useWorkUnitOverrideHistory(options: OverrideHistoryOptions): OverrideHistoryResult {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const { isOpen, canViewHistory, hasHistory, currentVersion, organizationSlug, workUnitId, resetKey } = options;
  const { autoLoadRetainedEntries = true } = options;
  const [allEntries, setAllEntries] = useState<WorkUnitOverrideHistoryEntry[]>([]);
  const entries = allEntries.filter((entry) => entry.operation !== 'Undo' && entry.revertedBy == null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const snapshot = useRef<{
    generation: number;
    upToVersion: number;
    nextPage: number;
    inFlight: boolean;
    ended: boolean;
  } | null>(null);
  const generation = useRef(0);
  const actionGeneration = generation.current;
  const handleError = useRef(options.handleError);
  handleError.current = options.handleError;
  const sessionKey = JSON.stringify([isOpen, canViewHistory, hasHistory, organizationSlug, workUnitId, resetKey]);
  const clear = (): void => {
    setAllEntries([]);
    setTotalCount(null);
    setError(false);
    setLoading(false);
    setHasMore(false);
  };
  const load = async (requestedGeneration: number): Promise<void> => {
    if (requestedGeneration !== generation.current || workspace.contextOrganizationSlug !== organizationSlug) return;
    const session = snapshot.current;
    if (!session || session.inFlight || session.ended) return;
    session.inFlight = true;
    setLoading(true);
    setError(false);
    const isCurrent = (): boolean =>
      snapshot.current === session &&
      generation.current === session.generation &&
      workspace.contextOrganizationSlug === organizationSlug;
    try {
      // staleTime is pinned to 0: each lazy-load session (badge hover, then a later focus) is
      // expected to hit the network again even for an identical (version, page) key -- the
      // history is backend-immutable, but the underlying worklog can be corrected between two
      // sessions without upToVersion changing in a way this snapshot would see, and the shared
      // client's 60s default would otherwise silently serve a stale page on that second session.
      // retry is pinned to false: the shared client's default (retry: 1) would silently retry
      // even a definitively-terminal error (e.g. a 403) once before isTerminalOverrideProblem
      // below ever runs, adding a guaranteed-useless request and ~1s of delay before session-end
      // fires -- matching the sibling useWorkUnitOverride.ts's loadFresh, which pins retry: false
      // for the same reason.
      const data = await queryClient.fetchQuery({
        queryKey: workUnitOverrideHistoryQueryKey(organizationSlug, workUnitId, session.upToVersion, session.nextPage),
        queryFn: () =>
          fetchWorkUnitOverrideHistoryPage(organizationSlug, workUnitId, session.upToVersion, session.nextPage),
        staleTime: 0,
        retry: false,
      });
      if (!isCurrent()) return;
      if (
        data.upToVersion !== session.upToVersion ||
        data.pageNumber !== session.nextPage ||
        data.pageSize !== WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE
      )
        throw new Error('History page does not match the requested snapshot');
      setAllEntries((previous) => {
        const unique = new Map(previous.map((entry) => [entry.id, entry]));
        data.results.forEach((entry) => unique.set(entry.id, entry));
        return [...unique.values()].sort((a, b) => b.version - a.version);
      });
      setTotalCount(data.count);
      session.ended = session.nextPage * WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE >= data.count;
      session.nextPage += 1;
      setHasMore(!session.ended);
    } catch (failure) {
      if (!isCurrent()) return;
      if (isTerminalOverrideProblem(failure)) {
        session.ended = true;
        clear();
        handleError.current(failure);
      } else if (!handleError.current(failure)) setError(true);
    } finally {
      if (isCurrent()) {
        session.inFlight = false;
        setLoading(false);
      }
    }
  };
  useLayoutEffect(() => {
    const nextGeneration = ++generation.current;
    snapshot.current = null;
    clear();
    if (isOpen && canViewHistory) {
      if (!hasHistory) setTotalCount(0);
      else {
        snapshot.current = {
          generation: nextGeneration,
          upToVersion: currentVersion,
          nextPage: 1,
          inFlight: false,
          ended: false,
        };
        void load(nextGeneration);
      }
    }
    return () => {
      generation.current += 1;
      snapshot.current = null;
    };
    // currentVersion is deliberately pinned until this open session is invalidated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);
  useEffect(() => {
    if (autoLoadRetainedEntries && isOpen && canViewHistory && hasMore && !loading && !error && entries.length === 0)
      void load(actionGeneration);
    // load is intentionally recreated on each render; this effect reacts to the page state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadRetainedEntries, isOpen, canViewHistory, hasMore, loading, error, entries.length, actionGeneration]);
  return {
    entries,
    allEntries,
    totalCount,
    loading,
    error,
    hasMore,
    loadMore: () => load(actionGeneration),
    retry: () => load(actionGeneration),
  };
}
