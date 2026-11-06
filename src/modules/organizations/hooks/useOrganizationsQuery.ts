import { showToastForError } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { classifyOrganizationLoadFailure } from '@/modules/organizations/organizationLoadFailure';
import { organizationsQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { RawOrganizationsResults } from '@/modules/organizations/types';
import { saveContextOrganizationSlugInLS } from '@/modules/organizations/utils';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useEffect } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import i18n from 'i18next';

export function useOrganizationsQuery(): UseQueryResult<RawOrganizationsResults> {
  const auth = useAuth();
  const workspace = useWorkspace();

  const query = useQuery({
    queryKey: organizationsQueryKey(),
    queryFn: () => requests.getOrganizations().then((response) => response.data),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.error) return;

    const failure = classifyOrganizationLoadFailure(query.error);
    if (failure.kind === 'unauthorized') {
      void auth.logout();
    } else {
      showToastForError({
        errorMessageMap: { default: i18n.t('toast_message.organizations.data_fetch_error') },
        error: query.error,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the error identity should retrigger this, not every query object change
  }, [query.error]);

  useEffect(() => {
    if (!query.data || query.data.results.length !== 1) return;

    saveContextOrganizationSlugInLS(query.data.results[0].slug);
    workspace.checkIfContextOrganizationSlugIsInLocalStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the data identity should retrigger this
  }, [query.data]);

  return query;
}


export function useHasMoreThanOneOrganization(): boolean {
  const { data } = useOrganizationsQuery();
  return (data?.results.length ?? 0) > 1;
}
