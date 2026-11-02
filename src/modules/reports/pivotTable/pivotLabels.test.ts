import { PIVOT_KEY, PIVOT_VALUE } from './constants';
import { buildPivotMemberIdentities, createPivotLabelResolver } from './pivotLabels';
import type { PivotCell, WorkUnitPivotQueryRequest, WorkUnitPivotQueryResponse } from './types';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';

const translations: Record<string, string> = {
  'pivot_table.entry_type.Note': 'Note',
  'pivot_table.entry_type.Worklog': 'Worklog',
  'pivot_table.filter.no_client': '(No client)',
  'pivot_table.filter.no_task': '(No task)',
};
const t = (key: string, params?: Record<string, unknown>): string =>
  key === 'pivot_table.table.unknown_value' ? `Unknown (${String(params?.value)})` : (translations[key] ?? key);

const emptyResponse = (cells: PivotCell[]): WorkUnitPivotQueryResponse => ({
  cells,
  filterMembers: [],
  result: { cellCount: cells.length, displayValueCellCount: cells.length, maxDisplayValueCellCount: 9_600 },
});

describe('createPivotLabelResolver', () => {
  const resolver = createPivotLabelResolver({
    clients: [{ id: clientId, name: 'Atelier Operations' }],
    locale: 'en',
    projects: [{ id: projectId, name: 'Patient Portal' }],
    t,
    users: [{ fullName: 'Julia Krawczyk', id: userId }],
  });

  it('resolves reference-backed user, project and client labels', () => {
    expect(resolver(PIVOT_KEY.USER, userId)).toBe('Julia Krawczyk');
    expect(resolver(PIVOT_KEY.PROJECT, projectId)).toBe('Patient Portal');
    expect(resolver(PIVOT_KEY.CLIENT, clientId)).toBe('Atelier Operations');
  });

  it('uses construction-time reference indexes instead of searching arrays for every identity', () => {
    const clients = [{ id: clientId, name: 'Indexed client' }];
    const projects = [{ id: projectId, name: 'Indexed project' }];
    const users = [{ fullName: 'Indexed user', id: userId }];
    const indexedResolver = createPivotLabelResolver({ clients, locale: 'en', projects, t, users });
    const clientFind = vi.spyOn(clients, 'find');
    const projectFind = vi.spyOn(projects, 'find');
    const userFind = vi.spyOn(users, 'find');

    expect(indexedResolver(PIVOT_KEY.USER, userId)).toBe('Indexed user');
    expect(indexedResolver(PIVOT_KEY.USER, userId)).toBe('Indexed user');
    expect(indexedResolver(PIVOT_KEY.PROJECT, projectId)).toBe('Indexed project');
    expect(indexedResolver(PIVOT_KEY.CLIENT, clientId)).toBe('Indexed client');
    expect(userFind).not.toHaveBeenCalled();
    expect(projectFind).not.toHaveBeenCalled();
    expect(clientFind).not.toHaveBeenCalled();
  });

  it('resolves null client and every canonical non-reference dimension', () => {
    expect(resolver(PIVOT_KEY.CLIENT, null)).toBe('(No client)');
    expect(resolver(PIVOT_KEY.YEAR, 2026)).toBe('2026');
    expect(resolver(PIVOT_KEY.MONTH_YEAR, '2026-08')).toBe('August 2026');
    expect(resolver(PIVOT_KEY.DATE, '2026-08-13')).toBe('08/13/2026');
    expect(resolver(PIVOT_KEY.ENTRY_TYPE, 'Worklog')).toBe('Worklog');
    expect(resolver(PIVOT_KEY.ENTRY_TYPE, 'Note')).toBe('Note');
  });

  it('localizes month, date and entry type without changing the raw identity', () => {
    const polish = createPivotLabelResolver({
      clients: [],
      locale: 'pl',
      projects: [],
      t: (key) =>
        ({
          'pivot_table.entry_type.Note': 'Notatka',
          'pivot_table.entry_type.Worklog': 'Czas pracy',
        })[key] ?? key,
      users: [],
    });

    expect(polish(PIVOT_KEY.MONTH_YEAR, '2026-08')).toBe('sierpień 2026');
    expect(polish(PIVOT_KEY.DATE, '2026-08-13')).toBe('13.08.2026');
    expect(polish(PIVOT_KEY.ENTRY_TYPE, 'Worklog')).toBe('Czas pracy');
  });

  it('resolves TaskKey to the raw task id, and null, empty string, and whitespace-only to the no-task label', () => {
    expect(resolver(PIVOT_KEY.TASK, 'PROJ-1')).toBe('PROJ-1');
    expect(resolver(PIVOT_KEY.TASK, null)).toBe('(No task)');
    expect(resolver(PIVOT_KEY.TASK, '')).toBe('(No task)');
    expect(resolver(PIVOT_KEY.TASK, '   ')).toBe('(No task)');
  });

  it('resolves a TaskKey made only of control characters to the no-task label instead of a blank string', () => {
    expect(resolver(PIVOT_KEY.TASK, '\u0000')).toBe('(No task)');
  });

  it('sanitizes a TaskKey label so it can never fail export label validation', () => {
    expect(resolver(PIVOT_KEY.TASK, 'PROJ-1\tPROJ-2')).toBe('PROJ-1 PROJ-2');
    expect(resolver(PIVOT_KEY.TASK, 'a'.repeat(200))).toBe(`${'a'.repeat(139)}…`);
    expect(resolver(PIVOT_KEY.TASK, 'a'.repeat(200))).toHaveLength(140);
  });

  it('does not truncate 71 supplementary-plane code points even though their UTF-16 length exceeds 140', () => {
    const emoji = '😀'.repeat(71);
    expect(emoji).toHaveLength(142);
    expect(resolver(PIVOT_KEY.TASK, emoji)).toBe(emoji);
  });

  it('truncates a supplementary-plane TaskKey label at a code point boundary instead of splitting a surrogate pair', () => {
    const emoji = '😀'.repeat(150);
    const result = resolver(PIVOT_KEY.TASK, emoji);

    expect(result).toBe(`${'😀'.repeat(139)}…`);
    expect(Array.from(result)).toHaveLength(140);
  });

  it.each([
    [PIVOT_KEY.USER, '44444444-4444-4444-8444-444444444444'],
    [PIVOT_KEY.PROJECT, '55555555-5555-4555-8555-555555555555'],
    [PIVOT_KEY.CLIENT, '66666666-6666-4666-8666-666666666666'],
  ])('uses the existing unknown-value fallback for %s', (key, value) => {
    expect(resolver(key, value)).toBe(`Unknown (${value})`);
  });
});

describe('buildPivotMemberIdentities', () => {
  it('deduplicates typed row and column coordinates in first-seen response order', () => {
    const response: WorkUnitPivotQueryResponse = {
      ...emptyResponse([
        {
          row: {
            kind: 'Leaf',
            path: [
              { key: PIVOT_KEY.USER, value: userId },
              { key: PIVOT_KEY.PROJECT, value: projectId },
            ],
          },
          column: { kind: 'Leaf', path: [{ key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' }] },
          values: { entriesCount: 1 },
        },
        {
          row: {
            kind: 'Leaf',
            path: [
              { key: PIVOT_KEY.USER, value: userId },
              { key: PIVOT_KEY.PROJECT, value: projectId },
              { key: PIVOT_KEY.CLIENT, value: null },
            ],
          },
          column: {
            kind: 'Leaf',
            path: [
              { key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' },
              { key: PIVOT_KEY.DATE, value: '2026-08-13' },
              { key: PIVOT_KEY.YEAR, value: 2026 },
              { key: PIVOT_KEY.ENTRY_TYPE, value: 'Worklog' },
            ],
          },
          values: { entriesCount: 1 },
        },
      ]),
      filterMembers: [
        { key: PIVOT_KEY.ENTRY_TYPE, members: [{ available: true, value: 'Note' }] },
        {
          key: PIVOT_KEY.CLIENT,
          members: [{ available: false, value: '77777777-7777-4777-8777-777777777777' }],
        },
      ],
    };

    expect(buildPivotMemberIdentities(response)).toEqual([
      { key: PIVOT_KEY.USER, value: userId },
      { key: PIVOT_KEY.PROJECT, value: projectId },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' },
      { key: PIVOT_KEY.CLIENT, value: null },
      { key: PIVOT_KEY.DATE, value: '2026-08-13' },
      { key: PIVOT_KEY.YEAR, value: 2026 },
      { key: PIVOT_KEY.ENTRY_TYPE, value: 'Worklog' },
    ]);
    expect(buildPivotMemberIdentities(response)).not.toContainEqual({
      key: PIVOT_KEY.ENTRY_TYPE,
      value: 'Note',
    });
  });

  it('adds synthesized Month-only identities in chronological order at the first Month position', () => {
    const response = emptyResponse([
      {
        row: { kind: 'Leaf', path: [{ key: PIVOT_KEY.USER, value: userId }] },
        column: { kind: 'Leaf', path: [{ key: PIVOT_KEY.MONTH_YEAR, value: '2026-05' }] },
        values: { entriesCount: 1 },
      },
    ]);
    const request: WorkUnitPivotQueryRequest = {
      rows: [PIVOT_KEY.USER],
      columns: [PIVOT_KEY.MONTH_YEAR],
      values: [PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };

    expect(
      buildPivotMemberIdentities(response, request, {
        dateFrom: '2026-02-01',
        effectiveDateTo: '2026-08-20',
      }),
    ).toEqual([
      { key: PIVOT_KEY.USER, value: userId },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-02' },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-03' },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-04' },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-05' },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-06' },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-07' },
      { key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' },
    ]);
  });

  it('preserves every visible identity in a legal response containing more than 10,000 identities', () => {
    const cells: PivotCell[] = Array.from({ length: 2_000 }, (_, index) => {
      const suffix = (index + 1).toString(16).padStart(12, '0');
      const year = 1000 + index;
      const value = `00000000-0000-4000-8000-${suffix}`;

      return {
        row: {
          kind: 'Leaf',
          path: [
            { key: PIVOT_KEY.USER, value },
            { key: PIVOT_KEY.PROJECT, value },
            { key: PIVOT_KEY.CLIENT, value },
            { key: PIVOT_KEY.YEAR, value: year },
            { key: PIVOT_KEY.MONTH_YEAR, value: `${year}-01` },
            { key: PIVOT_KEY.DATE, value: `${year}-01-01` },
            { key: PIVOT_KEY.ENTRY_TYPE, value: index % 2 === 0 ? 'Worklog' : 'Note' },
          ],
        },
        column: { kind: 'Leaf', path: [] },
        values: { entriesCount: 1 },
      };
    });
    const response = emptyResponse(cells);

    const identities = buildPivotMemberIdentities(response);

    expect(identities).toHaveLength(12_002);
    expect(identities[0]).toEqual({ key: PIVOT_KEY.USER, value: '00000000-0000-4000-8000-000000000001' });
    expect(identities.at(-1)).toEqual({ key: PIVOT_KEY.DATE, value: '2999-01-01' });
  });
});
