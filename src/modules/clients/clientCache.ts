import { queryClient } from '@/core/api';
import { clientProjectsQueryKey, clientQueryKey } from '@/modules/clients/queryKeys';

export function invalidateClientProjects(organizationSlug: string, clientId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['clients'] });
  void queryClient.invalidateQueries({ queryKey: clientQueryKey(organizationSlug, clientId) });
  void queryClient.invalidateQueries({ queryKey: clientProjectsQueryKey(organizationSlug, clientId) });
}
