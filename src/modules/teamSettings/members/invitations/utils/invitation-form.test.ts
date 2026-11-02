import { InvitationCreateSchema } from '../models/invitationCreate.model';
import { InvitationUpdateSchema } from '../models/invitationUpdate.model';
import { invitationProblemMessage, invitationSchemaErrors, validateInvitationForm } from './invitation-form';

const basics = { firstName: 'Anna', lastName: 'Invited', email: 'anna@example.test', role: 'Employee', locale: 'pl' };

it('accepts the invitation basics and rejects legacy cooperation drafts', () => {
  expect(validateInvitationForm(InvitationCreateSchema, basics)).toEqual({ success: true, data: basics });
  expect(
    validateInvitationForm(InvitationCreateSchema, { ...basics, cooperation: { profile: null, terms: null } }).success,
  ).toBe(false);
  expect(InvitationUpdateSchema.safeParse({ expectedRevision: '1', cooperation: { terms: null } }).success).toBe(false);
});

it('maps field issues to invitation messages and keeps additional errors', () => {
  expect(validateInvitationForm(InvitationCreateSchema, { ...basics, firstName: ' ' }, { role: 'x' })).toEqual({
    success: false,
    errors: { firstName: 'invitations.validation.name', role: 'x' },
  });
  expect(
    invitationSchemaErrors(InvitationUpdateSchema.safeParse({ expectedRevision: '01' }).error?.issues ?? []),
  ).toEqual({ expectedRevision: 'invitations.validation.invalid' });
});

it('falls back to generic conflict and retry messages for unknown problems', () => {
  expect(invitationProblemMessage(null)).toBeNull();
  expect(invitationProblemMessage({ kind: 'already-member', status: 409 })).toBe('already-member');
  expect(invitationProblemMessage({ kind: 'not-pending', status: 409 })).toBe('conflict');
  expect(invitationProblemMessage({ kind: 'transport', status: null })).toBe('retry');
});
