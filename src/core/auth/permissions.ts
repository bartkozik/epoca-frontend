import { OrganizationUserRole } from '@/core/models/enums';
import type { RoleWireValue, SessionUser } from '@/core/models/session';

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

export const grantsAccess = (roles: readonly RoleWireValue[], allowed: readonly OrganizationUserRole[]): boolean => {
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const normalizedAllowed = allowed.map((role) => role.toLowerCase());

  return normalizedRoles.some((role) => normalizedAllowed.includes(role));
};

export const canInOrganization = (
  user: SessionUser,
  organizationId: string | null,
  allowed: readonly OrganizationUserRole[],
): boolean => {
  if (user.isSuperAdmin) return true;
  return grantsAccess(rolesInOrganization(user, organizationId), allowed);
};

export const organizationPermissionTable = (user: SessionUser): ReadonlyMap<string, readonly RoleWireValue[]> => {
  const table = new Map<string, RoleWireValue[]>();

  user.organizationGrants.forEach((grant) => {
    const existing = table.get(grant.organizationId);
    table.set(grant.organizationId, existing ? [...existing, ...grant.roles] : [...grant.roles]);
  });

  return table;
};
