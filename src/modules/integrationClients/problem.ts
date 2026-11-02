import { isAxiosError } from '@/core/utils/helpers/is-axios-error';
import { z, ZodError } from 'zod';
import type { IntegrationClientProblem } from './types';

const problemTypeSchema = z
  .object({
    type: z.string(),
  })
  .strip();

const currentVersionSchema = z.number().int().positive();

const property = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

const knownProblems = {
  'result:oauth-client:invalid-expiration': 'invalid-expiration',
  'result:oauth-client:invalid-policy': 'invalid-policy',
  'result:oauth-client:name-conflict': 'name-conflict',
  'result:oauth-client:not-active': 'not-active',
  'result:oauth-client:client-not-found': 'client-not-found',
} as const;

export const invalidInputProblem: IntegrationClientProblem = Object.freeze({ kind: 'unexpected', status: null });

export function normalizeIntegrationClientProblem(error: unknown): IntegrationClientProblem {
  // A response that fails IntegrationClientPageSchema/IntegrationClientAuditPageSchema's strict
  // .parse() (malformed shape, or a sensitive field like clientSecret/secretHash/accessToken/
  // authorization detected -- see sensitiveFields.model.ts) throws a ZodError, not an AxiosError.
  // Classify it as its own kind before the AxiosError checks below, and never forward
  // error.message/.issues -- they can echo back the very input value that failed validation,
  // including a sensitive one.
  if (error instanceof ZodError) return { kind: 'validation', status: null };

  if (!isAxiosError(error)) return { kind: 'unexpected', status: null };

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return { kind: 'timeout', status: null };
  }

  if (!error.response) return { kind: 'transport', status: null };

  const responseStatus = error.response.status;
  const parsedType = problemTypeSchema.safeParse(error.response.data);
  const problemType = parsedType.success ? parsedType.data.type : undefined;

  if (problemType === 'result:oauth-client:stale-version') {
    const parsedCurrentVersion = currentVersionSchema.safeParse(
      property(property(error.response.data, 'extension'), 'currentVersion'),
    );
    return {
      kind: 'stale-version',
      status: responseStatus,
      currentVersion: parsedCurrentVersion.success ? parsedCurrentVersion.data : null,
    };
  }

  const knownKind = problemType === undefined ? undefined : knownProblems[problemType as keyof typeof knownProblems];
  if (knownKind !== undefined) return { kind: knownKind, status: responseStatus };

  if (responseStatus === 403 || problemType === 'result:oauth-client:operation-not-permitted') {
    return { kind: 'forbidden', status: responseStatus };
  }

  if (
    responseStatus === 503 ||
    problemType === 'result:error:service-unavailable' ||
    problemType === 'error:service-unavailable'
  ) {
    return { kind: 'service-unavailable', status: responseStatus };
  }

  return { kind: 'unexpected', status: responseStatus };
}
