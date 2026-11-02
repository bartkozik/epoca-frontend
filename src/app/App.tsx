import Router from '@/app/routing/Router';
import { queryClient, saveDeviceId } from '@/core/api';
import Toasts, { ToastProvider } from '@/core/providers/toastProvider';
import { AuthProvider, useAuth } from '@/modules/auth/AuthProvider';
import { ClientsProvider } from '@/modules/clients/ClientsProvider';
import { WorkspaceProvider } from '@/modules/organizations/WorkspaceProvider';
import { ProjectsProvider } from '@/modules/projects/ProjectsProvider';
import { UnitWorkspaceProvider } from '@/modules/workingTime/UnitWorkspaceProvider';
import { lazy, Suspense, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

// Dynamically imported (and only ever rendered in dev, see the `import.meta.env.DEV` check
// below) so this never ends up in the production bundle -- Rollup can only tree-shake the
// dynamic import() itself if it's provably unreachable, which `import.meta.env.DEV` (statically
// replaced with `false` in a production build) guarantees.
const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then((module) => ({ default: module.ReactQueryDevtools })),
);

export function SessionProviders(): JSX.Element {
  const { loggedInUser } = useAuth();

  return (
    <WorkspaceProvider key={loggedInUser?.id ?? 'anonymous'}>
      <ClientsProvider>
        <ProjectsProvider>
          <UnitWorkspaceProvider>
            <Router />
            <Toasts />
            {/* E2E runs the dev server; navigator.webdriver keeps devtools from covering app controls. */}
            {import.meta.env.DEV && !navigator.webdriver && (
              <Suspense fallback={null}>
                <ReactQueryDevtools initialIsOpen={false} />
              </Suspense>
            )}
          </UnitWorkspaceProvider>
        </ProjectsProvider>
      </ClientsProvider>
    </WorkspaceProvider>
  );
}

function App(): JSX.Element {
  useEffect(() => {
    saveDeviceId();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <SessionProviders />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
