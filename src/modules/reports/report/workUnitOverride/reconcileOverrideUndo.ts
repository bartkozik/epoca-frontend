import type {
  WorkUnitOverrideHistoryEntry,
  WorkUnitOverrideHistoryPage,
} from '@/modules/reports/models/workUnitOverride.model';

export type UndoEvidence = 'recorded' | 'notObserved' | 'unresolved';

export function undoRecorded(entries: WorkUnitOverrideHistoryEntry[], targetEventId: string): boolean {
  return entries.some((entry) => entry.operation === 'Undo' && entry.revertsEventId === targetEventId);
}

/**
 * Reads one immutable history snapshot newest-first. Absence is conclusive only
 * after the attempted version boundary or the end of that snapshot is reached.
 */
export async function reconcileOverrideUndo(
  upToVersion: number,
  attemptedHistoryVersion: number,
  targetEventId: string,
  fetchPage: (pageNumber: number) => Promise<WorkUnitOverrideHistoryPage>,
): Promise<UndoEvidence> {
  let pageNumber = 1;
  let expectedCount: number | null = null;
  let seen = 0;
  let previousVersion = Number.POSITIVE_INFINITY;
  const seenIds = new Set<string>();

  try {
    while (true) {
      const page = await fetchPage(pageNumber);
      if (page.upToVersion !== upToVersion || page.pageNumber !== pageNumber || page.pageSize !== 25) {
        return 'unresolved';
      }
      if (expectedCount === null) expectedCount = page.count;
      else if (page.count !== expectedCount) return 'unresolved';
      if (page.results.length > page.pageSize || seen + page.results.length > page.count) return 'unresolved';

      let crossedAttemptBoundary = false;
      for (const entry of page.results) {
        if (seenIds.has(entry.id) || entry.version >= previousVersion) return 'unresolved';
        seenIds.add(entry.id);
        previousVersion = entry.version;
        seen += 1;
        if (entry.version <= attemptedHistoryVersion) crossedAttemptBoundary = true;
      }

      const reversal = page.results.find(
        (entry) => entry.operation === 'Undo' && entry.revertsEventId === targetEventId,
      );
      if (reversal) return reversal.version > attemptedHistoryVersion ? 'recorded' : 'unresolved';
      if (crossedAttemptBoundary) return 'notObserved';

      if (seen >= page.count) return seen === page.count ? 'notObserved' : 'unresolved';
      if (page.results.length !== page.pageSize) return 'unresolved';
      pageNumber += 1;
    }
  } catch {
    return 'unresolved';
  }
}
