import { z } from 'zod';

const uuid = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const counter = z.number().int().nonnegative().safe();
const positiveCounter = z.number().int().positive().safe();
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/)
  .datetime({ offset: false });
const responseTask = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('Inherit') }).strict(),
  z.object({ mode: z.literal('Clear') }).strict(),
  z
    .object({
      mode: z.literal('Set'),
      value: z
        .string()
        .min(1)
        .refine((value) => Array.from(value).length <= 255),
    })
    .strict(),
]);
const requestTask = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('Inherit') }).strict(),
  z.object({ mode: z.literal('Clear') }).strict(),
  z
    .object({
      mode: z.literal('Set'),
      value: z
        .string()
        .transform((value) => value.trim())
        .refine((value) => value.length > 0)
        .refine((value) => Array.from(value).length <= 255),
    })
    .strict(),
]);
const actor = z.object({ id: uuid, displayName: z.string() }).strict();
const historyProject = z
  .object({ clientId: uuid, clientName: z.string(), projectId: uuid, projectName: z.string() })
  .strict();
const project = historyProject
  .extend({ clientColor: z.string(), clientTexture: z.string(), projectDescription: z.string().nullable() })
  .strict();
const historyValue = z.object({ projectClient: historyProject.nullable(), taskId: z.string().nullable() }).strict();
const snapshot = z
  .object({
    source: historyValue,
    effective: historyValue,
    projectId: uuid.nullable(),
    taskIdOverrideSet: z.boolean(),
    taskId: responseTask,
  })
  .strict();
export const ReplaceWorkUnitOverrideRequestSchema = z
  .object({ expectedRevision: counter, projectId: uuid.nullable(), taskId: requestTask })
  .strict();
export const UndoWorkUnitOverrideRequestSchema = z.object({ expectedRevision: counter, targetEventId: uuid }).strict();
const undoMetadata = z
  .object({
    candidateEventId: uuid.nullable(),
    canUndo: z.boolean(),
    reason: z.enum(['NoCorrection', 'LegacyBoundary', 'Forbidden', 'TargetUnavailable']).nullable(),
  })
  .strict()
  .refine((value) => !value.canUndo || (value.candidateEventId !== null && value.reason === null));
export const WorkUnitOverrideResponseSchema = z
  .object({
    id: uuid,
    userId: uuid,
    userFullName: z.string().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    duration: z.string().min(1),
    entryType: z.enum(['Worklog', 'Note']),
    description: z.string(),
    taskId: z.string().nullable(),
    state: z.enum(['Inactive', 'Deleted', 'GdprAnonymized', 'Archived', 'Draft', 'Active']),
    createdAt: timestamp,
    modifiedAt: timestamp,
    projectClient: project.nullable(),
    effectiveProjectClient: project.nullable(),
    effectiveTaskId: z.string().nullable(),
    revision: counter,
    override: z
      .object({
        active: z.boolean(),
        hasHistory: z.boolean(),
        version: counter,
        projectId: uuid.nullable(),
        taskId: responseTask,
        lastChangedBy: actor.nullable(),
        lastChangedAt: timestamp.nullable(),
        permissions: z
          .object({
            canEdit: z.boolean(),
            canDelete: z.boolean(),
            canViewHistory: z.boolean(),
            allowedProjectIds: z.array(uuid),
          })
          .strict(),
        undo: undoMetadata.nullish(),
      })
      .strict(),
  })
  .strict();
const historyEntryBase = {
  id: uuid,
  version: counter,
  actor,
  changedAt: timestamp,
  parentCorrectionId: uuid.nullable(),
  revertsEventId: uuid.nullable(),
  revertedBy: z.object({ eventId: uuid, actor, changedAt: timestamp }).strict().nullable(),
};
const currentHistoryEntry = z
  .object({
    ...historyEntryBase,
    operation: z.enum(['Replace', 'Clear', 'Undo']),
    provenance: z.literal('WorkUnitOverride'),
    before: snapshot,
    after: snapshot,
    legacyBefore: z.null(),
    legacyAfter: z.null(),
  })
  .strict();
const legacyHistoryEntry = z
  .object({
    ...historyEntryBase,
    operation: z.enum(['Replace', 'Clear']),
    provenance: z.literal('LegacyPmSnapshot'),
    before: z.null(),
    after: z.null(),
    legacyBefore: historyValue,
    legacyAfter: historyValue,
  })
  .strict();
export const WorkUnitOverrideHistoryEntrySchema = z.union([currentHistoryEntry, legacyHistoryEntry]);
export const WorkUnitOverrideHistoryPageSchema = z
  .object({
    count: counter,
    pageNumber: positiveCounter,
    pageSize: positiveCounter.max(100),
    upToVersion: counter,
    results: z.array(WorkUnitOverrideHistoryEntrySchema),
  })
  .strict()
  .superRefine((page, context) => {
    if ((page.pageNumber - 1) * page.pageSize > 2_147_483_647) {
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
export type WorkUnitOverrideResponse = z.infer<typeof WorkUnitOverrideResponseSchema>;
export type WorkUnitOverrideHistoryEntry = z.infer<typeof WorkUnitOverrideHistoryEntrySchema>;
export type WorkUnitTaskOverride = z.infer<typeof responseTask>;
