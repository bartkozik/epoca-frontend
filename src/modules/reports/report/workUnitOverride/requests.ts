import type { ApiResponse } from '@/core/api';
import api from '@/core/api/Api';
import {
  ReplaceWorkUnitOverrideRequestSchema,
  UndoWorkUnitOverrideRequestSchema,
  WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE,
  WorkUnitOverrideHistoryPageSchema,
  WorkUnitOverrideHistoryParamsSchema,
  WorkUnitOverrideResponseSchema,
  WorkUnitOverrideRevisionSchema,
  type ReplaceWorkUnitOverrideRequest,
  type UndoWorkUnitOverrideRequest,
  type WorkUnitOverrideHistoryPage,
  type WorkUnitOverrideResponse,
} from '@/modules/reports/models/workUnitOverride.model';

export async function getWorkUnitOverride(
  organizationSlug: string,
  workUnitId: string,
): ApiResponse<WorkUnitOverrideResponse> {
  const response = await api.get<unknown>(`/organizations/${organizationSlug}/work-units/${workUnitId}/override`);

  return { ...response, data: WorkUnitOverrideResponseSchema.parse(response.data) };
}

export async function replaceWorkUnitOverride(
  organizationSlug: string,
  workUnitId: string,
  dto: ReplaceWorkUnitOverrideRequest,
): ApiResponse<WorkUnitOverrideResponse> {
  const request = ReplaceWorkUnitOverrideRequestSchema.parse(dto);
  const response = await api.put<unknown>(
    `/organizations/${organizationSlug}/work-units/${workUnitId}/override`,
    request,
  );

  return { ...response, data: WorkUnitOverrideResponseSchema.parse(response.data) };
}

export async function deleteWorkUnitOverride(
  organizationSlug: string,
  workUnitId: string,
  expectedRevision: number,
): ApiResponse<WorkUnitOverrideResponse> {
  const revision = WorkUnitOverrideRevisionSchema.parse(expectedRevision);
  const response = await api.delete<unknown>(`/organizations/${organizationSlug}/work-units/${workUnitId}/override`, {
    params: { expectedRevision: revision },
  });

  return { ...response, data: WorkUnitOverrideResponseSchema.parse(response.data) };
}

export async function undoWorkUnitOverride(
  organizationSlug: string,
  workUnitId: string,
  dto: UndoWorkUnitOverrideRequest,
): ApiResponse<WorkUnitOverrideResponse> {
  const request = UndoWorkUnitOverrideRequestSchema.parse(dto);
  const response = await api.post<unknown>(
    `/organizations/${organizationSlug}/work-units/${workUnitId}/override/undo`,
    request,
  );

  return { ...response, data: WorkUnitOverrideResponseSchema.parse(response.data) };
}

export async function getWorkUnitOverrideHistory(
  organizationSlug: string,
  workUnitId: string,
  upToVersion: number,
  pageNumber = 1,
): ApiResponse<WorkUnitOverrideHistoryPage> {
  const params = WorkUnitOverrideHistoryParamsSchema.parse({
    upToVersion,
    pageSize: WORK_UNIT_OVERRIDE_HISTORY_PAGE_SIZE,
    pageNumber,
  });
  const response = await api.get<unknown>(
    `/organizations/${organizationSlug}/work-units/${workUnitId}/override-history`,
    { params },
  );

  return { ...response, data: WorkUnitOverrideHistoryPageSchema.parse(response.data) };
}
