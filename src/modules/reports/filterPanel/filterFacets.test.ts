import type { PivotCell } from '@/modules/reports/pivotTable/types';
import { computeFilterFacets, FacetCell, formatFacetHours, toFacetCells } from './filterFacets';

const H = 3600;
const cells: FacetCell[] = [
  { clientId: 'c1', projectId: 'p1', userId: 'adam', seconds: 5 * H },
  { clientId: 'c1', projectId: 'p1', userId: 'iga', seconds: 2 * H },
  { clientId: 'c1', projectId: 'p2', userId: 'iga', seconds: 1 * H },
  { clientId: 'c2', projectId: 'p3', userId: 'jan', seconds: 4 * H },
];
const none = { clientIds: [], projectIds: [], userIds: [] };

describe('computeFilterFacets', () => {
  it('sums everything when nothing is selected', () => {
    const facets = computeFilterFacets(cells, none);
    expect(Object.fromEntries(facets.users)).toEqual({ adam: 5 * H, iga: 3 * H, jan: 4 * H });
    expect(Object.fromEntries(facets.projects)).toEqual({ p1: 7 * H, p2: 1 * H, p3: 4 * H });
    expect(Object.fromEntries(facets.clients)).toEqual({ c1: 8 * H, c2: 4 * H });
  });

  it("ignores a category's own selection, so other options stay available", () => {
    const facets = computeFilterFacets(cells, { ...none, userIds: ['adam'] });
    expect(Object.fromEntries(facets.users)).toEqual({ adam: 5 * H, iga: 3 * H, jan: 4 * H });
    expect(Object.fromEntries(facets.projects)).toEqual({ p1: 5 * H });
    expect(Object.fromEntries(facets.clients)).toEqual({ c1: 5 * H });
  });

  it('narrows by the other categories regardless of the order they were picked in', () => {
    const facets = computeFilterFacets(cells, { clientIds: ['c1'], projectIds: ['p1'], userIds: [] });
    expect(Object.fromEntries(facets.users)).toEqual({ adam: 5 * H, iga: 2 * H });
    expect(Object.fromEntries(facets.projects)).toEqual({ p1: 7 * H, p2: 1 * H });
    expect(Object.fromEntries(facets.clients)).toEqual({ c1: 7 * H });
  });

  it('never counts cells without an id into an option', () => {
    const facets = computeFilterFacets([{ clientId: null, projectId: 'p9', userId: 'adam', seconds: H }], none);
    expect(facets.clients.size).toBe(0);
    expect(facets.projects.get('p9')).toBe(H);
  });
});

describe('toFacetCells', () => {
  it('reads leaf cells by dimension key and converts the duration to seconds', () => {
    const leaf = {
      row: {
        kind: 'Leaf',
        path: [
          { key: 'ClientKey', value: 'c1' },
          { key: 'ProjectKey', value: 'p1' },
          { key: 'UserKey', value: 'adam' },
        ],
      },
      column: { kind: 'GrandTotal', path: [] },
      values: { durationSum: { seconds: 5400, nanoseconds: 500_000_000 } },
    } as unknown as PivotCell;
    const total = { ...leaf, row: { kind: 'GrandTotal', path: [] } } as unknown as PivotCell;

    expect(toFacetCells([leaf, total])).toEqual([{ clientId: 'c1', projectId: 'p1', userId: 'adam', seconds: 5400.5 }]);
  });
});

describe('formatFacetHours', () => {
  it('formats like the report hours column', () => {
    expect(formatFacetHours(45 * 60)).toBe('00:45');
    expect(formatFacetHours(193 * H + 15 * 60)).toBe('193:15');
    expect(formatFacetHours(89.6)).toBe('00:01');
  });
});
