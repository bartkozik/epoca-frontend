import { SpreadsheetFormat } from '@/modules/reports/types';
import { PIVOT_KEY, PIVOT_VALUE } from './constants';
import {
  buildPivotExportPresentation,
  FIXED_ALLOWANCE_BYTES,
  pivotExportBodyBudget,
  PivotExportBudgetMismatchError,
  pivotExportFileName,
  pivotExportMemberLimit,
  ROUTE_MAX_BYTES,
  serializePivotExportRequest,
  utf8ByteLength,
} from './pivotExport';
import type {
  PivotExportPresentation,
  PivotFilterValue,
  WorkUnitPivotExportRequest,
  WorkUnitPivotQueryRequest,
} from './types';

const query: WorkUnitPivotQueryRequest = {
  rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT],
  filters: [{ includedValues: ['Worklog'], key: PIVOT_KEY.ENTRY_TYPE }],
  options: { columnSubtotals: true, grandTotals: true, rowSubtotals: true },
};

const labels: Record<string, string> = {
  [`pivot_table.dimensions.${PIVOT_KEY.USER}`]: 'User',
  [`pivot_table.dimensions.${PIVOT_KEY.PROJECT}`]: 'Project',
  [`pivot_table.dimensions.${PIVOT_KEY.CLIENT}`]: 'Client',
  [`pivot_table.dimensions.${PIVOT_KEY.YEAR}`]: 'Year',
  [`pivot_table.dimensions.${PIVOT_KEY.MONTH_YEAR}`]: 'Month',
  [`pivot_table.dimensions.${PIVOT_KEY.DATE}`]: 'Date',
  [`pivot_table.dimensions.${PIVOT_KEY.ENTRY_TYPE}`]: 'Entry type',
  [`pivot_table.dimensions.${PIVOT_KEY.TASK}`]: 'Task',
  [`pivot_table.values.${PIVOT_VALUE.DURATION_SUM}`]: 'Total duration',
  [`pivot_table.values.${PIVOT_VALUE.DURATION_AVG}`]: 'Average duration',
  [`pivot_table.values.${PIVOT_VALUE.ENTRIES_COUNT}`]: 'Entry count',
  'pivot_table.filter.no_client': '(No client)',
  'pivot_table.table.grand_total': 'Grand total',
  'pivot_table.table.subtotal': 'Subtotal',
};
const t = (key: string): string => labels[key] ?? key;
const resolveLabel = (key: string, value: PivotFilterValue): string =>
  key === PIVOT_KEY.CLIENT && value === null ? '(No client)' : `label:${key}:${String(value)}`;
const identities = [
  { key: PIVOT_KEY.USER, value: '11111111-1111-4111-8111-111111111111' },
  { key: PIVOT_KEY.PROJECT, value: '22222222-2222-4222-8222-222222222222' },
  { key: PIVOT_KEY.CLIENT, value: null },
  { key: PIVOT_KEY.YEAR, value: 2026 },
  { key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' },
  { key: PIVOT_KEY.DATE, value: '2026-08-13' },
  { key: PIVOT_KEY.ENTRY_TYPE, value: 'Worklog' },
] as const;

const validPresentation = (): PivotExportPresentation =>
  buildPivotExportPresentation({ memberIdentities: identities, query, resolveLabel, t });

const projection = { effectiveDateTo: '2026-08-20' };
const envelope = (presentation = validPresentation()): WorkUnitPivotExportRequest => ({
  presentation,
  projection,
  query,
});

describe('buildPivotExportPresentation', () => {
  it('builds all field, measure, total and typed coordinate labels in contract order', () => {
    const presentation = validPresentation();

    expect(Object.keys(presentation)).toEqual([
      'fieldLabels',
      'measureLabels',
      'subtotalLabel',
      'grandTotalLabel',
      'noClientLabel',
      'memberLabels',
    ]);
    expect(presentation.fieldLabels).toEqual({
      [PIVOT_KEY.USER]: 'User',
      [PIVOT_KEY.PROJECT]: 'Project',
      [PIVOT_KEY.CLIENT]: 'Client',
      [PIVOT_KEY.YEAR]: 'Year',
      [PIVOT_KEY.MONTH_YEAR]: 'Month',
      [PIVOT_KEY.DATE]: 'Date',
      [PIVOT_KEY.ENTRY_TYPE]: 'Entry type',
    });
    expect(presentation.measureLabels).toEqual({
      [PIVOT_VALUE.DURATION_SUM]: 'Total duration',
      [PIVOT_VALUE.DURATION_AVG]: 'Average duration',
      [PIVOT_VALUE.ENTRIES_COUNT]: 'Entry count',
    });
    expect(presentation.subtotalLabel).toBe('Subtotal');
    expect(presentation.grandTotalLabel).toBe('Grand total');
    expect(presentation.noClientLabel).toBe('(No client)');
    expect(presentation.memberLabels).toEqual(
      identities.map(({ key, value }) => ({ key, value, label: resolveLabel(key, value) })),
    );
  });

  it('omits fieldLabels.TaskKey and noTaskLabel when the query does not group by TaskKey', () => {
    const presentation = buildPivotExportPresentation({ memberIdentities: identities, query, resolveLabel, t });

    expect(presentation.fieldLabels).not.toHaveProperty(PIVOT_KEY.TASK);
    expect(presentation.noTaskLabel).toBeUndefined();
  });

  it('includes fieldLabels.TaskKey and noTaskLabel when the query groups by TaskKey', () => {
    const taskQuery: WorkUnitPivotQueryRequest = { ...query, rows: [...query.rows, PIVOT_KEY.TASK] };
    const presentation = buildPivotExportPresentation({
      memberIdentities: identities,
      query: taskQuery,
      resolveLabel,
      t,
    });

    expect(presentation.fieldLabels[PIVOT_KEY.TASK]).toBe('Task');
    expect(presentation.noTaskLabel).toBe(resolveLabel(PIVOT_KEY.TASK, null));
  });

  it('serializes fieldLabels.TaskKey and noTaskLabel through the full canonicalization pipeline instead of silently dropping them', () => {
    const taskQuery: WorkUnitPivotQueryRequest = { ...query, rows: [...query.rows, PIVOT_KEY.TASK] };
    const presentation = buildPivotExportPresentation({
      memberIdentities: identities,
      query: taskQuery,
      resolveLabel,
      t,
    });

    const serialized = serializePivotExportRequest({ presentation, projection, query: taskQuery }, 9_600);
    const parsed = JSON.parse(serialized) as WorkUnitPivotExportRequest;

    expect(parsed.presentation.fieldLabels[PIVOT_KEY.TASK]).toBe('Task');
    expect(parsed.presentation.noTaskLabel).toBe(resolveLabel(PIVOT_KEY.TASK, null));
  });
});

describe('utf8ByteLength', () => {
  it.each([
    ['ASCII', 'A', 1],
    ['two-byte code point', 'é', 2],
    ['three-byte code point', '漢', 3],
    ['supplementary code point', '😀', 4],
    ['mixed code points', 'Aé漢😀', 10],
    ['unpaired high surrogate as UTF-8 replacement', String.fromCharCode(0xd800), 3],
    ['unpaired low surrogate as UTF-8 replacement', String.fromCharCode(0xdc00), 3],
  ])('counts exact UTF-8 bytes for %s', (_caseName, value, expected) => {
    expect(utf8ByteLength(value)).toBe(expected);
  });

  it('returns the first byte count over the limit and does not scan the remaining suffix', () => {
    expect(utf8ByteLength('ab😀ignored', 5)).toBe(6);
    expect(utf8ByteLength('a'.repeat(1_000), 1_000)).toBe(1_000);
    expect(utf8ByteLength('a'.repeat(1_000), 999)).toBe(1_000);
  });

  it('scans a large body without materializing a per-code-point aggregate', () => {
    const largeBody = `prefix-${'a'.repeat(100_000)}-😀`;
    const arrayFrom = vi.spyOn(Array, 'from').mockImplementation(() => {
      throw new Error('aggregate materialization is forbidden');
    });
    let byteLength: number | undefined;

    try {
      byteLength = utf8ByteLength(largeBody);
    } finally {
      arrayFrom.mockRestore();
    }

    expect(byteLength).toBe(100_012);
  });

  it('validates and serializes presentation labels without materializing code-point arrays', () => {
    const presentation = validPresentation();
    presentation.memberLabels[0].label = '😀'.repeat(140);
    const arrayFrom = vi.spyOn(Array, 'from').mockImplementation(() => {
      throw new Error('aggregate materialization is forbidden');
    });
    let serialized: string | undefined;

    try {
      serialized = serializePivotExportRequest(envelope(presentation), 9_600);
    } finally {
      arrayFrom.mockRestore();
    }

    expect(serialized).toContain('😀'.repeat(140));
  });
});

describe('pivot export serialization bounds', () => {
  it('serializes compact canonical JSON in contract property order and normalizes CR/LF/tab runs', () => {
    const presentation = validPresentation();
    presentation.fieldLabels[PIVOT_KEY.USER] = 'User\r\n\t label';
    presentation.measureLabels[PIVOT_VALUE.DURATION_SUM] = 'Total\n duration';
    presentation.subtotalLabel = 'Sub\rtotal';
    presentation.grandTotalLabel = 'Grand\ttotal';
    presentation.noClientLabel = 'No\n\rclient';
    presentation.memberLabels[0].label = 'Alice\t\r\nSmith';

    const serialized = serializePivotExportRequest(envelope(presentation), 9_600);
    const parsed = JSON.parse(serialized) as WorkUnitPivotExportRequest;

    expect(serialized).not.toMatch(/\n|\r|\t/);
    expect(Object.keys(parsed)).toEqual(['query', 'projection', 'presentation']);
    expect(Object.keys(parsed.query)).toEqual(['rows', 'columns', 'values', 'filters', 'options']);
    expect(parsed.projection).toEqual({ effectiveDateTo: '2026-08-20' });
    expect(Object.keys(parsed.presentation)).toEqual([
      'fieldLabels',
      'measureLabels',
      'subtotalLabel',
      'grandTotalLabel',
      'noClientLabel',
      'memberLabels',
    ]);
    expect(parsed.presentation.fieldLabels[PIVOT_KEY.USER]).toBe('User  label');
    expect(parsed.presentation.measureLabels[PIVOT_VALUE.DURATION_SUM]).toBe('Total  duration');
    expect(parsed.presentation.subtotalLabel).toBe('Sub total');
    expect(parsed.presentation.grandTotalLabel).toBe('Grand total');
    expect(parsed.presentation.noClientLabel).toBe('No client');
    expect(parsed.presentation.memberLabels[0].label).toBe('Alice Smith');
    expect(serialized).toBe(JSON.stringify(parsed));
  });

  it.each([
    ['ASCII', 'a'.repeat(140)],
    ['Polish and CJK', 'Zażółć漢字'.repeat(18).slice(0, 140)],
    ['supplementary Unicode at exactly 560 UTF-8 bytes', '😀'.repeat(140)],
    ['quotes and backslashes', '"\\😀'.repeat(46) + '"\\'],
  ])('accepts a legal 140-code-point %s label', (_caseName, boundary) => {
    const presentation = validPresentation();
    presentation.memberLabels[0].label = boundary;

    const serialized = serializePivotExportRequest(envelope(presentation), 9_600);
    const entry = JSON.stringify((JSON.parse(serialized) as WorkUnitPivotExportRequest).presentation.memberLabels[0]);

    expect(Array.from(boundary)).toHaveLength(140);
    expect(utf8ByteLength(entry)).toBeLessThanOrEqual(768);
  });

  it.each([
    ['141 code points', 'a'.repeat(141)],
    ['remaining C0 control', 'invalid\u0001label'],
    ['remaining C1 control', 'invalid\u0085label'],
    ['unpaired surrogate', `invalid${String.fromCharCode(0xd800)}label`],
    ['terminal unpaired high surrogate', `invalid${String.fromCharCode(0xd800)}`],
    ['blank', '\u2003 \t\n'],
  ])('rejects %s after normalization', (_caseName, invalidLabel) => {
    const presentation = validPresentation();
    presentation.memberLabels[0].label = invalidLabel;

    expect(() => serializePivotExportRequest(envelope(presentation), 9_600)).toThrow(
      'Invalid pivot export presentation label',
    );
  });

  it.each([
    ['non-canonical month/day width', '2026-8-20'],
    ['impossible calendar date', '2026-02-30'],
    ['zero month', '2026-00-20'],
    ['trailing time', '2026-08-20T00:00:00Z'],
  ])('rejects an invalid projection date: %s', (_caseName, effectiveDateTo) => {
    expect(() => serializePivotExportRequest({ ...envelope(), projection: { effectiveDateTo } }, 9_600)).toThrow(
      'Invalid pivot export projection date',
    );
  });

  it('enforces the exact derived member-count boundary before serialization', () => {
    const presentation = validPresentation();
    presentation.memberLabels = Array.from({ length: 8 }, (_, index) => ({
      key: PIVOT_KEY.YEAR,
      label: `Year ${index}`,
      value: 2000 + index,
    }));
    expect(() => serializePivotExportRequest(envelope(presentation), 1)).not.toThrow();

    presentation.memberLabels.push({ key: PIVOT_KEY.YEAR, label: 'Year 9', value: 2009 });
    expect(() => serializePivotExportRequest(envelope(presentation), 1)).toThrow(
      'Pivot export member label limit exceeded',
    );
  });

  it('drops an oversized TaskKey memberLabels entry (unconstrained raw value) instead of aborting the whole export', () => {
    const presentation = validPresentation();
    const oversizedTaskId = 'x'.repeat(750);
    presentation.memberLabels = [
      { key: PIVOT_KEY.TASK, label: 'label:TaskKey:oversized', value: oversizedTaskId },
      { key: PIVOT_KEY.YEAR, label: 'Year 2026', value: 2026 },
    ];
    expect(utf8ByteLength(JSON.stringify(presentation.memberLabels[0]))).toBeGreaterThan(768);

    const serialized = serializePivotExportRequest(envelope(presentation), 9_600);

    expect((JSON.parse(serialized) as WorkUnitPivotExportRequest).presentation.memberLabels).toEqual([
      { key: PIVOT_KEY.YEAR, label: 'Year 2026', value: 2026 },
    ]);
  });

  it('serializes more than 10,000 coordinate identities when the configured bound permits them', () => {
    const presentation = validPresentation();
    presentation.memberLabels = Array.from({ length: 10_001 }, (_, index) => ({
      key: PIVOT_KEY.YEAR,
      label: `Year ${index}`,
      value: index,
    }));

    const serialized = serializePivotExportRequest(envelope(presentation), 1_429);

    expect((JSON.parse(serialized) as WorkUnitPivotExportRequest).presentation.memberLabels).toHaveLength(10_001);
  });

  it('uses saturating arithmetic and preserves the reviewed current budget and route margin', () => {
    expect(FIXED_ALLOWANCE_BYTES).toBe(8_000_000);
    expect(ROUTE_MAX_BYTES).toBe(67_108_864);
    expect(pivotExportMemberLimit(9_600)).toBe(76_800);
    expect(pivotExportBodyBudget(9_600)).toBe(66_982_400);
    expect(pivotExportMemberLimit(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(pivotExportBodyBudget(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects a changed cell configuration whose derived canonical budget exceeds the route with a distinguishable error', () => {
    expect(pivotExportBodyBudget(11_000)).toBe(75_584_000);
    expect(() => serializePivotExportRequest(envelope(), 11_000)).toThrow(
      'Pivot export configuration exceeds the route limit',
    );

    let caught: unknown;
    try {
      serializePivotExportRequest(envelope(), 11_000);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PivotExportBudgetMismatchError);
  });

  it('rejects a compact body that exceeds its exact configured canonical budget', () => {
    const oversizedQuery: WorkUnitPivotQueryRequest = {
      ...query,
      filters: [{ includedValues: ['x'.repeat(8_010_000)], key: PIVOT_KEY.ENTRY_TYPE }],
    };

    expect(() =>
      serializePivotExportRequest({ presentation: validPresentation(), projection, query: oversizedQuery }, 1),
    ).toThrow('Pivot export request exceeds the configured body budget');
  });

  it('serializes synthesized Month labels in chronological localized order', () => {
    const presentation = validPresentation();
    presentation.memberLabels = ['2026-02', '2026-03', '2026-04'].map((value, index) => ({
      key: PIVOT_KEY.MONTH_YEAR,
      label: ['February 2026', 'March 2026', 'April 2026'][index],
      value,
    }));

    const parsed = JSON.parse(serializePivotExportRequest(envelope(presentation), 9_600)) as WorkUnitPivotExportRequest;

    expect(parsed.presentation.memberLabels).toEqual(presentation.memberLabels);
  });
});

describe('pivotExportFileName', () => {
  it('uses explicit date bounds and the spreadsheet extension', () => {
    expect(
      pivotExportFileName(
        { clientId: [], dateFrom: '2026-08-01', dateTo: '2026-08-13', projectId: [], userId: [] },
        SpreadsheetFormat.XLS,
      ),
    ).toBe('pivot_table_2026-08-01_2026-08-13.xlsx');
  });

  it('uses the literal open bound for an absent dateTo', () => {
    expect(
      pivotExportFileName({ clientId: [], dateFrom: '2026-08-01', projectId: [], userId: [] }, SpreadsheetFormat.CSV),
    ).toBe('pivot_table_2026-08-01_open.csv');
  });
});
