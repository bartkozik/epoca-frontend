import type { WorkUnitOverrideHistoryPage } from '@/modules/reports/models/workUnitOverride.model';
import { historyEntryFixture } from './overrideTestFixtures';
import { reconcileOverrideUndo, undoRecorded } from './reconcileOverrideUndo';

const targetEventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const page = (
  pageNumber: number,
  results: WorkUnitOverrideHistoryPage['results'],
  count = results.length,
): WorkUnitOverrideHistoryPage => ({ count, pageNumber, pageSize: 25, upToVersion: 80, results });

describe('undo reconciliation', () => {
  it('finds target evidence on page two and never treats page-one absence as final', async () => {
    const first = Array.from({ length: 25 }, (_, index) => ({
      ...historyEntryFixture(),
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      version: 80 - index,
    }));
    const reversal = {
      ...historyEntryFixture(),
      id: '99999999-9999-4999-8999-999999999999',
      version: 55,
      operation: 'Undo' as const,
      revertsEventId: targetEventId,
    };
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(1, first, 26))
      .mockResolvedValueOnce(page(2, [reversal], 26));

    await expect(reconcileOverrideUndo(80, 50, targetEventId, fetchPage)).resolves.toBe('recorded');
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(undoRecorded([reversal], targetEventId)).toBe(true);
  });

  it('returns notObserved only after crossing the attempt boundary or exhausting the stable snapshot', async () => {
    const entries = [{ ...historyEntryFixture(), version: 50 }];
    const fetchPage = vi.fn().mockResolvedValue(page(1, entries, 1));

    await expect(reconcileOverrideUndo(80, 50, targetEventId, fetchPage)).resolves.toBe('notObserved');
  });

  it.each([
    ['request failure', () => Promise.reject(new Error('offline'))],
    ['wrong page', () => Promise.resolve({ ...page(2, [], 0), pageNumber: 9 })],
    ['wrong snapshot', () => Promise.resolve({ ...page(1, [], 0), upToVersion: 79 })],
    [
      'changing count',
      vi
        .fn()
        .mockResolvedValueOnce(page(1, [], 26))
        .mockResolvedValueOnce(page(2, [], 27)),
    ],
  ])('returns unresolved for %s', async (_label, fetchPage) => {
    await expect(reconcileOverrideUndo(80, 50, targetEventId, fetchPage)).resolves.toBe('unresolved');
  });

  it('validates the complete page before accepting target evidence', async () => {
    const reversal = {
      ...historyEntryFixture(),
      id: '99999999-9999-4999-8999-999999999999',
      version: 80,
      operation: 'Undo' as const,
      revertsEventId: targetEventId,
    };
    const malformedTail = { ...historyEntryFixture(), id: reversal.id, version: 79 };

    const fetchPage = vi.fn().mockResolvedValue(page(1, [reversal, malformedTail], 2));
    await expect(reconcileOverrideUndo(80, 50, targetEventId, fetchPage)).resolves.toBe('unresolved');
  });

  it('rejects impossible reversal evidence at or before the attempted target version', async () => {
    const reversal = {
      ...historyEntryFixture(),
      version: 50,
      operation: 'Undo' as const,
      revertsEventId: targetEventId,
    };

    const fetchPage = vi.fn().mockResolvedValue(page(1, [reversal], 1));
    await expect(reconcileOverrideUndo(80, 50, targetEventId, fetchPage)).resolves.toBe('unresolved');
  });
});
