import { useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { normalizeInvitationProblem } from '../problem';

type InvitationIdempotentAction = <T>(
  scope: readonly string[],
  parsedBody: unknown,
  execute: (key: string) => Promise<T>,
  attemptId?: string,
) => Promise<T>;

export function useInvitationIdempotency(): InvitationIdempotentAction {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);

  return async <T>(
    scope: readonly string[],
    parsedBody: unknown,
    execute: (key: string) => Promise<T>,
    attemptId?: string,
  ): Promise<T> => {
    const fingerprint = JSON.stringify([scope, parsedBody, attemptId ?? null]);
    if (current.current?.fingerprint !== fingerprint) current.current = { fingerprint, key: uuid() };
    const attempt = current.current;

    try {
      const response = await execute(attempt.key);
      if (current.current === attempt) current.current = null;

      return response;
    } catch (error: unknown) {
      const problem = normalizeInvitationProblem(error);
      // The server may have committed when the transport or response was lost. Manual retries
      // reuse this logical attempt; changing the parsed payload or attemptId starts another.
      if (!['timeout', 'transport', 'unexpected'].includes(problem.kind) && current.current === attempt)
        current.current = null;
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw problem;
    }
  };
}
