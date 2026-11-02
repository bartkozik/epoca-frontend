import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMembersSortURLParams } from './useMembersSortURLParams';

const MembersSortHarness = (): JSX.Element => {
  const location = useLocation();
  const params = useMembersSortURLParams();

  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="sort-column">{params.sortColumn}</output>
      <output data-testid="sort-direction">{params.sortDirection}</output>
      <button onClick={() => params.updateSort(SortColumn.UserName)}>toggle name</button>
      <button onClick={() => params.updateSort(SortColumn.UserRole)}>toggle role</button>
    </>
  );
};

const renderApp = (entry = '/team-settings/members/list'): void => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/team-settings/members/list" element={<MembersSortHarness />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('useMembersSortURLParams', () => {
  it('defaults to UserName/Desc when the URL has no sort param', () => {
    renderApp();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserName);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('reads both column and direction from the URL on mount', () => {
    const search = new URLSearchParams({
      membersSortColumn: SortColumn.UserRole,
      membersSortDirection: SortDirection.Asc,
    }).toString();
    renderApp(`/team-settings/members/list?${search}`);

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserRole);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('falls back to the default column for an invalid/unsupported value, rather than throwing', () => {
    expect(() => renderApp('/team-settings/members/list?membersSortColumn=Sideways')).not.toThrow();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserName);
  });

  it('writes the clicked column and toggled direction to the URL under table-scoped param names', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'toggle role' }));

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.UserRole);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
    expect(screen.getByTestId('search')).toHaveTextContent(
      new URLSearchParams({ membersSortColumn: SortColumn.UserRole }).toString(),
    );
    expect(screen.getByTestId('search')).toHaveTextContent('membersSortDirection=Asc');
  });

  it('round-trips back to no params on a second toggle of the default column (default state is not written)', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'toggle name' }));
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);

    await user.click(screen.getByRole('button', { name: 'toggle name' }));
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });
});
