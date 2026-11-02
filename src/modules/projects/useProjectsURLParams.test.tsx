import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { ProjectStatus } from '@/modules/projects/types';
import { useRef } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useProjectsURLParams } from './useProjectsURLParams';

const ProjectsHarness = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useProjectsURLParams();

  // Counts actual URL commits (not renders/keystrokes) so a test can assert the debounced query
  // write only lands once, instead of once per keystroke.
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
      <output data-testid="sort-column">{params.sortColumn}</output>
      <output data-testid="sort-direction">{params.sortDirection}</output>
      <input data-testid="query-input" value={params.query} onChange={(e) => params.setQuery(e.target.value)} />
      <button onClick={() => params.setQuery('acme')}>set query</button>
      <button onClick={() => params.setSelectedStatus(ProjectStatus.Archived)}>set archived</button>
      <button onClick={() => params.updateSort(SortColumn.Project)}>sort by project</button>
      <button onClick={() => params.resetFilters()}>reset</button>
      {/* mirrors the real app: clicking into a project's details page is a push navigation away
          from /projects, unrelated to the replace-based filter updates above */}
      <button onClick={() => navigate('/projects/project-1/project-details')}>open project details</button>
    </>
  );
};

const ProjectDetailsHarness = (): JSX.Element => {
  const navigate = useNavigate();
  return (
    <>
      <output>project details</output>
      <button onClick={() => navigate(-1)}>back to projects</button>
    </>
  );
};

const renderApp = (entry = '/projects'): void => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/projects" element={<ProjectsHarness />} />
        <Route path="/projects/:id/:tab" element={<ProjectDetailsHarness />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('useProjectsURLParams', () => {
  it('defaults to empty query, active status, and date-added/desc sort when the URL has no params', () => {
    renderApp('/projects');

    expect(screen.getByTestId('query')).toHaveTextContent('');
    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Active);
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('reads query/status from the URL on mount', () => {
    renderApp('/projects?q=acme&status=Archived');

    expect(screen.getByTestId('query')).toHaveTextContent('acme');
    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Archived);
  });

  it('reads sortColumn/sortDirection from the URL on mount', () => {
    renderApp('/projects?sortColumn=Client&sortDirection=Asc');

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Client);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('falls back to defaults for an invalid/stale status in the URL rather than throwing', () => {
    expect(() => renderApp('/projects?status=NotAStatus')).not.toThrow();

    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Active);
  });

  it('falls back to defaults for an invalid/unsupported sort column or direction in the URL', () => {
    expect(() => renderApp('/projects?sortColumn=User%20name&sortDirection=Sideways')).not.toThrow();

    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.DateAdded);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Desc);
  });

  it('writes query changes to the URL via replace, once the debounced write settles', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.click(screen.getByRole('button', { name: 'set query' }));

    // query itself (the controlled input's value) updates instantly, ahead of the URL
    expect(screen.getByTestId('query')).toHaveTextContent('acme');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=acme'));
  });

  it('writes status selections to the URL', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.click(screen.getByRole('button', { name: 'set archived' }));

    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Archived);
    expect(screen.getByTestId('search')).toHaveTextContent('status=Archived');
  });

  it('writes both sort column and direction to the URL from a single updateSort call', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.click(screen.getByRole('button', { name: 'sort by project' }));

    // Guards against a naive two-setters implementation losing one change (both build off the
    // same pre-navigate snapshot).
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
    expect(screen.getByTestId('search')).toHaveTextContent('sortColumn=Project');
    expect(screen.getByTestId('search')).toHaveTextContent('sortDirection=Asc');
  });

  it('removes a param from the URL when it is set back to its default, instead of leaving a stale value', async () => {
    const user = userEvent.setup();
    renderApp('/projects?status=Archived');

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(screen.getByTestId('search')).toHaveTextContent('');
    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Active);
  });

  // Sort isn't one of the filters this reset button clears.
  it('leaves the sort untouched when resetting filters', async () => {
    const user = userEvent.setup();
    renderApp('/projects?status=Archived');

    await user.click(screen.getByRole('button', { name: 'sort by project' }));
    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Active);
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('preserves unrelated existing URL params when writing its own', async () => {
    const user = userEvent.setup();
    renderApp('/projects?unrelated=keep-me');

    await user.click(screen.getByRole('button', { name: 'set query' }));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=acme'));
    expect(screen.getByTestId('search')).toHaveTextContent('unrelated=keep-me');
  });

  // Regression guard: Projects.tsx used to hold query/status in local useState, which a full
  // unmount/remount (navigating to details and back) reset to defaults.
  it('restores a selected filter after navigating to project details and back', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.click(screen.getByRole('button', { name: 'set archived' }));
    expect(screen.getByTestId('status')).toHaveTextContent(ProjectStatus.Archived);

    await user.click(screen.getByRole('button', { name: 'open project details' }));
    expect(screen.getByText('project details')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'back to projects' }));

    expect(await screen.findByTestId('status')).toHaveTextContent(ProjectStatus.Archived);
  });

  // Regression guard: ProjectsBoard used to hold sort in local useState, reset by the same
  // unmount/remount as above.
  it('restores the sort after navigating to project details and back', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.click(screen.getByRole('button', { name: 'sort by project' }));
    expect(screen.getByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);

    await user.click(screen.getByRole('button', { name: 'open project details' }));
    expect(screen.getByText('project details')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'back to projects' }));

    expect(await screen.findByTestId('sort-column')).toHaveTextContent(SortColumn.Project);
    expect(screen.getByTestId('sort-direction')).toHaveTextContent(SortDirection.Asc);
  });

  it('restores the query after navigating to project details and back, once the debounced write has settled', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.click(screen.getByRole('button', { name: 'set query' }));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('q=acme'));

    await user.click(screen.getByRole('button', { name: 'open project details' }));
    expect(screen.getByText('project details')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'back to projects' }));

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
      renderApp('/projects');
      const input = screen.getByTestId('query-input');

      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ac' } });
      fireEvent.change(input, { target: { value: 'acm' } });
      fireEvent.change(input, { target: { value: 'acme' } });

      // the controlled input/query reflects the last keystroke instantly
      expect(screen.getByTestId('query')).toHaveTextContent('acme');
      // but nothing has been written to the URL yet
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
