export const invitationsQueryKey = (organizationSlug: string) => ['invitations', organizationSlug, 'list'] as const;

export const invitationQueryKey = (organizationSlug: string, invitationId: string) =>
  ['invitations', organizationSlug, 'detail', invitationId] as const;
