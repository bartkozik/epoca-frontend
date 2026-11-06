import { OrganizationUserRole } from '@/core/models/enums';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import {
  getOrganizationUserRoleOption,
  organizationUserToUser,
  sortOrganizationUsers,
  toOrganizationUser,
} from './modelOrganizationUser';
import { OrganizationUser } from './types';

const rawOrganizationUser = {
  firstName: 'Ada',
  id: 'user-1',
  identities: [{ type: 'MailAddress', value: 'ada@example.com' }],
  lastName: 'Lovelace',
  organizationRoles: [OrganizationUserRole.Owner],
  archived: false,
};

describe('toOrganizationUser', () => {
  it('derives fullName/displayedName/name/email and starts with no projects', () => {
    const result = toOrganizationUser(rawOrganizationUser as never);

    expect(result.fullName).toBe('Ada Lovelace');
    expect(result.displayedName).toBe('Ada Lovelace');
    expect(result.name).toBe('Ada Lovelace');
    expect(result.email).toBe('ada@example.com');
    expect(result.projects).toEqual([]);
  });
});

describe('organizationUserToUser', () => {
  it('preserves the avatar when adapting an organization user', () => {
    const user = toOrganizationUser({ ...rawOrganizationUser, avatar: 'https://cdn.example.com/a.png' } as never);
    expect(organizationUserToUser(user).avatar).toBe('https://cdn.example.com/a.png');
  });

  it('preserves the archived flag when adapting an organization user', () => {
    const user = toOrganizationUser({ ...rawOrganizationUser, archived: true } as never);

    expect(organizationUserToUser(user).archived).toBe(true);
  });
});

describe('getOrganizationUserRoleOption', () => {
  it('finds the option matching the user’s first role', () => {
    const user = toOrganizationUser(rawOrganizationUser as never);

    expect(getOrganizationUserRoleOption(user)?.value).toBe(OrganizationUserRole.Owner);
  });
});

describe('sortOrganizationUsers', () => {
  const users = [
    { fullName: 'Beta User', organizationRoles: [OrganizationUserRole.Manager] },
    { fullName: 'Alpha User', organizationRoles: [OrganizationUserRole.Owner] },
  ] as OrganizationUser[];

  it('sorts by name, Desc direction yielding alphabetical order', () => {
    const result = sortOrganizationUsers(users, SortColumn.UserName, SortDirection.Desc);
    expect(result.map(({ fullName }) => fullName)).toEqual(['Alpha User', 'Beta User']);
  });

  it('sorts by name, Asc direction yielding reverse-alphabetical order', () => {
    const result = sortOrganizationUsers(users, SortColumn.UserName, SortDirection.Asc);
    expect(result.map(({ fullName }) => fullName)).toEqual(['Beta User', 'Alpha User']);
  });

  it('does not mutate the input array', () => {
    const original = [...users];
    sortOrganizationUsers(users, SortColumn.UserName, SortDirection.Asc);
    expect(users).toEqual(original);
  });

  it('sorts by role without throwing when every user has a role', () => {
    const result = sortOrganizationUsers(users, SortColumn.UserRole, SortDirection.Desc);
    expect(result).toHaveLength(2);
  });

  it('does not throw when a non-first user has no resolvable role', () => {
    const withRolelessUser = [
      { fullName: 'Alpha User', organizationRoles: [OrganizationUserRole.Owner] },
      { fullName: 'Beta User', organizationRoles: [] },
      { fullName: 'Gamma User', organizationRoles: [OrganizationUserRole.Manager] },
    ] as OrganizationUser[];

    expect(() => sortOrganizationUsers(withRolelessUser, SortColumn.UserRole, SortDirection.Asc)).not.toThrow();
  });
});
