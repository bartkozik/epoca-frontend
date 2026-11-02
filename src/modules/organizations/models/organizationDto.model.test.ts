import { IdentityType } from '@/core/models/auth';
import { OrganizationUserRole, ProjectUserRole } from '@/core/models/enums';
import {
  OrganizationUserProjectSchema,
  RawOrganizationResultsSchema,
  RawOrganizationSchema,
  RawOrganizationUserSchema,
} from './organizationDto.model';

const validRawOrganization = {
  archivedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: { id: 'user-1' },
  id: 'org-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: { id: 'user-1' },
  name: 'Acme',
  slug: 'acme',
};

const validIdentity = {
  confirmationCode: null,
  confirmed: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  id: 'identity-1',
  main: true,
  type: IdentityType.MailAddress,
  userId: 'user-1',
  value: 'ada@example.com',
};

const validRawOrganizationUser = {
  avatar: '',
  firstName: 'Ada',
  id: 'user-1',
  identities: [validIdentity],
  lastName: 'Lovelace',
  organizationRoles: [OrganizationUserRole.Owner],
  archived: false,
};

const validOrganizationUserProject = {
  clientId: 'client-1',
  clientName: 'Client',
  projectId: 'project-1',
  projectName: 'Project',
  role: ProjectUserRole.Owner,
};

describe('RawOrganizationSchema', () => {
  it('parses a well-formed organization', () => {
    expect(RawOrganizationSchema.parse(validRawOrganization)).toEqual(validRawOrganization);
  });

  it('throws when the load-bearing field (id) is missing', () => {
    const { id, ...rest } = validRawOrganization;
    expect(() => RawOrganizationSchema.parse(rest)).toThrow();
  });

  it('throws when the load-bearing field (slug) is missing', () => {
    const { slug, ...rest } = validRawOrganization;
    expect(() => RawOrganizationSchema.parse(rest)).toThrow();
  });

  it('falls back on malformed non-load-bearing fields instead of throwing', () => {
    const result = RawOrganizationSchema.parse({
      ...validRawOrganization,
      name: null,
      createdAt: null,
      modifiedAt: null,
      archivedAt: undefined,
    });
    expect(result.name).toBe('');
    expect(result.createdAt).toBe('');
    expect(result.modifiedAt).toBe('');
    expect(result.archivedAt).toBeNull();
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = RawOrganizationSchema.parse({ ...validRawOrganization, futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });
});

describe('RawOrganizationResultsSchema', () => {
  it('parses a paginated result, dropping a malformed entry instead of rejecting the page', () => {
    const result = RawOrganizationResultsSchema.parse({
      count: 2,
      results: [validRawOrganization, { ...validRawOrganization, id: undefined }],
    });
    expect(result).toEqual({ count: 2, results: [validRawOrganization] });
  });

  it('throws when count is missing', () => {
    expect(() => RawOrganizationResultsSchema.parse({ results: [validRawOrganization] })).toThrow();
  });
});

describe('RawOrganizationUserSchema', () => {
  it.each([undefined, null, 123])('defaults an absent or malformed avatar (%s) to initials', (avatar) => {
    expect(RawOrganizationUserSchema.parse({ ...validRawOrganizationUser, avatar })).toHaveProperty('avatar', '');
  });

  it('preserves an avatar URL', () => {
    expect(
      RawOrganizationUserSchema.parse({ ...validRawOrganizationUser, avatar: 'https://cdn.example.com/a.png' }),
    ).toHaveProperty('avatar', 'https://cdn.example.com/a.png');
  });

  it('parses a well-formed organization user', () => {
    expect(RawOrganizationUserSchema.parse(validRawOrganizationUser)).toEqual(validRawOrganizationUser);
  });

  it('throws when the load-bearing field (id) is missing', () => {
    const { id, ...rest } = validRawOrganizationUser;
    expect(() => RawOrganizationUserSchema.parse(rest)).toThrow();
  });

  it('drops an unrecognized organization role instead of throwing', () => {
    const result = RawOrganizationUserSchema.parse({
      ...validRawOrganizationUser,
      organizationRoles: [OrganizationUserRole.Owner, 'NotARole'],
    });
    expect(result.organizationRoles).toEqual([OrganizationUserRole.Owner]);
  });

  it('falls back on malformed non-load-bearing fields instead of throwing', () => {
    const result = RawOrganizationUserSchema.parse({
      ...validRawOrganizationUser,
      firstName: null,
      lastName: null,
      archived: 'yes',
    });
    expect(result.firstName).toBe('');
    expect(result.lastName).toBe('');
    expect(result.archived).toBe(false);
  });
});

describe('OrganizationUserProjectSchema', () => {
  it('parses a well-formed organization user project', () => {
    expect(OrganizationUserProjectSchema.parse(validOrganizationUserProject)).toEqual(validOrganizationUserProject);
  });

  it('throws when the load-bearing field (projectId) is missing', () => {
    const { projectId, ...rest } = validOrganizationUserProject;
    expect(() => OrganizationUserProjectSchema.parse(rest)).toThrow();
  });

  it('parses a valid Member role instead of treating it as unrecognized', () => {
    const result = OrganizationUserProjectSchema.parse({ ...validOrganizationUserProject, role: 'Member' });
    expect(result.role).toBe(ProjectUserRole.Member);
  });

  it('falls back to the lowest-privilege role instead of dropping the row when role is unrecognized', () => {
    const result = OrganizationUserProjectSchema.parse({ ...validOrganizationUserProject, role: 'NotARole' });
    expect(result.role).toBe(ProjectUserRole.Member);
  });

  it('falls back on malformed non-load-bearing fields instead of throwing', () => {
    const result = OrganizationUserProjectSchema.parse({
      ...validOrganizationUserProject,
      clientId: null,
      clientName: null,
      projectName: null,
    });
    expect(result.clientId).toBe('');
    expect(result.clientName).toBe('');
    expect(result.projectName).toBe('');
  });
});
