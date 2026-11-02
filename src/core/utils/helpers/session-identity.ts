export const sessionIdentityKey = (userId: string | undefined, organizationSlug: string | null | undefined): string =>
  `${userId ?? 'anonymous'}:${organizationSlug ?? ''}`;
