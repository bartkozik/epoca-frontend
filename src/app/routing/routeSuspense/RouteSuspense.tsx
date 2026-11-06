import Navbar from '@/app/navbar';
import ChunkLoadErrorBoundary from '@/app/routing/chunkLoadErrorBoundary';
import LoadingArea from '@/core/theme/loadingArea';
import { teamSettingsPaths } from '@/modules/teamSettings/routes';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

interface RouteSuspenseProps {
  withNavbar?: boolean;
}

const memberTabPaths = [
  teamSettingsPaths.teamSettings('members', 'list'),
  teamSettingsPaths.teamSettings('members', 'invitations'),
];

// Keep Navbar outside Suspense to avoid duplicate mounts and preserve navigation after chunk-load failure.
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
