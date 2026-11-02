import { InvitationContinuationSchema } from './invitationContinuation.model';

it.each(['CreateAccount', 'SignIn', 'Accept', 'VerifyLegacySso'])('strips secrets and finance for %s', (nextAction) => {
  const data = { kind: 'invitation', organizationSlug: 'target', nextAction };
  expect(
    InvitationContinuationSchema.parse({ ...data, accessToken: 'secret', cookieValue: 'secret', hourlyRate: '100' }),
  ).toEqual(data);
});
