import axios from 'axios';

export type SamlAuthCheckFailureKind = 'unavailable' | 'temporary';

export interface SamlAuthCheckFailure {
  kind: SamlAuthCheckFailureKind;
  status: number | null;
}

export const classifySamlAuthCheckFailure = (error: unknown): SamlAuthCheckFailure => {
  if (!axios.isAxiosError(error) || !error.response) return { kind: 'temporary', status: null };

  const status = error.response.status;
  if (status === 401 || status >= 500) return { kind: 'temporary', status };
  return { kind: 'unavailable', status };
};
