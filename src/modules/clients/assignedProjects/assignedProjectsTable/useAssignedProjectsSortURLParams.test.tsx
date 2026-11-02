import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAssignedProjectsSortURLParams } from './useAssignedProjectsSortURLParams';

const AssignedProjectsHarness = (): JSX.Element => {
  const location = useLocation();
  const params = useAssignedProjectsSortURLParams();

  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
      <output data-testid="sort-column">{params.sortColumn}</output>
      <output data-testid="sort-direction">{params.sortDirection}</output>
      <button onClick={() => params.updateSort(SortColumn.Project)}>toggle sort</button>
    </>
  );
};

const renderApp = (
  entry: string | { pathname: string; state?: unknown } = '/clients/client-1/assigned-projects',
): void => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/clients/:clientId/assigned-projects" element={<AssignedProjectsHarness />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('useAssignedProjectsSortURLParams', () => {
  it('defaults to Project/Desc when the URL has no sort param', () => {
    renderApp();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('reads sortDirection from the URL on mount', () => {
    renderApp('/clients/client-1/assigned-projects?assignedProjectsSortDirection=Asc');

    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('falls back to the default for an invalid/unsupported sort direction, rather than throwing', () => {
    expect(() => renderApp('/clients/client-1/assigned-projects?assignedProjectsSortDirection=Sideways')).not.toThrow();

    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('writes the toggled direction to the URL under its own, table-scoped param name', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'toggle sort' }));

    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
    expect(screen.getByTestId('search')).toHaveTextContent('assignedProjectsSortDirection=Asc');
  });

  it('round-trips back to no param on a second toggle (default direction is not written)', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'toggle sort' }));
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);

    await user.click(screen.getByRole('button', { name: 'toggle sort' }));
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  // Regression guard: ClientDetails' GoBack link reads fromListSearch off router state (see
  // from-list-search.ts's readFromListSearch); this hook's own `replace` navigate must not drop it.
  it('forwards existing router state through its own navigate call', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/clients/client-1/assigned-projects', state: { fromListSearch: '?status=Archived' } });

    await user.click(screen.getByRole('button', { name: 'toggle sort' }));

    expect(screen.getByTestId('state')).toHaveTextContent(JSON.stringify({ fromListSearch: '?status=Archived' }));
  });
});
