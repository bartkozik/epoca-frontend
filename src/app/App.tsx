import { DemoShell } from '@/app/demo/DemoShell';
import { isDemo } from '@/core/config/demo';
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
            {/* E2E uses the dev server; hide devtools so they do not cover controls. */}
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
          {isDemo ? (
            <DemoShell>
              <SessionProviders />
            </DemoShell>
          ) : (
            <SessionProviders />
          )}
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
