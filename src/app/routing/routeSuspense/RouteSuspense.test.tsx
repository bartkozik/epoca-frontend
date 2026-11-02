import i18n from '@/core/i18n/i18n';
import { lazy, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RouteSuspense from './RouteSuspense';

let navbarMountCount = 0;
vi.mock('@/app/navbar', () => ({
  __esModule: true,
  default: () => {
    navbarMountCount += 1;
    return (
      <div>
        navbar
        <Link to="/other">Go to other</Link>
      </div>
    );
  },
}));

beforeEach(() => {
  navbarMountCount = 0;
});

const LazyPage = lazy(() => Promise.resolve({ default: (): JSX.Element => <div>lazy page content</div> }));

describe('RouteSuspense', () => {
  it('mounts the navbar exactly once, outside Suspense, and keeps it through the loading-to-resolved transition when withNavbar is set', async () => {
    render(
      <MemoryRouter initialEntries={['/lazy']}>
        <Routes>
          <Route element={<RouteSuspense withNavbar />}>
            <Route path="/lazy" element={<LazyPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('navbar')).toBeInTheDocument();
    expect(await screen.findByText('lazy page content')).toBeInTheDocument();
    // Same instance across the fallback -> resolved swap, not a remount (see RouteSuspense.tsx).
    expect(screen.getByText('navbar')).toBeInTheDocument();
    expect(navbarMountCount).toBe(1);
  });

  it('does not render the navbar while the lazy child resolves, by default', async () => {
    render(
      <MemoryRouter initialEntries={['/lazy']}>
        <Routes>
          <Route element={<RouteSuspense />}>
            <Route path="/lazy" element={<LazyPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('navbar')).not.toBeInTheDocument();
    expect(await screen.findByText('lazy page content')).toBeInTheDocument();
  });

  it('keeps the navbar usable when the page chunk fails to load, and navigating away recovers the route', async () => {
    const user = userEvent.setup();
    const ThrowChunkError = (): null => {
      throw new Error('Failed to fetch dynamically imported module: https://example.com/chunk.js');
    };

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/lazy']}>
          <Routes>
            <Route element={<RouteSuspense withNavbar />}>
              <Route path="/lazy" element={<ThrowChunkError />} />
              <Route path="/other" element={<div>other page content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    // A chunk-load failure must not take the navbar's working links down with it -- Reload
    // (the fallback's only other option) just reloads the same broken URL.
    expect(screen.getByText('navbar')).toBeInTheDocument();

    // Clicking a Navbar link to an unaffected route must actually recover, not stay stuck on the
    // chunk-load fallback (RouteSuspense keys ChunkLoadErrorBoundary by pathname for this reason).
    await user.click(screen.getByText('Go to other'));
    expect(await screen.findByText('other page content')).toBeInTheDocument();
  });
});

const MembersProbe = (): JSX.Element => {
  const [draft, setDraft] = useState('');
  return (
    <>
      <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Link to="/team-settings/members/list">Members</Link>
      <Link to="/team-settings/members/invitations">Invitations</Link>
    </>
  );
};

it('preserves the members page session when switching its list and invitations subroutes', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/team-settings/members/list']}>
      <Routes>
        <Route element={<RouteSuspense />}>
          <Route path="/team-settings/members/:memberTab" element={<MembersProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText('draft'), 'pending delivery');
  await user.click(screen.getByRole('link', { name: 'Invitations' }));
  expect(screen.getByLabelText('draft')).toHaveValue('pending delivery');
  await user.click(screen.getByRole('link', { name: 'Members' }));
  expect(screen.getByLabelText('draft')).toHaveValue('pending delivery');
});
