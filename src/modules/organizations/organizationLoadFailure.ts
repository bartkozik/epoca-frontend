import axios from 'axios';

export type OrganizationLoadFailureKind = 'unauthorized' | 'forbidden' | 'request' | 'temporary';

export interface OrganizationLoadFailure {
  kind: OrganizationLoadFailureKind;
  status: number | null;
}

export const classifyOrganizationLoadFailure = (error: unknown): OrganizationLoadFailure => {
  if (!axios.isAxiosError(error) || !error.response) return { kind: 'temporary', status: null };

  const status = error.response.status;
  if (status === 401) return { kind: 'unauthorized', status };
  if (status === 403) return { kind: 'forbidden', status };
  if (status >= 500) return { kind: 'temporary', status };
  return { kind: 'request', status };
};
