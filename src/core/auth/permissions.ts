import { OrganizationUserRole } from '@/core/models/enums';
import type { RoleWireValue, SessionUser } from '@/core/models/session';

// Raw wire values for one organization, used internally by grantsAccess/canInOrganization. Not a
// user-facing check on its own -- callers checking whether a user may do something should use
// canInOrganization instead.
export const rolesInOrganization = (user: SessionUser, organizationId: string | null): readonly RoleWireValue[] => {
  if (!organizationId) return [];
  return user.organizationGrants.find((grant) => grant.organizationId === organizationId)?.roles ?? [];
};

export const knownRolesInOrganization = (
  user: SessionUser,
  organizationId: string | null,
): readonly OrganizationUserRole[] => {
  const knownRoleValues: readonly string[] = Object.values(OrganizationUserRole);
  return rolesInOrganization(user, organizationId).filter((role): role is OrganizationUserRole =>
    knownRoleValues.includes(role),
  );
};

// The one normalizing (case-insensitive) role comparison in the codebase -- kills G-3. Does NOT
// check isSuperAdmin: this is a plain role-list comparison, not a user-facing access check. Use
// canInOrganization for that; composing this directly would silently drop the superadmin bypass.
export const grantsAccess = (roles: readonly RoleWireValue[], allowed: readonly OrganizationUserRole[]): boolean => {
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const normalizedAllowed = allowed.map((role) => role.toLowerCase());

  return normalizedRoles.some((role) => normalizedAllowed.includes(role));
};

// The user-facing access check: superadmin short-circuit, then grantsAccess(rolesInOrganization).
export const canInOrganization = (
  user: SessionUser,
  organizationId: string | null,
  allowed: readonly OrganizationUserRole[],
): boolean => {
  if (user.isSuperAdmin) return true;
  return grantsAccess(rolesInOrganization(user, organizationId), allowed);
};

// The full per-organization permission table, merging (never overwriting) roles when the same
// organizationId appears in more than one grant entry.
export const organizationPermissionTable = (user: SessionUser): ReadonlyMap<string, readonly RoleWireValue[]> => {
  const table = new Map<string, RoleWireValue[]>();

  user.organizationGrants.forEach((grant) => {
    const existing = table.get(grant.organizationId);
    table.set(grant.organizationId, existing ? [...existing, ...grant.roles] : [...grant.roles]);
  });

  return table;
};
