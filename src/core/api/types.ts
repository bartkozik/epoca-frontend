import { AxiosResponse } from 'axios';

export type RequestAuthPolicy = { mode: 'session' } | { mode: 'explicit'; token: string | null };

declare module 'axios' {
  interface AxiosRequestConfig {
    authPolicy?: RequestAuthPolicy;
    skipConnectionErrorToast?: boolean;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse<T = any> = Promise<AxiosResponse<T>>;

export interface ErrorLog {
  id: string;
  errorMessage: string;
}
