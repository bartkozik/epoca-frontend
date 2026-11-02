import { OrganizationUserRole } from '@/core/models/enums';
import type { TFunction } from 'i18next';
import type { ZodIssue, ZodType, ZodTypeDef } from 'zod';
import type { InvitationProblem } from '../problem';
import type { InvitationFormErrors } from '../types';

export function invitationSchemaErrors(issues: readonly ZodIssue[]): InvitationFormErrors {
  return Object.fromEntries(
    issues.map((issue) => [
      issue.path.join('.'),
      issue.message.startsWith('invitations.') ? issue.message : 'invitations.validation.invalid',
    ]),
  );
}

export function invitationProblemMessage(problem: InvitationProblem | null): string | null {
  if (!problem) return null;

  return [
    'already-member',
    'already-exists',
    'idempotency-conflict',
    'identity-conflict',
    'forbidden',
    'disabled',
    'rate-limited',
    'invalid-input',
  ].includes(problem.kind)
    ? problem.kind
    : problem.status === 409
      ? 'conflict'
      : 'retry';
}

export function invitationRoleItems(t: TFunction): { value: OrganizationUserRole; label: string }[] {
  return Object.values(OrganizationUserRole).map((value) => ({ value, label: t(`invitations.role.${value}`) }));
}

type InvitationFormValidation<T> = { success: true; data: T } | { success: false; errors: InvitationFormErrors };

export function validateInvitationForm<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  candidate: unknown,
  additionalErrors: InvitationFormErrors = {},
): InvitationFormValidation<T> {
  const parsed = schema.safeParse(candidate);
  const errors = {
    ...invitationSchemaErrors(parsed.success ? [] : parsed.error.issues),
    ...additionalErrors,
  };

  return parsed.success && Object.keys(errors).length === 0
    ? { success: true, data: parsed.data }
    : { success: false, errors };
}
