import { OrganizationUserRole } from '@/core/models/enums';
import type { SessionUser } from '@/core/models/session';
import {
  canInOrganization,
  grantsAccess,
  knownRolesInOrganization,
  organizationPermissionTable,
  rolesInOrganization,
} from './permissions';

const multiOrgUser: SessionUser = {
  id: 'user-1',
  exp: 4102444800,
  isSuperAdmin: false,
  identities: [],
  authedBy: [],
  organizationGrants: [
    { organizationId: 'org-owner', roles: [OrganizationUserRole.Owner] },
    { organizationId: 'org-external', roles: [OrganizationUserRole.External] },
    { organizationId: 'org-unknown-role', roles: ['SomeFutureRole'] },
  ],
};

describe('rolesInOrganization', () => {
  it('returns the raw roles for the given organization', () => {
    expect(rolesInOrganization(multiOrgUser, 'org-owner')).toEqual([OrganizationUserRole.Owner]);
    expect(rolesInOrganization(multiOrgUser, 'org-external')).toEqual([OrganizationUserRole.External]);
  });

  it('returns an empty array for an organization the user has no grant for', () => {
    expect(rolesInOrganization(multiOrgUser, 'org-absent')).toEqual([]);
  });

  it('returns an empty array when organizationId is null', () => {
    expect(rolesInOrganization(multiOrgUser, null)).toEqual([]);
  });
});

describe('knownRolesInOrganization', () => {
  it('filters out unrecognized role values, keeping only enum members', () => {
    expect(knownRolesInOrganization(multiOrgUser, 'org-unknown-role')).toEqual([]);
    expect(knownRolesInOrganization(multiOrgUser, 'org-owner')).toEqual([OrganizationUserRole.Owner]);
  });

  it('keeps only the known roles when an organization grant mixes known and unknown values', () => {
    const userWithMixedGrant: SessionUser = {
      ...multiOrgUser,
      organizationGrants: [{ organizationId: 'org-mixed', roles: [OrganizationUserRole.Owner, 'SomeFutureRole'] }],
    };
    expect(knownRolesInOrganization(userWithMixedGrant, 'org-mixed')).toEqual([OrganizationUserRole.Owner]);
  });
});

describe('grantsAccess', () => {
  it('matches case-insensitively', () => {
    expect(grantsAccess(['owner'], [OrganizationUserRole.Owner])).toBe(true);
    expect(grantsAccess(['OWNER'], [OrganizationUserRole.Owner])).toBe(true);
  });

  it('an unrecognized role value never grants access', () => {
    expect(grantsAccess(['SomeFutureRole'], [OrganizationUserRole.Owner])).toBe(false);
  });

  it('returns false for an empty roles array', () => {
    expect(grantsAccess([], [OrganizationUserRole.Owner])).toBe(false);
  });
});

describe('canInOrganization', () => {
  it('grants access when the user holds an allowed role in that organization', () => {
    expect(canInOrganization(multiOrgUser, 'org-owner', [OrganizationUserRole.Owner])).toBe(true);
  });

  it('denies access in a DIFFERENT organization even if the role would match there', () => {
    expect(canInOrganization(multiOrgUser, 'org-external', [OrganizationUserRole.Owner])).toBe(false);
  });

  it('a superadmin has access everywhere regardless of role grants', () => {
    const superAdmin: SessionUser = { ...multiOrgUser, isSuperAdmin: true };
    expect(canInOrganization(superAdmin, 'org-absent', [OrganizationUserRole.Owner])).toBe(true);
  });

  it('denies access when organizationId is null', () => {
    expect(canInOrganization(multiOrgUser, null, [OrganizationUserRole.Owner])).toBe(false);
  });

  it('a superadmin has access even when organizationId is null (e.g. before bootstrap resolves it)', () => {
    const superAdmin: SessionUser = { ...multiOrgUser, isSuperAdmin: true };
    expect(canInOrganization(superAdmin, null, [OrganizationUserRole.Owner])).toBe(true);
  });
});

describe('organizationPermissionTable', () => {
  it('is the per-organization permission table: different roles for different organizations', () => {
    const table = organizationPermissionTable(multiOrgUser);
    expect(table.get('org-owner')).toEqual([OrganizationUserRole.Owner]);
    expect(table.get('org-external')).toEqual([OrganizationUserRole.External]);
    expect(table.get('org-absent')).toBeUndefined();
  });

  it('merges roles if the same organizationId appears twice', () => {
    const userWithDuplicateGrant: SessionUser = {
      ...multiOrgUser,
      organizationGrants: [
        { organizationId: 'org-dup', roles: [OrganizationUserRole.Owner] },
        { organizationId: 'org-dup', roles: [OrganizationUserRole.Manager] },
      ],
    };
    const table = organizationPermissionTable(userWithDuplicateGrant);
    expect(table.get('org-dup')).toEqual([OrganizationUserRole.Owner, OrganizationUserRole.Manager]);
  });
});
