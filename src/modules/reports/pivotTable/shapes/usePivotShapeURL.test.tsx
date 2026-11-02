import { StrictMode, useCallback, useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import { DEFAULT_PIVOT_LAYOUT, movePivotField } from '../layout/pivotLayout';
import type { PivotFieldMove, PivotLayout } from '../layout/types';
import type { PivotTableView } from '../usePivotTableView';
import { usePivotShapeURL } from './usePivotShapeURL';

let current: ReturnType<typeof usePivotShapeURL> & { layout: PivotLayout; goBack: () => void };

const Harness = (): JSX.Element => {
  const [layout, setLayout] = useState<PivotLayout>(DEFAULT_PIVOT_LAYOUT);
  const moveField = useCallback(
    (move: PivotFieldMove) => {
      const result = movePivotField(layout, move);
      if (result.accepted) setLayout(result.layout);
      return result;
    },
    [layout],
  );
  const view = { layout, moveField, replaceLayout: setLayout } as unknown as PivotTableView;
  const shapeURL = usePivotShapeURL(view);
  const location = useLocation();
  const navigate = useNavigate();
  current = { ...shapeURL, layout, goBack: () => navigate(-1) };
  return <output aria-label="url">{location.pathname + location.search}</output>;
};

const renderAt = (url: string): void => {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <Harness />
      </MemoryRouter>
    </StrictMode>,
  );
};
const url = (): string => screen.getByLabelText('url').textContent ?? '';

describe('usePivotShapeURL', () => {
  it('writes the current rows, columns and values into a URL that has none', () => {
    renderAt('/pivot-table?startDate=2026-10-01');

    expect(url()).toBe('/pivot-table?startDate=2026-10-01&rows=MonthYearKey&rows=UserKey&values=DurationSum');
  });

  it('builds the table from the URL', () => {
    renderAt('/pivot-table?rows=ClientKey&rows=ProjectKey&rows=UserKey&values=DurationSum');

    expect(current.layout.rows).toEqual(['ClientKey', 'ProjectKey', 'UserKey']);
    expect(current.layout.columns).toEqual([]);
    expect(current.selectedShapeURL).toBe(
      '/pivot-table?rows=ClientKey&rows=ProjectKey&rows=UserKey&values=DurationSum',
    );
  });

  it('writes a manual change into the URL and shows it as custom when no option matches', () => {
    renderAt('/pivot-table?endDate=2026-10-31&rows=UserKey&columns=MonthYearKey&values=DurationSum');

    act(() => {
      current.moveField({ field: 'MonthYearKey', destination: 'rows', index: 1 });
    });

    expect(url()).toBe('/pivot-table?endDate=2026-10-31&rows=UserKey&rows=MonthYearKey&values=DurationSum');
    expect(current.selectedShapeURL).toBeNull();
  });

  it('offers each option as a URL with the current dates and switches the table to it, back included', () => {
    renderAt('/pivot-table?startDate=2026-10-01&rows=UserKey&columns=MonthYearKey&values=DurationSum');
    const option = current.shapeOptions.find(({ levels }) => levels.join() === 'ProjectKey,UserKey')!;

    expect(option.url).toBe('/pivot-table?startDate=2026-10-01&rows=ProjectKey&rows=UserKey&values=DurationSum');
    act(() => current.selectShape(option.url));
    expect(current.layout.rows).toEqual(['ProjectKey', 'UserKey']);

    act(() => current.goBack());
    expect(current.layout.rows).toEqual(['UserKey']);
  });
});
