import { createFullName, getUserMailFromIdentity } from '@/core/utils/helpers';
import { OrganizationUserRoleOption } from '@/core/utils/option-types';
import { getOrganizationUserRoleOptions } from '@/core/utils/options';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { OrganizationUser, RawOrganizationUser } from '@/modules/organizations/types';
import { User } from '@/modules/users/types';

export const toOrganizationUser = (raw: RawOrganizationUser): OrganizationUser => {
  const fullName = createFullName(raw);

  return {
    ...raw,
    fullName,
    displayedName: fullName,
    projects: [],
    email: getUserMailFromIdentity(raw.identities),
    name: fullName,
  };
};

export const organizationUserToUser = (user: OrganizationUser): User => ({
  ...user,
  archived: user.archived,
  archivedAt: '',
  avatar: user.avatar,
  color: '',
  createdAt: '',
  fullName: createFullName(user),
  isLoggedInUser: false,
  isSuperAdmin: false,
  modifiedAt: '',
  identities: [],
});

export const getOrganizationUserRoleOption = (user: OrganizationUser): OrganizationUserRoleOption | undefined => {
  if (!user?.organizationRoles) return undefined;
  return getOrganizationUserRoleOptions().find(({ value }) => value === user.organizationRoles[0]);
};

interface SortableOrganizationUser {
  fullName: string;
  organizationRoles: readonly string[];
}

export const sortOrganizationUsers = <T extends SortableOrganizationUser>(
  users: T[],
  column: SortColumn,
  direction: SortDirection,
): T[] => {
  return [...users].sort((a, b) => {
    let compare = 0;

    switch (column) {
      case SortColumn.UserName:
        compare = a.fullName.localeCompare(b.fullName);
        break;
      case SortColumn.UserRole:
        // organizationRoles can legitimately be [] (tolerantArray drops an unrecognized wire role
        // rather than throwing, see organizationDto.model.ts) -- guard both sides so a roles-less
        // user sorts to one end deterministically instead of throwing mid-render.
        compare = (a.organizationRoles[0] ?? '').localeCompare(b.organizationRoles[0] ?? '');
        break;
      default:
        break;
    }

    return direction === SortDirection.Asc ? -compare : compare;
  });
};
