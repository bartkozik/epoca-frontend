import {
  WorkUnitOverrideHistoryEntrySchema,
  WorkUnitOverrideResponseSchema,
  type WorkUnitOverrideHistoryEntry,
  type WorkUnitOverrideResponse,
} from '@/modules/reports/models/workUnitOverride.model';
import { createElement, type ReactElement, type ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const createQueryWrapper = (): {
  queryClient: QueryClient;
  wrapper: ({ children }: { children: ReactNode }) => ReactElement;
} => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return {
    queryClient,
    wrapper: ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children),
  };
};

export const workUnitId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const projectId = '22222222-2222-4222-8222-222222222222';
export const clientId = '33333333-3333-4333-8333-333333333333';
export const otherProjectId = '44444444-4444-4444-8444-444444444444';
export const otherClientId = '55555555-5555-4555-8555-555555555555';
export const overrideFixture = (patch: Partial<WorkUnitOverrideResponse> = {}): WorkUnitOverrideResponse =>
  WorkUnitOverrideResponseSchema.parse({
    id: workUnitId,
    userId: workUnitId,
    userFullName: 'Source author',
    date: '2026-09-01',
    duration: 'PT1H',
    entryType: 'Worklog',
    description: 'Source description',
    taskId: 'SOURCE',
    state: 'Active',
    createdAt: '2026-09-01T08:00:00Z',
    modifiedAt: '2026-09-01T08:00:00Z',
    projectClient: {
      projectId,
      projectName: 'Source project',
      projectDescription: null,
      clientId,
      clientName: 'Source client',
      clientColor: '',
      clientTexture: '',
    },
    effectiveProjectClient: {
      projectId: otherProjectId,
      projectName: 'Corrected project',
      projectDescription: null,
      clientId: otherClientId,
      clientName: 'Corrected client',
      clientColor: '',
      clientTexture: '',
    },
    effectiveTaskId: 'CORRECTED',
    revision: 8,
    override: {
      active: true,
      hasHistory: true,
      version: 3,
      projectId: otherProjectId,
      taskId: { mode: 'Set', value: 'CORRECTED' },
      lastChangedAt: null,
      lastChangedBy: null,
      permissions: {
        canEdit: true,
        canDelete: true,
        canViewHistory: true,
        allowedProjectIds: [projectId, otherProjectId],
      },
      undo: { candidateEventId: workUnitId, canUndo: true, reason: null },
    },
    ...patch,
  });
export const apiResponse = <T>(data: T): AxiosResponse<T> => ({ data }) as AxiosResponse<T>;
export const deferredResponse = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

export const historyEntryFixture = (): WorkUnitOverrideHistoryEntry => {
  const unit = overrideFixture();
  const source = { projectClient: unit.projectClient, taskId: unit.taskId };
  return WorkUnitOverrideHistoryEntrySchema.parse({
    id: workUnitId,
    version: 3,
    operation: 'Replace',
    provenance: 'WorkUnitOverride',
    actor: { id: workUnitId, displayName: 'Manager' },
    changedAt: '2026-09-17T08:00:00Z',
    before: { source, effective: source, projectId: null, taskIdOverrideSet: false, taskId: { mode: 'Inherit' } },
    after: {
      source,
      effective: { projectClient: unit.effectiveProjectClient, taskId: 'CORRECTED' },
      projectId: otherProjectId,
      taskIdOverrideSet: true,
      taskId: { mode: 'Set', value: 'CORRECTED' },
    },
    legacyBefore: null,
    legacyAfter: null,
    parentCorrectionId: null,
    revertsEventId: null,
    revertedBy: null,
  });
};
