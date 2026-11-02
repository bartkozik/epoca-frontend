import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UpdateSelectedOptionProps } from './types';
import { useFilterPanelURLParams } from './useFilterPanelURLParams';

const handleUpdateSelectedOptions = vi.fn<(options: UpdateSelectedOptionProps) => void>();
const Harness = (): JSX.Element => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const { setURLParams } = useFilterPanelURLParams({
    clientsSearchOptions: [{ label: 'Client', value: 'client' }],
    projectsSearchOptions: [{ label: 'Project', value: 'project' }],
    contextOrganizationUserSearchOptions: [{ label: 'User', value: 'user' }],
    handleUpdateSelectedOptions,
  });
  return (
    <>
      <output data-navigation={navigationType} data-key={location.key}>
        {location.search}
      </output>
      <button onClick={() => setURLParams({ projects: 'next' })}>Change project</button>
      <button onClick={() => setURLParams({ clients: null, users: 'other' })}>Clear client, keep other user</button>
      <button onClick={() => setURLParams({ projects: 'next' })}>Same project again</button>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
};
const currentParams = (): URLSearchParams => new URLSearchParams(screen.getByRole('status').textContent ?? '');

beforeEach(() => vi.clearAllMocks());

describe('useFilterPanelURLParams', () => {
  it.each([
    'pmFilters=true&pmProjects=old&pmClients=old',
    'pmFilters=false',
    'pmProjects=orphan&pmClients=orphan',
    'isContextualFiltering=true',
  ])(
    'removes retired parameters (%s) with a replace navigation while preserving all other parameters',
    async (legacy) => {
      render(
        <MemoryRouter
          initialEntries={[
            '/previous?previous=keep',
            '/report?' +
              legacy +
              '&projects=project&clients=client&users=user&dateFrom=2026-07-01&dateTo=2026-07-31&custom=keep',
          ]}
          initialIndex={1}
        >
          <Harness />
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(currentParams().has('pmFilters') || currentParams().has('isContextualFiltering')).toBe(false),
      );
      expect(Object.fromEntries(currentParams())).toEqual({
        projects: 'project',
        clients: 'client',
        users: 'user',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        custom: 'keep',
      });
      expect(screen.getByRole('status')).toHaveAttribute('data-navigation', 'REPLACE');
      expect(handleUpdateSelectedOptions).toHaveBeenLastCalledWith({
        newSelectedProjects: { project: 'Project' },
        newSelectedClients: { client: 'Client' },
        newSelectedUsers: { user: 'User' },
      });
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(currentParams().get('previous')).toBe('keep');
    },
  );

  it('preserves unknown IDs until options become available', () => {
    render(
      <MemoryRouter initialEntries={['/report?projects=unknown']}>
        <Harness />
      </MemoryRouter>,
    );
    expect(handleUpdateSelectedOptions).toHaveBeenLastCalledWith({
      newSelectedProjects: { unknown: 'unknown' },
      newSelectedClients: {},
      newSelectedUsers: {},
    });
    expect(screen.getByRole('status')).toHaveAttribute('data-navigation', 'POP');
  });

  it('sets and removes several filters in one navigation without discarding unrelated parameters', async () => {
    render(
      <MemoryRouter initialEntries={['/report?projects=project&clients=client&users=user&custom=keep']}>
        <Harness />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Change project' }));
    await user.click(screen.getByRole('button', { name: 'Clear client, keep other user' }));
    expect(Object.fromEntries(currentParams())).toEqual({ projects: 'next', users: 'other', custom: 'keep' });
  });

  it('does not navigate when nothing changes', async () => {
    render(
      <MemoryRouter initialEntries={['/report?projects=next']}>
        <Harness />
      </MemoryRouter>,
    );
    const keyBefore = screen.getByRole('status').getAttribute('data-key');
    await userEvent.click(screen.getByRole('button', { name: 'Same project again' }));
    expect(screen.getByRole('status').getAttribute('data-key')).toBe(keyBefore);
    expect(screen.getByRole('status')).toHaveAttribute('data-navigation', 'POP');
  });
});
