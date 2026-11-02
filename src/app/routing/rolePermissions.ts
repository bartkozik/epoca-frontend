import { OrganizationUserRole } from '@/modules/organizations/types';

export const ROLE_PERMISSIONS = {
  Owner: [OrganizationUserRole.Owner],
  Manager: [OrganizationUserRole.Manager, OrganizationUserRole.Owner],
  Internal: [OrganizationUserRole.Owner, OrganizationUserRole.Manager, OrganizationUserRole.Employee],
  All: [
    OrganizationUserRole.Owner,
    OrganizationUserRole.Manager,
    OrganizationUserRole.Employee,
    OrganizationUserRole.External,
  ],
};
