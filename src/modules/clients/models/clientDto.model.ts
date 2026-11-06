import { ClientType } from '@/core/models/enums';
import { PaginatedResultSchema } from '@/core/models/paginatedResult.model';
import { z } from 'zod';

export const RawClientSchema = z
  .object({
    archivedAt: z.string().catch(''),
    color: z.string().catch(''),
    createdAt: z.string().catch(''),
    createdBy: z.string().catch(''),
    createdByDetails: z.unknown(),
    id: z.string().min(1),
    logo: z.string().catch(''),
    modifiedAt: z.string().catch(''),
    modifiedBy: z.string().catch(''),
    modifiedByDetails: z.unknown(),
    name: z.string().min(1),
    organizationId: z.string().catch(''),
    projectCount: z.number().int().nonnegative().catch(0),
    texture: z.string().catch(''),
    type: z.nativeEnum(ClientType).catch(ClientType.External),
  })
  .strip();

export const RawClientResultsSchema = PaginatedResultSchema(RawClientSchema);
