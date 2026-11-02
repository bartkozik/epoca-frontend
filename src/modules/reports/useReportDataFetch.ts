import { showModuleErrorToast } from '@/core/utils/helpers';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const useReportDataFetch = (): { isLoadingData: boolean } => {
  const { t } = useTranslation();
  const { clientsLoadError, isLoadingClients } = useClients();
  const { contextOrganizationSlug, isInitialLoadingContextOrganizationUsers } = useWorkspace();
  const { isLoadingReportedProjects, reportedProjectsLoadError } = useProjects();
  const metadataLoading = isLoadingClients || isLoadingReportedProjects || isInitialLoadingContextOrganizationUsers;
  const [initialLoad, setInitialLoad] = useState({ slug: contextOrganizationSlug, settled: !metadataLoading });
  useEffect(() => {
    setInitialLoad((current) => {
      if (current.slug !== contextOrganizationSlug) return { slug: contextOrganizationSlug, settled: !metadataLoading };
      if (!current.settled && !metadataLoading) return { ...current, settled: true };
      return current;
    });
  }, [contextOrganizationSlug, metadataLoading]);
  const error = clientsLoadError ?? reportedProjectsLoadError;
  const lastNotifiedError = useRef<Error | null>(null);

  useEffect(() => {
    if (!error) {
      lastNotifiedError.current = null;
      return;
    }
    if (lastNotifiedError.current === error) return;
    lastNotifiedError.current = error;
    showModuleErrorToast(error, { default: t('toast_message.common.data_fetch_error') });
  }, [error, t]);

  // Retrying a failed query with no cached data reports isLoading again. Keep open report
  // editors mounted after the first attempt settles; a new organization gets its own lifecycle.
  const isLoadingData = metadataLoading && (initialLoad.slug !== contextOrganizationSlug || !initialLoad.settled);
  return { isLoadingData };
};
