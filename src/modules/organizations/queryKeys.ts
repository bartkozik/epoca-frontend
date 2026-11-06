export const organizationQueryKey = (slug: string): readonly [string, string] => ['organization', slug] as const;

export const organizationsQueryKey = (): readonly [string] => ['organizations'] as const;
export const organizationUserProjectsQueryKey = (
  organizationSlug: string,
  userId: string,
): readonly [string, string, string] => ['organizationUserProjects', organizationSlug, userId] as const;

export const organizationUsersQueryKey = (
  organizationSlug: string,
  includeArchived: boolean,
): readonly [string, string, string] => ['organizationUsers', organizationSlug, String(includeArchived)] as const;
