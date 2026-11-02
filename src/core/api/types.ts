import { AxiosResponse } from 'axios';

export type RequestAuthPolicy = { mode: 'session' } | { mode: 'explicit'; token: string | null };

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Defaults to the stored session and refresh. Explicit uses only a valid supplied access
     * token (null, malformed or expired means anonymous), without reading or refreshing storage. */
    authPolicy?: RequestAuthPolicy;
    /** The caller handles connection errors, including any retries and final toast. */
    skipConnectionErrorToast?: boolean;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse<T = any> = Promise<AxiosResponse<T>>;

export interface ErrorLog {
  id: string;
  errorMessage: string;
}
