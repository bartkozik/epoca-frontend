import { showModuleErrorToast } from '@/core/utils/helpers';
import type { SamlAuthCheck } from '@/modules/ssoAuth/models/samlDto.model';
import { samlAuthCheckQueryKey } from '@/modules/ssoAuth/queryKeys';
import { fetchSamlAuthCheck } from '@/modules/ssoAuth/requests';
import { classifySamlAuthCheckFailure } from '@/modules/ssoAuth/samlAuthCheckFailure';
import { TEMPORARY_ITERATORS_SLUG } from '@/modules/ssoAuth/utils';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import i18n from 'i18next';

export type { SamlAuthCheck } from '@/modules/ssoAuth/models/samlDto.model';

// CT-553: the toast lives in `retry`, which runs once per real failed fetch (never for a cached
// error read on remount), so it fires exactly once when no retry is left. Only 'temporary'
// failures get one retry; a 4xx is definitive.
export function useSamlAuthCheckQuery(): UseQueryResult<SamlAuthCheck> {
  return useQuery({
    queryKey: samlAuthCheckQueryKey(TEMPORARY_ITERATORS_SLUG),
    queryFn: () => fetchSamlAuthCheck(TEMPORARY_ITERATORS_SLUG),
    retry: (failureCount, error) => {
      const kind = classifySamlAuthCheckFailure(error).kind;
      const willRetry = failureCount < 1 && kind === 'temporary';
      if (!willRetry) {
        const message =
          kind === 'temporary'
            ? i18n.t('toast_message.saml.auth_check_temporarily_unavailable')
            : i18n.t('toast_message.saml.auth_check_unavailable');
        showModuleErrorToast(error, { default: message });
      }
      return willRetry;
    },
    refetchOnWindowFocus: false,
  });
}
