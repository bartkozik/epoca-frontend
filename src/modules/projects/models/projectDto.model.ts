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

// id/name strict so a malformed OR missing client drops the whole project (see
// RawProjectSchema.client below, which is required, not .nullable()); other fields tolerant,
// mirroring clientDto.model.ts's RawClientSchema.
//
// client: null is not a legitimate "no client" state -- it's a dangling
// reference. Backend Project.clientId is a required ClientId, never Option (Project.scala);
// ProjectDtoService produces client: None only via a clientMap.get(project.clientId) miss, and
// ClientRepository has no hard-delete (archived clients are included too), so this should be
// structurally impossible. Treat it like any other malformed load-bearing field: drop the record
// (surfaced via fetchPaginatedWithRetry's incomplete-page notice).
export const ProjectClientSchema = z
  .object({
    color: z.string().catch(''),
    id: z.string().min(1),
    name: z.string().min(1),
    texture: z.string().catch(''),
    type: z.nativeEnum(ClientType).catch(ClientType.External),
  })
  .strip();

// id strict (malformed id drops the user via the enclosing tolerantArray). role is NOT .catch()'d:
// it gates canUserEditProject, so a malformed role should drop the user rather than be silently
// reinterpreted as a real one.
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

// PATCH /organizations/:slug/projects/:id returns the flat Project domain object (ProjectRouter ->
// ProjectUpdateResult.Updated), not the list/get DTO shape RawProjectSchema expects: it carries
// clientId instead of a nested client, and has no projectUsers/userCount/userIds. id/name/clientId
// strict, everything else tolerant with a '' fallback.
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

// Catches to [] -- worst case the UI just doesn't mark a project as changed, never wrongly.
export const AssignUserToAllProjectsResultSchema = z
  .object({
    changedProjectIds: z.array(z.string()).catch([]),
  })
  .strip();
