import { INVITATION_PROBLEM_PREFIX } from '@/core/models/invitationProblem';
import { isAxiosError } from '@/core/utils/helpers/is-axios-error';
import { readRetryAfterSeconds } from '@/core/utils/helpers/problem-detail';
import {
  InvitationAccessProblemCodeSchema,
  InvitationAccessProblemSchema,
  type InvitationAccessProblemCode,
} from '../models/invitationAccessProblem.model';

type ErrorCode = InvitationAccessProblemCode | 'session-issue-failed' | 'unavailable' | 'session-changed';

export class InvitationAccessError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly retryAfter = 0,
  ) {
    super(code);
  }
}

export const normalizeInvitationAccessError = (error: unknown): InvitationAccessError => {
  if (error instanceof InvitationAccessError) return error;
  if (!isAxiosError(error)) return new InvitationAccessError('unavailable');
  const parsed = InvitationAccessProblemSchema.safeParse(error.response?.data);
  if (!parsed.success) return new InvitationAccessError('unavailable');
  const { type, joined } = parsed.data;
  if (error.response?.status === 503 && type === `${INVITATION_PROBLEM_PREFIX}session-issue-failed` && joined === true)
    return new InvitationAccessError('session-issue-failed');
  const code = InvitationAccessProblemCodeSchema.options.find(
    (candidate) => type === `${INVITATION_PROBLEM_PREFIX}${candidate}`,
  );
  const retry = readRetryAfterSeconds(error.response?.headers, { max: 300 });

  return new InvitationAccessError(code ?? 'unavailable', retry ?? 0);
};

export const runInvitationAccessRequest = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request();
  } catch (error: unknown) {
    // Return controlled error codes and delays only; wire errors can expose credentials.
    throw normalizeInvitationAccessError(error);
  }
};
