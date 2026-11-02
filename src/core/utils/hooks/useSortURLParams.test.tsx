import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSortURLParams } from './useSortURLParams';

const Harness = (props: { forwardLocationState?: boolean }): JSX.Element => {
  const location = useLocation();
  const params = useSortURLParams({
    sortColumnParam: 'sortColumn',
    sortDirectionParam: 'sortDirection',
    validColumns: [SortColumn.Project, SortColumn.Client],
    defaultColumn: SortColumn.Project,
    defaultDirection: SortDirection.Desc,
    forwardLocationState: props.forwardLocationState,
  });

  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
      <output data-testid="sort-column">{params.sortColumn}</output>
      <output data-testid="sort-direction">{params.sortDirection}</output>
      <button onClick={() => params.updateSort(SortColumn.Project)}>sort by project</button>
      <button onClick={() => params.updateSort(SortColumn.Client)}>sort by client</button>
    </>
  );
};

const renderApp = (
  entry: string | { pathname: string; state?: unknown } = '/list',
  forwardLocationState?: boolean,
): void => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/list" element={<Harness forwardLocationState={forwardLocationState} />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('useSortURLParams', () => {
  it('defaults to the given defaultColumn/defaultDirection when the URL has no sort params', () => {
    renderApp();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('reads sortColumn/sortDirection from the URL on mount', () => {
    renderApp('/list?sortColumn=Client&sortDirection=Asc');

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Client);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('falls back to defaults for a column outside validColumns or an invalid direction', () => {
    expect(() => renderApp('/list?sortColumn=Members&sortDirection=Sideways')).not.toThrow();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('writes both sort column and direction to the URL from a single updateSort call', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'sort by client' }));

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Client);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
    expect(screen.getByTestId('search')).toHaveTextContent('sortColumn=Client');
    expect(screen.getByTestId('search')).toHaveTextContent('sortDirection=Asc');
  });

  it('round-trips back to no params on toggling back to the default column/direction', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'sort by project' }));
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);

    await user.click(screen.getByRole('button', { name: 'sort by project' }));
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('does not forward router state by default', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/list', state: { fromListSearch: '?status=Archived' } });

    await user.click(screen.getByRole('button', { name: 'sort by client' }));

    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });

  it('forwards router state when forwardLocationState is true', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/list', state: { fromListSearch: '?status=Archived' } }, true);

    await user.click(screen.getByRole('button', { name: 'sort by client' }));

    expect(screen.getByTestId('state')).toHaveTextContent(JSON.stringify({ fromListSearch: '?status=Archived' }));
  });
});
