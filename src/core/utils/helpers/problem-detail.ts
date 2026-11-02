import {
  ProblemDetailSchema,
  RetryAfterDecimalSchema,
  RetryAfterSecondsSchema,
} from '@/core/models/problemDetail.model';

export const readProblemType = (data: unknown): string | undefined => {
  const parsed = ProblemDetailSchema.safeParse(data);

  return parsed.success ? parsed.data.type : undefined;
};

export const readRetryAfterSeconds = (
  headers: Record<string, unknown> | undefined,
  { max }: { max?: number } = {},
): number | undefined => {
  const value = headers?.['retry-after'] ?? headers?.['Retry-After'];
  const parsed = (max === undefined ? RetryAfterSecondsSchema : RetryAfterDecimalSchema).safeParse(value);

  return parsed.success ? Math.min(max ?? Number.MAX_SAFE_INTEGER, parsed.data) : undefined;
};
