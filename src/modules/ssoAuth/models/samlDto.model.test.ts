import { SamlLoginResponseSchema } from '@/modules/ssoAuth/models/samlDto.model';

it.each(['CreateAccount', 'SignIn', 'Accept', 'VerifyLegacySso'])(
  'accepts validated %s continuation and strips secrets and financial fields',
  (nextAction) => {
    const data = { kind: 'invitation', organizationSlug: 'target', nextAction };
    expect(
      SamlLoginResponseSchema.parse({
        ...data,
        cookieValue: 'secret',
        csrfToken: 'secret',
        password: 'secret',
        accessToken: 'secret',
        hourlyRate: '100',
        billing: {},
      }),
    ).toEqual(data);
  },
);
it('rejects invalid or incomplete continuation and session', () => {
  for (const data of [
    { kind: 'invitation', organizationSlug: 'target', nextAction: 'Unknown' },
    { kind: 'invitation', nextAction: 'Accept' },
    { accessToken: 'jwt' },
  ])
    expect(SamlLoginResponseSchema.safeParse(data).success).toBe(false);
  expect(SamlLoginResponseSchema.parse({ accessToken: 'jwt', refreshToken: 'refresh', hourlyRate: 100 })).toEqual({
    accessToken: 'jwt',
    refreshToken: 'refresh',
  });
});
