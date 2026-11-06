import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { ClientFilterType, ClientStatus } from '@/modules/clients/types';
import { useRef } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useClientsURLParams } from './useClientsURLParams';

const ClientsHarness = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useClientsURLParams();

  const searchChangesRef = useRef(0);
  const prevSearchRef = useRef(location.search);
  if (location.search !== prevSearchRef.current) {
    prevSearchRef.current = location.search;
    searchChangesRef.current += 1;
  }

  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="search-changes">{searchChangesRef.current}</output>
      <output data-testid="query">{params.query}</output>
      <output data-testid="status">{params.selectedStatus}</output>
      <output data-testid="type">{params.selectedFilterType}</output>
      <output data-testid="sort-column">{params.sortColumn}</output>
      <output data-testid="sort-direction">{params.sortDirection}</output>
      <input data-testid="query-input" value={params.query} onChange={(e) => params.setQuery(e.target.value)} />
      <button onClick={() => params.setQuery('acme')}>set query</button>
      <button onClick={() => params.setSelectedStatus(ClientStatus.Archived)}>set archived</button>
      <button onClick={() => params.setSelectedFilterType(ClientFilterType.Internal)}>set internal</button>
      <button onClick={() => params.updateSort(SortColumn.DateAdded)}>sort by date added</button>
      <button onClick={() => params.resetFilters()}>reset</button>
      {
}
      <button onClick={() => navigate('/clients/client-1/client-details')}>open client details</button>
    </>
  );
};

const ClientDetailsHarness = (): JSX.Element => {
  const navigate = useNavigate();
  return (
    <>
      <output>client details</output>
      <button onClick={() => navigate(-1)}>back to clients</button>
    </>
  );
};

const renderApp = (entry = '/clients'): void => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/clients" element={<ClientsHarness />} />
        <Route path="/clients/:id/:tab" element={<ClientDetailsHarness />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('useClientsURLParams', () => {
  it('defaults to empty query, active status, and all filter type when the URL has no params', () => {
    renderApp('/clients');

    expect(screen.getByTestId('query')).toHaveTextContent('');
    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Active);
    expect(screen.getByTestId('type')).toHaveTextContent(ClientFilterType.All);
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Client);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('reads query/status/type from the URL on mount', () => {
    renderApp('/clients?q=acme&status=Archived&type=Internal');

    expect(screen.getByTestId('query')).toHaveTextContent('acme');
    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Archived);
    expect(screen.getByTestId('type')).toHaveTextContent(ClientFilterType.Internal);
  });

  it('reads sortColumn/sortDirection from the URL on mount', () => {
    renderApp('/clients?sortColumn=Date%20added&sortDirection=Asc');

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('falls back to defaults for an invalid/stale status or type in the URL rather than throwing', () => {
    expect(() => renderApp('/clients?status=NotAStatus&type=NotAType')).not.toThrow();

    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Active);
    expect(screen.getByTestId('type')).toHaveTextContent(ClientFilterType.All);
  });

  it('falls back to defaults for an invalid/unsupported sort column or direction in the URL', () => {
    expect(() => renderApp('/clients?sortColumn=Members&sortDirection=Sideways')).not.toThrow();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Client);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('writes query changes to the URL via replace, once the debounced write settles', async () => {
    const user = userEvent.setup();
    renderApp('/clients');

    await user.click(screen.getByRole('button', { name: 'set query' }));

    expect(screen.getByTestId('query')).toHaveTextContent('acme');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=acme'));
  });

  it('writes status and type selections to the URL', async () => {
    const user = userEvent.setup();
    renderApp('/clients');

    await user.click(screen.getByRole('button', { name: 'set archived' }));
    await user.click(screen.getByRole('button', { name: 'set internal' }));

    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Archived);
    expect(screen.getByTestId('type')).toHaveTextContent(ClientFilterType.Internal);
    expect(screen.getByTestId('search')).toHaveTextContent('status=Archived');
    expect(screen.getByTestId('search')).toHaveTextContent('type=Internal');
  });

  it('writes both sort column and direction to the URL from a single updateSort call', async () => {
    const user = userEvent.setup();
    renderApp('/clients');

    await user.click(screen.getByRole('button', { name: 'sort by date added' }));

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
    expect(screen.getByTestId('search')).toHaveTextContent('sortColumn=Date+added');
    expect(screen.getByTestId('search')).toHaveTextContent('sortDirection=Asc');
  });

  it('removes a param from the URL when it is set back to its default, instead of leaving a stale value', async () => {
    const user = userEvent.setup();
    renderApp('/clients?status=Archived');

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(screen.getByTestId('search')).toHaveTextContent('');
    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Active);
  });

  it('leaves the sort untouched when resetting filters', async () => {
    const user = userEvent.setup();
    renderApp('/clients?status=Archived');

    await user.click(screen.getByRole('button', { name: 'sort by date added' }));
    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Active);
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('preserves unrelated existing URL params when writing its own', async () => {
    const user = userEvent.setup();
    renderApp('/clients?unrelated=keep-me');

    await user.click(screen.getByRole('button', { name: 'set query' }));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=acme'));
    expect(screen.getByTestId('search')).toHaveTextContent('unrelated=keep-me');
  });

  it('restores a selected filter after navigating to client details and back', async () => {
    const user = userEvent.setup();
    renderApp('/clients');

    await user.click(screen.getByRole('button', { name: 'set archived' }));
    expect(screen.getByTestId('status')).toHaveTextContent(ClientStatus.Archived);

    await user.click(screen.getByRole('button', { name: 'open client details' }));
    expect(screen.getByText('client details')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'back to clients' }));

    expect(await screen.findByTestId('status')).toHaveTextContent(ClientStatus.Archived);
  });

  it('restores the sort after navigating to client details and back', async () => {
    const user = userEvent.setup();
    renderApp('/clients');

    await user.click(screen.getByRole('button', { name: 'sort by date added' }));
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);

    await user.click(screen.getByRole('button', { name: 'open client details' }));
    expect(screen.getByText('client details')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'back to clients' }));

    expect(await screen.findByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('restores the query after navigating to client details and back, once the debounced write has settled', async () => {
    const user = userEvent.setup();
    renderApp('/clients');

    await user.click(screen.getByRole('button', { name: 'set query' }));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=acme'));

    await user.click(screen.getByRole('button', { name: 'open client details' }));
    expect(screen.getByText('client details')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'back to clients' }));

    expect(await screen.findByTestId('query')).toHaveTextContent('acme');
  });

  describe('debounced query URL write', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not write to the URL on every keystroke, only once after typing settles', () => {
      renderApp('/clients');
      const input = screen.getByTestId('query-input');

      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ac' } });
      fireEvent.change(input, { target: { value: 'acm' } });
      fireEvent.change(input, { target: { value: 'acme' } });

      expect(screen.getByTestId('query')).toHaveTextContent('acme');
      expect(screen.getByTestId('search')).toHaveTextContent('');
      expect(screen.getByTestId('search-changes')).toHaveTextContent('0');

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('search')).toHaveTextContent('q=acme');
      expect(screen.getByTestId('search-changes')).toHaveTextContent('1');
    });
  });
});
