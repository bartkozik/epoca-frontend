import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAssignedMembersSortURLParams } from './useAssignedMembersSortURLParams';

const AssignedMembersHarness = (): JSX.Element => {
  const location = useLocation();
  const params = useAssignedMembersSortURLParams();

  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
      <output data-testid="sort-column">{params.sortColumn}</output>
      <output data-testid="sort-direction">{params.sortDirection}</output>
      <button onClick={() => params.updateSort(SortColumn.UserName)}>sort by name</button>
      <button onClick={() => params.updateSort(SortColumn.UserRole)}>sort by role</button>
    </>
  );
};

const renderApp = (
  entry: string | { pathname: string; state?: unknown } = '/projects/project-1/assigned-members',
): void => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/projects/:id/:tab" element={<AssignedMembersHarness />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('useAssignedMembersSortURLParams', () => {
  it('defaults to User name/Desc when the URL has no sort params', () => {
    renderApp();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserName);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('reads sortColumn/sortDirection from the URL on mount', () => {
    renderApp(
      '/projects/project-1/assigned-members?assignedMembersSortColumn=User+role&assignedMembersSortDirection=Asc',
    );

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserRole);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('falls back to defaults for an invalid/unsupported sort column or direction, rather than throwing', () => {
    expect(() =>
      renderApp(
        '/projects/project-1/assigned-members?assignedMembersSortColumn=Client&assignedMembersSortDirection=Sideways',
      ),
    ).not.toThrow();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserName);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('writes both sort column and direction to the URL from a single updateSort call, under its own table-scoped param names', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'sort by role' }));

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserRole);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
    expect(screen.getByTestId('search')).toHaveTextContent('assignedMembersSortColumn');
    expect(screen.getByTestId('search')).toHaveTextContent('assignedMembersSortDirection=Asc');
  });

  it('round-trips back to no params on toggling back to the default column/direction', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'sort by name' }));
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);

    await user.click(screen.getByRole('button', { name: 'sort by name' }));
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserName);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  // Regression guard: ProjectDetails' GoBack link reads fromListSearch off router state (see
  // from-list-search.ts's readFromListSearch); this hook's own `replace` navigate must not drop it.
  it('forwards existing router state through its own navigate call', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/projects/project-1/assigned-members', state: { fromListSearch: '?status=Archived' } });

    await user.click(screen.getByRole('button', { name: 'sort by role' }));

    expect(screen.getByTestId('state')).toHaveTextContent(JSON.stringify({ fromListSearch: '?status=Archived' }));
  });
});
