import { ClientFilterType, ClientType, ProjectUserRole } from '@/core/models/enums';
import { PaginatedResultSchema } from '@/core/models/paginatedResult.model';
import { tolerantArray } from '@/core/models/tolerantArray.model';
import { z } from 'zod';

export const AssignUserToAllProjectParamsSchema = z
  .object({
    organizationSlug: z.string(),
    userId: z.string(),
    clientType: z.nativeEnum(ClientFilterType).optional(),
    clientId: z.string().optional(),
  })
  .strip();

export const AddProjectArgsSchema = z
  .object({
    organizationSlug: z.string(),
    name: z.string(),
    description: z.string(),
    clientId: z.string(),
    ownerIds: z.array(z.string()),
    memberIds: z.array(z.string()),
  })
  .strip();

export const EditProjectArgsSchema = AddProjectArgsSchema.omit({ clientId: true }).extend({ projectId: z.string() });

export const FetchProjectsDtoSchema = z
  .object({
    organizationSlug: z.string(),
    includeArchived: z.boolean().optional(),
    includeArchivedConnections: z.boolean().optional(),
  })
  .strip();

export const ProjectClientSchema = z
  .object({
    color: z.string().catch(''),
    id: z.string().min(1),
    name: z.string().min(1),
    texture: z.string().catch(''),
    type: z.nativeEnum(ClientType).catch(ClientType.External),
  })
  .strip();

export const RawProjectUserSchema = z
  .object({
    avatar: z.string().catch(''),
    firstName: z.string().catch(''),
    id: z.string().min(1),
    lastName: z.string().catch(''),
    role: z.nativeEnum(ProjectUserRole),
  })
  .strip();

export const RawProjectSchema = z
  .object({
    archivedAt: z.string().catch(''),
    client: ProjectClientSchema,
    createdAt: z.string().catch(''),
    createdBy: z.string().catch(''),
    description: z.string().catch(''),
    id: z.string().min(1),
    modifiedAt: z.string().catch(''),
    modifiedBy: z.string().catch(''),
    name: z.string().min(1),
    organizationId: z.string().catch(''),
    projectUsers: tolerantArray(RawProjectUserSchema),
    userCount: z.number().int().nonnegative().catch(0),
    userIds: z.array(z.string()).catch([]),
  })
  .strip();

export const RawProjectResultsSchema = PaginatedResultSchema(RawProjectSchema);

export const ProjectPatchResultSchema = z
  .object({
    archivedAt: z.string().catch(''),
    archivedBy: z.string().catch(''),
    clientId: z.string().min(1),
    createdAt: z.string().catch(''),
    createdBy: z.string().catch(''),
    description: z.string().catch(''),
    id: z.string().min(1),
    modifiedAt: z.string().catch(''),
    modifiedBy: z.string().catch(''),
    name: z.string().min(1),
    organizationId: z.string().catch(''),
  })
  .strip();

export const AssignUserToAllProjectsResultSchema = z
  .object({
    changedProjectIds: z.array(z.string()).catch([]),
  })
  .strip();
