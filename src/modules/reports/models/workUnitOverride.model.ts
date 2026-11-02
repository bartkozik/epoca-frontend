import { CanonicalUuidSchema } from '@/core/models/canonicalUuid.model';
import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import { UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { z } from 'zod';

export const WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE = 25;

const SafeNonnegativeIntegerSchema = z.number().int().nonnegative().safe();
const PositivePageIntegerSchema = z.number().int().positive().safe();
const MAX_POSTGRES_OFFSET = 2_147_483_647;

const InheritTaskModeSchema = z
  .object({
    mode: z.literal('Inherit'),
    value: z.never().optional(),
  })
  .strip();

const ClearTaskModeSchema = z
  .object({
    mode: z.literal('Clear'),
    value: z.never().optional(),
  })
  .strip();

const ResponseTaskValueSchema = z
  .string()
  .min(1)
  .refine((value) => Array.from(value).length <= 255, { message: 'Task ID must contain at most 255 code points' });

export const WorkUnitTaskOverrideSchema = z.discriminatedUnion('mode', [
  InheritTaskModeSchema,
  z
    .object({
      mode: z.literal('Set'),
      value: ResponseTaskValueSchema,
    })
    .strip(),
  ClearTaskModeSchema,
]);

export type WorkUnitTaskOverride = z.infer<typeof WorkUnitTaskOverrideSchema>;

const RequestTaskValueSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, { message: 'Task ID must not be empty' })
  .refine((value) => Array.from(value).length <= 255, { message: 'Task ID must contain at most 255 code points' });

export const ReplaceWorkUnitOverrideRequestSchema = z
  .object({
    expectedRevision: SafeNonnegativeIntegerSchema,
    projectId: CanonicalUuidSchema.nullable(),
    taskId: z.discriminatedUnion('mode', [
      InheritTaskModeSchema.strict(),
      z
        .object({
          mode: z.literal('Set'),
          value: RequestTaskValueSchema,
        })
        .strict(),
      ClearTaskModeSchema.strict(),
    ]),
  })
  .strict();

export type ReplaceWorkUnitOverrideRequest = z.infer<typeof ReplaceWorkUnitOverrideRequestSchema>;

export const UndoWorkUnitOverrideRequestSchema = z
  .object({
    expectedRevision: SafeNonnegativeIntegerSchema,
    targetEventId: CanonicalUuidSchema,
  })
  .strict();

export type UndoWorkUnitOverrideRequest = z.infer<typeof UndoWorkUnitOverrideRequestSchema>;

export const WorkUnitProjectClientSchema = z
  .object({
    clientId: CanonicalUuidSchema,
    clientColor: z.string(),
    clientTexture: z.string(),
    clientName: z.string(),
    projectId: CanonicalUuidSchema,
    projectName: z.string(),
    projectDescription: z.string().nullable(),
  })
  .strip();

export type WorkUnitProjectClient = z.infer<typeof WorkUnitProjectClientSchema>;

const WorkUnitOverrideActorSchema = z
  .object({
    id: CanonicalUuidSchema,
    displayName: z.string(),
  })
  .strip();

const WorkUnitOverridePermissionsSchema = z
  .object({
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    canViewHistory: z.boolean(),
    allowedProjectIds: z.array(CanonicalUuidSchema),
  })
  .strip();

const WorkUnitOverrideUndoSchema = z
  .object({
    candidateEventId: CanonicalUuidSchema.nullable(),
    canUndo: z.boolean(),
    reason: z.enum(['NoCorrection', 'LegacyBoundary', 'Forbidden', 'TargetUnavailable']).nullable(),
  })
  .strip()
  .refine((value) => !value.canUndo || (value.candidateEventId !== null && value.reason === null), {
    message: 'Undoable correction requires a candidate and no unavailable reason',
  });

export const WorkUnitOverrideSchema = z
  .object({
    active: z.boolean(),
    hasHistory: z.boolean(),
    version: SafeNonnegativeIntegerSchema,
    projectId: CanonicalUuidSchema.nullable(),
    taskId: WorkUnitTaskOverrideSchema,
    lastChangedBy: WorkUnitOverrideActorSchema.nullable(),
    lastChangedAt: UtcTimestampSchema.nullable(),
    permissions: WorkUnitOverridePermissionsSchema,
    undo: WorkUnitOverrideUndoSchema.nullish(),
  })
  .strip();

export type WorkUnitOverride = z.infer<typeof WorkUnitOverrideSchema>;

// projectClient/effectiveProjectClient are required, not nullable. This is
// the same WorkUnitDto as the plain work-units endpoint -- backend WorkUnitOverrideService.currentDto
// wraps WorkUnitDtoService.prepareDto and only adds the override metadata on top -- so both fields
// come from the same projectClientMap.get(workUnit.projectId) / .get(workUnit.effectiveProjectId)
// lookup, which yields None only on a Map.get miss (a dangling/orphaned clientId; see
// workingTime/models/unitDto.model.ts's ClientProjectSchema comment for the full backend trace).
// effectiveProjectId always resolves to a real ProjectId (overrideState.projectId.getOrElse(projectId)),
// so effectiveProjectClient: null is equally a dangling reference, NOT a legitimate "no override
// applied" state -- that concept is override.projectId: null below. Treat a null here like any other
// malformed load-bearing field and reject the response.
export const WorkUnitOverrideResponseSchema = z
  .object({
    id: CanonicalUuidSchema,
    userId: CanonicalUuidSchema,
    userFullName: z.string().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    duration: z.string().min(1),
    entryType: z.nativeEnum(WorkUnitEntryType),
    description: z.string(),
    taskId: z.string().nullable(),
    state: z.nativeEnum(UnitState),
    createdAt: UtcTimestampSchema,
    modifiedAt: UtcTimestampSchema,
    projectClient: WorkUnitProjectClientSchema,
    effectiveProjectClient: WorkUnitProjectClientSchema,
    effectiveTaskId: z.string().nullable(),
    revision: SafeNonnegativeIntegerSchema,
    override: WorkUnitOverrideSchema,
  })
  .strip();

export type WorkUnitOverrideResponse = z.infer<typeof WorkUnitOverrideResponseSchema>;

const HistoryProjectClientSchema = z
  .object({
    projectId: CanonicalUuidSchema,
    projectName: z.string(),
    clientId: CanonicalUuidSchema,
    clientName: z.string(),
  })
  .strip();

const HistoryValueSchema = z
  .object({
    projectClient: HistoryProjectClientSchema.nullable(),
    taskId: z.string().nullable(),
  })
  .strip();

const WorkUnitOverrideHistorySnapshotSchema = z
  .object({
    source: HistoryValueSchema,
    effective: HistoryValueSchema,
    projectId: CanonicalUuidSchema.nullable(),
    taskIdOverrideSet: z.boolean(),
    taskId: WorkUnitTaskOverrideSchema,
  })
  .strip();

const WorkUnitOverrideHistoryEntryBase = {
  id: CanonicalUuidSchema,
  version: SafeNonnegativeIntegerSchema,
  actor: WorkUnitOverrideActorSchema,
  changedAt: UtcTimestampSchema,
  parentCorrectionId: CanonicalUuidSchema.nullish(),
  revertsEventId: CanonicalUuidSchema.nullish(),
  revertedBy: z
    .object({
      eventId: CanonicalUuidSchema,
      actor: WorkUnitOverrideActorSchema,
      changedAt: UtcTimestampSchema,
    })
    .strip()
    .nullish(),
};

const KnownCurrentHistoryOperationSchema = z.enum(['Replace', 'Clear', 'Undo']);
const KnownLegacyHistoryOperationSchema = z.enum(['Replace', 'Clear']);
const FutureCurrentHistoryOperationSchema = z
  .string()
  .min(1)
  .refine((value) => value !== 'Replace' && value !== 'Clear' && value !== 'Undo');
const FutureLegacyHistoryOperationSchema = z
  .string()
  .min(1)
  .refine((value) => value !== 'Replace' && value !== 'Clear');

export const CurrentWorkUnitOverrideHistoryEntrySchema = z
  .object({
    ...WorkUnitOverrideHistoryEntryBase,
    operation: KnownCurrentHistoryOperationSchema,
    provenance: z.literal('WorkUnitOverride'),
    before: WorkUnitOverrideHistorySnapshotSchema,
    after: WorkUnitOverrideHistorySnapshotSchema,
    legacyBefore: z.null(),
    legacyAfter: z.null(),
  })
  .strip();

export const FutureOperationWorkUnitOverrideHistoryEntrySchema = CurrentWorkUnitOverrideHistoryEntrySchema.extend({
  operation: FutureCurrentHistoryOperationSchema,
});

export const LegacyWorkUnitOverrideHistoryEntrySchema = z
  .object({
    ...WorkUnitOverrideHistoryEntryBase,
    operation: KnownLegacyHistoryOperationSchema,
    provenance: z.literal('LegacyPmSnapshot'),
    before: z.null(),
    after: z.null(),
    legacyBefore: HistoryValueSchema,
    legacyAfter: HistoryValueSchema,
  })
  .strip();

export const FutureOperationLegacyWorkUnitOverrideHistoryEntrySchema = LegacyWorkUnitOverrideHistoryEntrySchema.extend({
  operation: FutureLegacyHistoryOperationSchema,
});

const UnknownHistoryPayloadSchema = z.union([z.record(z.unknown()), z.null()]);

const FutureWorkUnitOverrideHistoryEntrySchema = z
  .object({
    ...WorkUnitOverrideHistoryEntryBase,
    operation: z.string().min(1),
    provenance: z
      .string()
      .min(1)
      .refine((value) => value !== 'WorkUnitOverride' && value !== 'LegacyPmSnapshot'),
    before: UnknownHistoryPayloadSchema,
    after: UnknownHistoryPayloadSchema,
    legacyBefore: UnknownHistoryPayloadSchema,
    legacyAfter: UnknownHistoryPayloadSchema,
  })
  .strip();

export const WorkUnitOverrideHistoryEntrySchema = z.union([
  CurrentWorkUnitOverrideHistoryEntrySchema,
  FutureOperationWorkUnitOverrideHistoryEntrySchema,
  LegacyWorkUnitOverrideHistoryEntrySchema,
  FutureOperationLegacyWorkUnitOverrideHistoryEntrySchema,
  FutureWorkUnitOverrideHistoryEntrySchema,
]);

export type WorkUnitOverrideHistoryEntry = z.infer<typeof WorkUnitOverrideHistoryEntrySchema>;

const validPaginationOffset = ({ pageNumber, pageSize }: { pageNumber: number; pageSize: number }): boolean =>
  (pageNumber - 1) * pageSize <= MAX_POSTGRES_OFFSET;

export const WorkUnitOverrideHistoryPageSchema = z
  .object({
    count: SafeNonnegativeIntegerSchema,
    pageNumber: PositivePageIntegerSchema,
    pageSize: PositivePageIntegerSchema.max(100),
    upToVersion: SafeNonnegativeIntegerSchema,
    results: z.array(WorkUnitOverrideHistoryEntrySchema),
  })
  .strip()
  .superRefine((page, context) => {
    if (!validPaginationOffset(page)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pageNumber'],
        message: 'Pagination offset is too large',
      });
    }

    page.results.forEach((entry, index) => {
      if (entry.version > page.upToVersion) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['results', index, 'version'],
          message: 'History entry version exceeds the page snapshot bound',
        });
      }
    });
  });

export type WorkUnitOverrideHistoryPage = z.infer<typeof WorkUnitOverrideHistoryPageSchema>;

export const WorkUnitOverrideHistoryParamsSchema = z
  .object({
    upToVersion: SafeNonnegativeIntegerSchema,
    pageSize: z.literal(WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE),
    pageNumber: PositivePageIntegerSchema,
  })
  .strict()
  .refine(validPaginationOffset, { path: ['pageNumber'], message: 'Pagination offset is too large' });

export type WorkUnitOverrideHistoryParams = z.infer<typeof WorkUnitOverrideHistoryParamsSchema>;

export const WorkUnitOverrideRevisionSchema = SafeNonnegativeIntegerSchema;
