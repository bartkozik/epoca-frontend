import { ClientType } from '@/core/models/enums';
import { PaginatedResultSchema } from '@/core/models/paginatedResult.model';
import { z } from 'zod';

// id/name are the client's identity -- a malformed response there should keep throwing rather
// than silently rendering a broken client. color/texture/logo/type are tolerant even though they
// ARE rendered/edited: ClientDetailsForm.tsx already treats color/logo defensively (`color ||
// clientColor`, `logo || ''`), so a malformed value degrading to '' costs nothing a form submit
// wouldn't already handle, and type falling back to External is a display/filter-only concern (no
// permission or access-control logic reads it -- verified). createdAt/archivedAt/projectCount are
// read (formattedCreatedAt + date sort, the Active/Archived filter, and the project count
// respectively) but degrading one bad value shouldn't take down the whole client list; the
// remaining fields are audit metadata nothing in this module reads beyond the type declaration
// (createdBy/createdByDetails/modifiedAt/modifiedBy/modifiedByDetails/organizationId).
// .strip() (not .passthrough()) so an unrecognized wire field can't sneak an index signature onto
// the `Client` type app-wide -- nothing here reads an out-of-schema field, matching
// integrationClients/schemas.ts's convention.
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
