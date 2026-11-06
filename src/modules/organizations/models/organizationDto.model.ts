import { OrganizationUserRole, ProjectUserRole } from '@/core/models/enums';
import { PaginatedResultSchema } from '@/core/models/paginatedResult.model';
import { tolerantArray } from '@/core/models/tolerantArray.model';
import { UserIdentitySchema } from '@/modules/users/models/userDto.model';
import { z } from 'zod';

export const RawOrganizationSchema = z
  .object({
    archivedAt: z.string().nullable().catch(null),
    createdAt: z.string().catch(''),
    createdBy: z.unknown(),
    id: z.string().min(1),
    modifiedAt: z.string().catch(''),
    modifiedBy: z.unknown(),
    name: z.string().catch(''),
    slug: z.string().min(1),
    logo: z.string().optional().catch(undefined),
  })
  .strip();

export const RawOrganizationResultsSchema = PaginatedResultSchema(RawOrganizationSchema);

export const RawOrganizationUserSchema = z
  .object({
    avatar: z.string().catch(''),
    firstName: z.string().catch(''),
    id: z.string().min(1),
    identities: tolerantArray(UserIdentitySchema),
    lastName: z.string().catch(''),
    organizationRoles: tolerantArray(z.nativeEnum(OrganizationUserRole)),
    archived: z.boolean().catch(false),
  })
  .strip();

export const RawOrganizationUsersSchema = tolerantArray(RawOrganizationUserSchema);

export const OrganizationUserProjectSchema = z
  .object({
    clientId: z.string().catch(''),
    clientName: z.string().catch(''),
    projectId: z.string().min(1),
    projectName: z.string().catch(''),
    role: z.nativeEnum(ProjectUserRole).catch(ProjectUserRole.Member),
  })
  .strip();

export const OrganizationUserProjectsSchema = tolerantArray(OrganizationUserProjectSchema);
