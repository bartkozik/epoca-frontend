import { ClientType, ProjectUserRole } from '@/core/models/enums';
import { ProjectClient } from '@/modules/clients/types';
import { z } from 'zod';
import {
  AddProjectArgsSchema,
  AssignUserToAllProjectParamsSchema,
  AssignUserToAllProjectsResultSchema,
  EditProjectArgsSchema,
  FetchProjectsDtoSchema,
  ProjectClientSchema,
  RawProjectResultsSchema,
  RawProjectSchema,
  RawProjectUserSchema,
} from './projectDto.model';

it('validates project operation DTOs with their existing required and optional fields', () => {
  const add = {
    organizationSlug: 'acme',
    name: 'Project',
    description: '',
    clientId: 'client-1',
    ownerIds: ['user-1'],
    memberIds: [],
  };
  expect(AddProjectArgsSchema.parse(add)).toEqual(add);
  const { clientId: _clientId, ...edit } = add;
  expect(EditProjectArgsSchema.parse({ ...edit, projectId: 'project-1' })).toEqual({ ...edit, projectId: 'project-1' });
  expect(FetchProjectsDtoSchema.parse({ organizationSlug: 'acme' })).toEqual({ organizationSlug: 'acme' });
  expect(AssignUserToAllProjectParamsSchema.parse({ organizationSlug: 'acme', userId: 'user-1' })).toEqual({
    organizationSlug: 'acme',
    userId: 'user-1',
  });
  expect(AddProjectArgsSchema.safeParse({ ...add, ownerIds: 'user-1' }).success).toBe(false);
});

const _typeAssertion: ProjectClient = {} as z.infer<typeof ProjectClientSchema>;
void _typeAssertion;

const validClient = {
  color: '#000000',
  id: 'client-1',
  name: 'Acme',
  texture: 'texture-1',
  type: ClientType.External,
};

const validProjectUser = {
  avatar: '',
  firstName: 'Jane',
  id: 'user-1',
  lastName: 'Doe',
  role: ProjectUserRole.Owner,
};

const validRawProject = {
  archivedAt: '',
  client: validClient,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: 'A project',
  id: 'project-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Website Redesign',
  organizationId: 'org-1',
  projectUsers: [validProjectUser],
  userCount: 1,
  userIds: ['user-1'],
};

describe('ProjectClientSchema', () => {
  it('parses a well-formed client', () => {
    expect(ProjectClientSchema.parse(validClient)).toEqual(validClient);
  });

  it('throws when a load-bearing field (id) is missing', () => {
    const { id, ...rest } = validClient;
    expect(() => ProjectClientSchema.parse(rest)).toThrow();
  });

  it('falls back to External when type is not a known ClientType instead of throwing', () => {
    const result = ProjectClientSchema.parse({ ...validClient, type: 'Unknown' });
    expect(result.type).toBe(ClientType.External);
  });
});

describe('RawProjectUserSchema', () => {
  it('parses a well-formed project user', () => {
    expect(RawProjectUserSchema.parse(validProjectUser)).toEqual(validProjectUser);
  });

  it('throws when a load-bearing field (id) is missing', () => {
    const { id, ...rest } = validProjectUser;
    expect(() => RawProjectUserSchema.parse(rest)).toThrow();
  });

  it('throws when role is not a known ProjectUserRole instead of defaulting it', () => {
    expect(() => RawProjectUserSchema.parse({ ...validProjectUser, role: 'Unknown' })).toThrow();
  });

  it('falls back on a malformed non-load-bearing field instead of throwing', () => {
    const result = RawProjectUserSchema.parse({ ...validProjectUser, firstName: null, lastName: null, avatar: null });
    expect(result.firstName).toBe('');
    expect(result.lastName).toBe('');
    expect(result.avatar).toBe('');
  });

  it('defaults avatar to "" when the field is entirely absent', () => {
    const { avatar: _avatar, ...rest } = validProjectUser;
    expect(RawProjectUserSchema.parse(rest).avatar).toBe('');
  });
});

describe('RawProjectSchema', () => {
  it('parses a well-formed project', () => {
    expect(RawProjectSchema.parse(validRawProject)).toEqual(validRawProject);
  });

  it('throws when a load-bearing field (id) is missing', () => {
    const { id, ...rest } = validRawProject;
    expect(() => RawProjectSchema.parse(rest)).toThrow();
  });

  it('throws when name is empty', () => {
    expect(() => RawProjectSchema.parse({ ...validRawProject, name: '' })).toThrow();
  });

  it('throws when client is missing', () => {
    const { client, ...rest } = validRawProject;
    expect(() => RawProjectSchema.parse(rest)).toThrow();
  });

  it('falls back on malformed non-load-bearing fields instead of throwing', () => {
    const result = RawProjectSchema.parse({
      ...validRawProject,
      archivedAt: null,
      createdAt: null,
      createdBy: null,
      description: null,
      modifiedAt: null,
      modifiedBy: null,
      organizationId: null,
      userCount: 'not-a-number',
      userIds: 'not-an-array',
    });
    expect(result.archivedAt).toBe('');
    expect(result.createdAt).toBe('');
    expect(result.createdBy).toBe('');
    expect(result.description).toBe('');
    expect(result.modifiedAt).toBe('');
    expect(result.modifiedBy).toBe('');
    expect(result.organizationId).toBe('');
    expect(result.userCount).toBe(0);
    expect(result.userIds).toEqual([]);
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = RawProjectSchema.parse({ ...validRawProject, futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });

  it('drops a project user with an invalid role instead of defaulting it', () => {
    const malformedUser = { ...validProjectUser, id: 'user-2', role: 'Unknown' };
    const result = RawProjectSchema.parse({ ...validRawProject, projectUsers: [validProjectUser, malformedUser] });
    expect(result.projectUsers).toEqual([validProjectUser]);
  });
});

describe('RawProjectResultsSchema', () => {
  it('parses a paginated project list', () => {
    const payload = { count: 1, results: [validRawProject] };
    expect(RawProjectResultsSchema.parse(payload)).toEqual(payload);
  });

  it('drops a project with a missing client instead of the whole page rejecting', () => {
    const { client, ...projectWithoutClient } = validRawProject;
    const result = RawProjectResultsSchema.parse({
      count: 2,
      results: [validRawProject, projectWithoutClient],
    });
    expect(result.results).toEqual([validRawProject]);
  });

  it('drops a project with a malformed client instead of the whole page rejecting', () => {
    const malformedClientProject = { ...validRawProject, id: 'project-2', client: { ...validClient, id: '' } };
    const result = RawProjectResultsSchema.parse({
      count: 2,
      results: [validRawProject, malformedClientProject],
    });
    expect(result.results).toEqual([validRawProject]);
  });
});

describe('AssignUserToAllProjectsResultSchema', () => {
  it('parses a well-formed response', () => {
    const payload = { changedProjectIds: ['project-1', 'project-2'] };
    expect(AssignUserToAllProjectsResultSchema.parse(payload)).toEqual(payload);
  });

  it('falls back to [] when changedProjectIds is malformed instead of throwing', () => {
    const result = AssignUserToAllProjectsResultSchema.parse({ changedProjectIds: 'not-an-array' });
    expect(result.changedProjectIds).toEqual([]);
  });

  it('falls back to [] when changedProjectIds is missing instead of throwing', () => {
    const result = AssignUserToAllProjectsResultSchema.parse({});
    expect(result.changedProjectIds).toEqual([]);
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = AssignUserToAllProjectsResultSchema.parse({ changedProjectIds: [], futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });
});
