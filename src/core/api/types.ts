import { AxiosResponse } from 'axios';

export type RequestAuthPolicy = { mode: 'session' } | { mode: 'explicit'; token: string | null };

declare module 'axios' {
  interface AxiosRequestConfig {
    authPolicy?: RequestAuthPolicy;
    skipConnectionErrorToast?: boolean;
  }
}

export type ApiResponse<T = unknown> = Promise<AxiosResponse<T>>;

export interface ErrorLog {
  id: string;
  errorMessage: string;
}
