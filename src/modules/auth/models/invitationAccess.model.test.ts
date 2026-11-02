import { InvitationSamlStartSchema } from './invitationAccess.model';

it.each(['not a url', '', 'https://', 'javascript:alert(1)', 'ftp://example.com'])(
  'returns validation failure without throwing for SSO URL %s',
  (ssoUrl) => {
    expect(InvitationSamlStartSchema.safeParse({ samlRequest: 'request', ssoUrl }).success).toBe(false);
  },
);
