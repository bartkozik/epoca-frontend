import { OrganizationUserRole } from '@/core/models/enums';
import { InvitationCancelSchema } from './invitationCancel.model';
import { InvitationCreateSchema } from './invitationCreate.model';
import { InvitationDtoSchema } from './invitationDto.model';
import { InvitationListParamsSchema, InvitationPageSchema } from './invitationList.model';
import { InvitationResendSchema } from './invitationResend.model';
import { InvitationUpdateSchema } from './invitationUpdate.model';

const minimal = {
  firstName: ' Anna ',
  lastName: ' Kowalska ',
  email: ' anna@example.com ',
  role: OrganizationUserRole.Employee,
  locale: 'pl',
};
const dto = {
  id: '17d1bb14-4509-4030-932e-6cffcab68299',
  email: '+48123456789',
  firstName: null,
  lastName: null,
  roles: ['FutureRole'],
  protocolVersion: 1,
  revision: '9007199254740993',
  status: 'FutureStatus',
  expiresAt: null,
  delivery: { status: 'Unknown', lastAttemptAt: null, retryAfterSeconds: 0 },
  createdAt: '2026-10-01T00:00:00Z',
  modifiedAt: '2026-10-01T00:00:00Z',
};

describe('invitation contracts', () => {
  it.each([{ profile: null, terms: null }, { terms: null }])(
    'rejects cooperation drafts on every invitation write %o',
    (cooperation) => {
      expect(InvitationCreateSchema.safeParse({ ...minimal, cooperation }).success).toBe(false);
      expect(InvitationUpdateSchema.safeParse({ expectedRevision: '1', cooperation }).success).toBe(false);
      expect(InvitationResendSchema.safeParse({ expectedRevision: '1', cooperation }).success).toBe(false);
    },
  );
  it('trims names and email', () => {
    expect(InvitationCreateSchema.parse(minimal)).toEqual({
      ...minimal,
      firstName: 'Anna',
      lastName: 'Kowalska',
      email: 'anna@example.com',
    });
  });
  it.each([
    { firstName: ' ' },
    { firstName: 'a\u0000b' },
    { lastName: 'a\nb' },
    { firstName: 'a'.repeat(201) },
    { email: 'bad' },
    { email: `${'a'.repeat(310)}@example.com` },
    { role: 'SuperAdmin' },
    { locale: 'de' },
    { token: 'secret' },
  ])('rejects invalid create fields %o', (patch) => {
    expect(InvitationCreateSchema.safeParse({ ...minimal, ...patch }).success).toBe(false);
  });
  it.each([0, 1, '01', '-1', '1.0', '1e2'])('rejects non-decimal-string revisions %s', (expectedRevision) => {
    for (const schema of [InvitationUpdateSchema, InvitationResendSchema, InvitationCancelSchema])
      expect(schema.safeParse({ expectedRevision }).success).toBe(false);
  });
  it('preserves large revisions and supports partial updates', () => {
    const input = { expectedRevision: '9007199254740993', role: OrganizationUserRole.Manager };
    expect(InvitationUpdateSchema.parse(input)).toEqual(input);
    expect(InvitationResendSchema.parse(input)).toEqual(input);
    expect(InvitationCancelSchema.parse({ expectedRevision: input.expectedRevision })).toEqual({
      expectedRevision: input.expectedRevision,
    });
  });
  it('never allows patching an email', () => {
    expect(InvitationUpdateSchema.safeParse({ expectedRevision: '1', email: 'other@example.com' }).success).toBe(false);
  });
  it('strips secret fields recursively while accepting legacy identities and future wire strings', () => {
    expect(
      InvitationDtoSchema.parse({
        ...dto,
        tokenHash: 'secret',
        delivery: { ...dto.delivery, secret: 'secret' },
        cooperation: { profile: null, terms: null },
      }),
    ).toEqual(dto);
  });
  it('preserves server count and capability and drops malformed items without losing good rows', () => {
    expect(
      InvitationPageSchema.parse({
        count: 2,
        results: [dto, { secret: 'bad' }],
        featureEnabled: false,
        secret: 'secret',
      }),
    ).toEqual({ count: 2, results: [dto], featureEnabled: false });
  });
  it('validates bounded pagination', () => {
    expect(InvitationListParamsSchema.parse({ pageSize: 200, pageNumber: 1 })).toEqual({
      pageSize: 200,
      pageNumber: 1,
    });
    expect(InvitationListParamsSchema.safeParse({ pageSize: 201, pageNumber: 1 }).success).toBe(false);
    expect(InvitationListParamsSchema.safeParse({ pageSize: 50, pageNumber: 0 }).success).toBe(false);
  });
});
