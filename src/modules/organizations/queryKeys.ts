export const organizationQueryKey = (slug: string): readonly [string, string] => ['organization', slug] as const;

// Flat, unparameterized key: GET /organizations is scoped by the caller's auth token, not by any
// route param, matching usersQueryKey()'s equivalent singleton shape.
export const organizationsQueryKey = (): readonly [string] => ['organizations'] as const;
export const organizationUserProjectsQueryKey = (
  organizationSlug: string,
  userId: string,
): readonly [string, string, string] => ['organizationUserProjects', organizationSlug, userId] as const;

// includeArchived is part of the key so an archived-filtered list can never be served to a caller
// wanting a different set.
export const organizationUsersQueryKey = (
  organizationSlug: string,
  includeArchived: boolean,
): readonly [string, string, string] => ['organizationUsers', organizationSlug, String(includeArchived)] as const;
