import { expect, it } from 'vitest';
import { InvitationRevisionSchema } from './invitationRevision.model';

it('accepts canonical decimal revisions and rejects malformed ones', () => {
  expect(InvitationRevisionSchema.parse('0')).toBe('0');
  expect(InvitationRevisionSchema.parse('42')).toBe('42');
  for (const value of [0, '01', '-1', '1.0', '']) expect(InvitationRevisionSchema.safeParse(value).success).toBe(false);
});
