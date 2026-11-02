import { PaginatedResultSchema } from '@/core/models/paginatedResult.model';
import { tolerantArray } from '@/core/models/tolerantArray.model';
import { WorkUnitOverrideResponseSchema } from '@/modules/reports/models/workUnitOverride.model';
import { z } from 'zod';
import { UnitState, WorkUnitEntryType } from '../types';

export const UnitDtoSchema = z
  .object({
    entryType: z.nativeEnum(WorkUnitEntryType),
    projectId: z.string(),
    date: z.string().optional(),
    duration: z.string().optional(),
    description: z.string().optional(),
    taskId: z.string().nullable().optional(),
  })
  .strip();

export const UnitEditDtoSchema = z
  .object({
    projectId: z.string(),
    duration: z.string(),
    description: z.string(),
    taskId: z.string().nullable().optional(),
    date: z.string().optional(),
  })
  .strip();

export const UnitsDtoSchema = z
  .object({
    includeArchived: z.boolean().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    userId: z.array(z.string()).optional(),
    projectId: z.array(z.string()).optional(),
    clientId: z.array(z.string()).optional(),
    state: z.nativeEnum(UnitState).optional(),
  })
  .strip();

// All fields required, none .catch()'d: a unit whose projectClient is missing or malformed should
// drop out of the enclosing tolerantArray entirely, matching the old
// filterNonNullItems(data.workUnits.results, 'projectClient') behavior this schema replaces.
//
// projectClient: null is not a legitimate "no client" state -- it's a
// dangling reference, same as RawProjectSchema.client above. WorkUnitDtoService.getProjectClientMap
// only produces None via a Map.get miss over project.clientId (required, never Option), and neither
// ClientRepository nor ProjectRepository support hard-delete (archived rows included too), so this
// should be structurally impossible. Drop the unit like any other malformed load-bearing field.
export const ClientProjectSchema = z
  .object({
    projectName: z.string(),
    clientId: z.string(),
    projectId: z.string(),
    clientName: z.string(),
    clientColor: z.string(),
    clientTexture: z.string(),
    // The backend represents a missing description as Option[ProjectDescription], serialized as
    // null. The UI treats it as display-only text, so normalize it to an empty string rather
    // than dropping the otherwise valid work unit from calendar and report responses.
    projectDescription: z
      .string()
      .nullable()
      .transform((description) => description ?? ''),
  })
  .strip();

// id/date required, not .catch()'d, so a genuinely broken unit (no identity, no date to place it
// on the calendar) still throws inside RawUnitSchema.parse and gets dropped by the enclosing
// tolerantArray in RawUnitResultsSchema rather than rendered wrong. state/entryType are z.nativeEnum
// WITHOUT .catch(): an unrecognized value should drop the unit (via the enclosing tolerantArray),
// not be silently coerced into a real state/type it isn't -- mirrors projectDto.model.ts's
// RawProjectUserSchema.role. projectClient is required (see ClientProjectSchema above) for the same
// reason. Everything else is tolerant, matching wire data nothing here treats as load-bearing.
export const RawUnitSchema = z
  .object({
    entryType: z.nativeEnum(WorkUnitEntryType),
    modifiedAt: z.string().catch(''),
    duration: z.string().catch(''),
    projectClient: ClientProjectSchema,
    description: z.string().catch(''),
    taskId: z.string().optional().catch(undefined),
    id: z.string().min(1),
    date: z.string(),
    createdAt: z.string().catch(''),
    userId: z.string().catch(''),
    userFullName: z.string().optional().catch(undefined),
    state: z.nativeEnum(UnitState),
  })
  .strip();

export const RawUnitsOrderSchema = z
  .object({
    date: z.string().catch(''),
    ids: tolerantArray(z.string()),
  })
  .strip();

export const RawUnitResultsSchema = z
  .object({
    workUnits: PaginatedResultSchema(RawUnitSchema),
    orders: tolerantArray(RawUnitsOrderSchema),
    draftIds: z.array(z.string()).catch([]),
  })
  .strip();

// Report rows reuse the override DTO's field shapes (WorkUnitOverrideResponseSchema.shape) for the
// fields the reports endpoint adds or types differently: taskId, userFullName,
// effectiveProjectClient, effectiveTaskId, revision and override stay optional/tolerant here.
// projectClient is required, the same as for calendar units above: projects and clients are never
// hard-deleted, so a null projectClient is a dangling-reference symptom (see the comment on
// ClientProjectSchema and on WorkUnitOverrideResponseSchema), and such a row drops out of the
// enclosing tolerantArray rather than rendering with an unknown project.
export const RawReportedUnitSchema = RawUnitSchema.extend({
  projectClient: WorkUnitOverrideResponseSchema.shape.projectClient,
  taskId: WorkUnitOverrideResponseSchema.shape.taskId.optional().catch(undefined),
  userFullName: WorkUnitOverrideResponseSchema.shape.userFullName.optional().catch(undefined),
  effectiveProjectClient: WorkUnitOverrideResponseSchema.shape.effectiveProjectClient.optional(),
  effectiveTaskId: WorkUnitOverrideResponseSchema.shape.effectiveTaskId.optional(),
  revision: WorkUnitOverrideResponseSchema.shape.revision.optional(),
  override: WorkUnitOverrideResponseSchema.shape.override.optional(),
});

export const RawReportedUnitResultsSchema = RawUnitResultsSchema.extend({
  workUnits: PaginatedResultSchema(RawReportedUnitSchema),
});
