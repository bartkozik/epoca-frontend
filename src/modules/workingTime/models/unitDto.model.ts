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

export const ClientProjectSchema = z
  .object({
    projectName: z.string(),
    clientId: z.string(),
    projectId: z.string(),
    clientName: z.string(),
    clientColor: z.string(),
    clientTexture: z.string(),
    projectDescription: z
      .string()
      .nullable()
      .transform((description) => description ?? ''),
  })
  .strip();

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
