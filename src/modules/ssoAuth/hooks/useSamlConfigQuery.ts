import { showModuleErrorToast } from '@/core/utils/helpers';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import type { RawSamlConfig } from '@/modules/ssoAuth/models/samlDto.model';
import { samlConfigQueryKey } from '@/modules/ssoAuth/queryKeys';
import { fetchSamlConfig } from '@/modules/ssoAuth/requests';
import { TEMPORARY_ITERATORS_SLUG } from '@/modules/ssoAuth/utils';
import { useEffect } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import i18n from 'i18next';

export type { RawSamlConfig } from '@/modules/ssoAuth/models/samlDto.model';

export const resolveSsoOrganizationSlug = (contextOrganizationSlug: string): string =>
  contextOrganizationSlug || TEMPORARY_ITERATORS_SLUG;

export function useSamlConfigQuery(): UseQueryResult<RawSamlConfig> {
  const workspace = useWorkspace();
  const organizationSlug = resolveSsoOrganizationSlug(workspace.contextOrganizationSlug);

  const query = useQuery({
    queryKey: samlConfigQueryKey(organizationSlug),
    queryFn: () => fetchSamlConfig(organizationSlug),
  });

  useEffect(() => {
    if (query.error) {
      showModuleErrorToast(query.error, { default: i18n.t('toast_message.saml.data_fetch_error') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the error identity should retrigger the toast, not every query object change
  }, [query.error]);

  return query;
}
