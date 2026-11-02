import { PIVOT_KEY } from '../constants';
import type { PivotFilterMember, PivotFilterValue } from '../types';
import { sortPivotFilterMembers } from './sortPivotFilterMembers';

const member = (value: PivotFilterValue, available = true): PivotFilterMember => ({ available, value });
const labels = new Map<PivotFilterValue, string>([
  ['00000000-0000-0000-0000-000000000001', 'Zulu'],
  ['00000000-0000-0000-0000-000000000002', 'Alpha'],
  ['00000000-0000-0000-0000-000000000003', 'Alpha'],
  [null, '(No client)'],
]);
const resolveLabel = (value: PivotFilterValue): string => labels.get(value) ?? String(value);

describe('sortPivotFilterMembers', () => {
  it('sorts UUID-backed members by localized label, then raw value, with unavailable last', () => {
    const members = [
      member('00000000-0000-0000-0000-000000000003'),
      member('00000000-0000-0000-0000-000000000001'),
      member('00000000-0000-0000-0000-000000000002'),
      member('00000000-0000-0000-0000-000000000001', false),
    ];

    expect(sortPivotFilterMembers(PIVOT_KEY.USER, members, resolveLabel, 'en').map(({ value }) => value)).toEqual([
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
    ]);
  });

  it('places null Client consistently and sorts years, months, dates, and entry types semantically', () => {
    expect(
      sortPivotFilterMembers(
        PIVOT_KEY.CLIENT,
        [member('00000000-0000-0000-0000-000000000001'), member(null)],
        resolveLabel,
        'en',
      ).map(({ value }) => value),
    ).toEqual([null, '00000000-0000-0000-0000-000000000001']);
    expect(
      sortPivotFilterMembers(PIVOT_KEY.YEAR, [member(2026), member(2024), member(2025)], resolveLabel).map(
        ({ value }) => value,
      ),
    ).toEqual([2024, 2025, 2026]);
    expect(
      sortPivotFilterMembers(
        PIVOT_KEY.MONTH_YEAR,
        [member('2026-12'), member('2025-11'), member('2026-01')],
        resolveLabel,
      ).map(({ value }) => value),
    ).toEqual(['2025-11', '2026-01', '2026-12']);
    expect(
      sortPivotFilterMembers(
        PIVOT_KEY.DATE,
        [member('2026-02-10'), member('2026-01-20'), member('2026-01-02')],
        resolveLabel,
      ).map(({ value }) => value),
    ).toEqual(['2026-01-02', '2026-01-20', '2026-02-10']);
    expect(
      sortPivotFilterMembers(PIVOT_KEY.ENTRY_TYPE, [member('Note'), member('Worklog')], resolveLabel).map(
        ({ value }) => value,
      ),
    ).toEqual(['Worklog', 'Note']);
  });

  it('sorts TaskKey members numerically by label with the no-task bucket collating like no-client', () => {
    const taskLabels = new Map<PivotFilterValue, string>([
      ['PROJ-9', 'PROJ-9'],
      ['PROJ-10', 'PROJ-10'],
      [null, '(No task)'],
    ]);
    const resolveTaskLabel = (value: PivotFilterValue): string => taskLabels.get(value) ?? String(value);

    expect(
      sortPivotFilterMembers(
        PIVOT_KEY.TASK,
        [member('PROJ-10'), member(null), member('PROJ-9')],
        resolveTaskLabel,
        'en',
      ).map(({ value }) => value),
    ).toEqual([null, 'PROJ-9', 'PROJ-10']);
  });

  it('does not mutate the response members', () => {
    const members = [member(2026), member(2024)];
    expect(sortPivotFilterMembers(PIVOT_KEY.YEAR, members, resolveLabel)).not.toBe(members);
    expect(members.map(({ value }) => value)).toEqual([2026, 2024]);
  });
});
