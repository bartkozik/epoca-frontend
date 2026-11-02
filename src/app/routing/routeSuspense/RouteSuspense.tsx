import Navbar from '@/app/navbar';
import ChunkLoadErrorBoundary from '@/app/routing/chunkLoadErrorBoundary';
import LoadingArea from '@/core/theme/loadingArea';
import { teamSettingsPaths } from '@/modules/teamSettings/routes';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

interface RouteSuspenseProps {
  // Only the authed route group wants a persistent Navbar -- showing one for the non-authed or
  // organization-selection groups would flash an authed-looking header before their chunk loads.
  withNavbar?: boolean;
}

const memberTabPaths = [
  teamSettingsPaths.teamSettings('members', 'list'),
  teamSettingsPaths.teamSettings('members', 'invitations'),
];

// One Suspense boundary per route group, not per page. Navbar renders OUTSIDE it (not in the
// fallback) so it mounts once per group activation instead of once per page's own JSX -- the
// double mount used to double UserAvatarMenu's data-fetch-on-mount effect and, under StrictMode,
// stack enough error toasts to cover unrelated UI (see the CT-513 visual-regression fix).
// ChunkLoadErrorBoundary wraps only the Suspense/Outlet, not Navbar: a chunk-load failure should
// swap out the broken page, not take the navbar (and its working links) down with it -- otherwise
// the chunk-load fallback's only escape hatch is Reload, which reloads the same broken URL.
// Keyed by pathname so navigating to a different route remounts the boundary and clears its error
// state -- without this, a chunk-load error stuck the whole group on the fallback until a full
// page reload, even after clicking a Navbar link to an unaffected route.
// Members sub-tabs share one page session so switching between them keeps query subscriptions
// and pending delivery notifications alive. Leaving that page still resets the boundary.
const RouteSuspense = ({ withNavbar = false }: RouteSuspenseProps): JSX.Element => {
  const { pathname } = useLocation();
  const boundaryKey = memberTabPaths.includes(pathname) ? teamSettingsPaths.teamSettings('members') : pathname;

  return (
    <>
      {withNavbar && <Navbar />}
      <ChunkLoadErrorBoundary key={boundaryKey}>
        <Suspense fallback={<LoadingArea loading />}>
          <Outlet />
        </Suspense>
      </ChunkLoadErrorBoundary>
    </>
  );
};

export default RouteSuspense;
