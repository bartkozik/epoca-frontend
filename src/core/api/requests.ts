import { buildErrorLoggingHeaders, errorLoggingApi } from '@/core/api';
import { ErrorLog } from '@/core/api/types';
import { AxiosResponse } from 'axios';

export function sendErrorLog(errorLog: ErrorLog): Promise<AxiosResponse> {
  return errorLoggingApi.post(
    '/metrics/frontend/error',
    { payload: errorLog },
    { headers: buildErrorLoggingHeaders() },
  );
}
