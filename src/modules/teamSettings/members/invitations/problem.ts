import { INVITATION_PROBLEM_PREFIX } from '@/core/models/invitationProblem';
import { isAxiosError } from '@/core/utils/helpers/is-axios-error';
import { readProblemType, readRetryAfterSeconds } from '@/core/utils/helpers/problem-detail';
import { z } from 'zod';

const InvitationProblemSchema = z
  .object({
    kind: z.enum([
      'invalid-input',
      'revision-conflict',
      'idempotency-conflict',
      'identity-conflict',
      'already-member',
      'already-exists',
      'not-pending',
      'disabled',
      'not-found',
      'rate-limited',
      'forbidden',
      'timeout',
      'transport',
      'cancelled',
      'unexpected',
    ]),
    status: z.number().int().nullable(),
    retryAfterSeconds: z.number().int().nonnegative().safe().optional(),
  })
  .strict();
export type InvitationProblem = z.infer<typeof InvitationProblemSchema>;
const knownProblems: Record<string, InvitationProblem['kind'] | undefined> = {
  [`${INVITATION_PROBLEM_PREFIX}invalid-request`]: 'invalid-input',
  [`${INVITATION_PROBLEM_PREFIX}revision-conflict`]: 'revision-conflict',
  [`${INVITATION_PROBLEM_PREFIX}idempotency-conflict`]: 'idempotency-conflict',
  [`${INVITATION_PROBLEM_PREFIX}identity-conflict`]: 'identity-conflict',
  [`${INVITATION_PROBLEM_PREFIX}already-member`]: 'already-member',
  [`${INVITATION_PROBLEM_PREFIX}invitation-already-exists`]: 'already-exists',
  [`${INVITATION_PROBLEM_PREFIX}invitation-not-pending`]: 'not-pending',
  [`${INVITATION_PROBLEM_PREFIX}feature-disabled`]: 'disabled',
  [`${INVITATION_PROBLEM_PREFIX}not-found`]: 'not-found',
  [`${INVITATION_PROBLEM_PREFIX}rate-limited`]: 'rate-limited',
};

export function normalizeInvitationProblem(error: unknown): InvitationProblem {
  const safe = InvitationProblemSchema.safeParse(error);
  if (safe.success) return safe.data;
  if (!isAxiosError(error)) return { kind: 'unexpected', status: null };
  if (error.code === 'ERR_CANCELED') return { kind: 'cancelled', status: null };
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return { kind: 'timeout', status: null };
  if (!error.response) return { kind: 'transport', status: null };
  const status = error.response.status;
  const type = readProblemType(error.response.data);
  const knownKind =
    type !== undefined && Object.prototype.hasOwnProperty.call(knownProblems, type) ? knownProblems[type] : undefined;
  const kind =
    knownKind ??
    (status === 403 ? 'forbidden' : status === 404 ? 'not-found' : status === 429 ? 'rate-limited' : 'unexpected');
  const delay = readRetryAfterSeconds(error.response.headers);

  return { kind, status, ...(kind === 'rate-limited' && delay !== undefined ? { retryAfterSeconds: delay } : {}) };
}

export function parseInvitationInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input);
  // Feature errors are safe discriminated values, never raw Zod or Axios objects.
  // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
  if (!parsed.success) throw { kind: 'invalid-input', status: null } satisfies InvitationProblem;

  return parsed.data;
}

export async function runInvitationRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw normalizeInvitationProblem(error);
  }
}
