import axios, { AxiosError } from 'axios';

export function isAxiosError(error: unknown): error is AxiosError {
  return error !== null && axios.isAxiosError(error);
}

export interface ErrorResponse {
  type?: string;
  status?: number;
  title?: string;
  detail?: string;
  instance?: string;
  message?: string;
}
