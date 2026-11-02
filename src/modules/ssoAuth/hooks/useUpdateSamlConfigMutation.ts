import { useToast } from '@/core/providers/toastProvider';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { resolveSsoOrganizationSlug } from '@/modules/ssoAuth/hooks/useSamlConfigQuery';
import type { RawSamlConfig, SamlConfigUpdateRequest } from '@/modules/ssoAuth/models/samlDto.model';
import { samlConfigQueryKey } from '@/modules/ssoAuth/queryKeys';
import { updateSamlConfig } from '@/modules/ssoAuth/requests';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import i18n from 'i18next';

export type { SamlConfigUpdateRequest } from '@/modules/ssoAuth/models/samlDto.model';

export function useUpdateSamlConfigMutation(): UseMutationResult<RawSamlConfig, unknown, SamlConfigUpdateRequest> {
  const { addToast } = useToast();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const organizationSlug = resolveSsoOrganizationSlug(workspace.contextOrganizationSlug);

  return useMutation({
    mutationFn: (input: SamlConfigUpdateRequest) => updateSamlConfig(organizationSlug, input),
    onSuccess: () => {
      addToast({ content: i18n.t('toast_message.saml.edit_success') });
      void queryClient.invalidateQueries({ queryKey: samlConfigQueryKey(organizationSlug) });
    },
    onError: (error) => {
      showModuleErrorToast(error, { default: i18n.t('toast_message.saml.data_fetch_error') });
    },
  });
}
