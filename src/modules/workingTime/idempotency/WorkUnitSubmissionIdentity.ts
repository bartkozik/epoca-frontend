import { v4 as uuidv4 } from 'uuid';
import { UnitDto, UnitEditDto, WorkUnitEntryType } from '../types';

export type WorkUnitSubmissionMethod = 'POST' | 'PATCH';

export interface WorkUnitSubmissionPayload {
  projectId?: string | null;
  entryType?: WorkUnitEntryType | null;
  date?: string | null;
  duration?: string | null;
  description?: string | null;
  taskId?: string | null;
  isDraft?: boolean | null;
  shouldFinalize?: boolean | null;
}

export interface WorkUnitSubmission {
  organizationSlug: string;
  method: WorkUnitSubmissionMethod;
  target: string;
  payload: WorkUnitSubmissionPayload;
}

export const createSubmissionSignature = ({ organizationSlug, method, target, payload }: WorkUnitSubmission): string =>
  JSON.stringify({
    version: 1,
    organizationSlug,
    method,
    target,
    payload: {
      projectId: payload.projectId ?? null,
      entryType: payload.entryType ?? null,
      date: payload.date ?? null,
      duration: payload.duration ?? null,
      description: payload.description ?? null,
      taskId: payload.taskId ?? null,
      isDraft: payload.isDraft ?? null,
      shouldFinalize: payload.shouldFinalize ?? null,
    },
  });

export const createAddUnitSignature = (organizationSlug: string, dto: UnitDto, isDraft: boolean): string =>
  createSubmissionSignature({
    organizationSlug,
    method: 'POST',
    target: `/organizations/${organizationSlug}/work-units`,
    payload: { ...dto, isDraft },
  });

export const createEditUnitSignature = (
  organizationSlug: string,
  workUnitId: string,
  dto: UnitEditDto,
  shouldFinalize: boolean,
): string =>
  createSubmissionSignature({
    organizationSlug,
    method: 'PATCH',
    target: `/organizations/${organizationSlug}/work-units/${workUnitId}`,
    payload: { ...dto, shouldFinalize },
  });

export class WorkUnitSubmissionIdentity {
  private current?: { signature: string; key: string };

  keyFor(signature: string): string {
    if (this.current?.signature === signature) return this.current.key;

    const key = uuidv4();
    this.current = { signature, key };
    return key;
  }

  clear(): void {
    this.current = undefined;
  }
}
