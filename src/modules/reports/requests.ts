import api from '@/core/api/Api';
import { parsePivotResponse } from '@/modules/reports/models/pivotTableQuery.model';
import type { PivotTableQueryParams, WorkUnitPivotQueryRequest, WorkUnitPivotQueryResponse } from './pivotTable/types';
import { ExportReportDto, PivotExportRequestDto, SpreadsheetReturn } from './types';

export async function getPivotTable(
  organizationSlug: string,
  request: WorkUnitPivotQueryRequest,
  params: PivotTableQueryParams,
  signal?: AbortSignal,
): Promise<WorkUnitPivotQueryResponse> {
  const response = await api.post<unknown>(
    `/organizations/${organizationSlug}/pivot-tables/work-units/query`,
    request,
    { params, signal },
  );

  return parsePivotResponse(response.data, request);
}

export function exportReport({
  organizationSlug,
  format,
  selectedUnitIds,
  columnNames,
}: ExportReportDto): Promise<SpreadsheetReturn> {
  return api.post(
    `/organizations/${organizationSlug}/work-units/export`,
    {
      ids: selectedUnitIds,
      columnNames,
      projectIds: [],
      userIds: [],
      clientIds: [],
    },
    {
      params: {
        format,
      },
      responseType: 'blob',
    },
  );
}

export function exportPivotTable(dto: PivotExportRequestDto): Promise<SpreadsheetReturn> {
  return api.post(`/organizations/${dto.organizationSlug}/pivot-tables/work-units/export`, dto.body, {
    headers: { 'Content-Type': 'application/json' },
    params: { ...dto.params, format: dto.format },
    responseType: 'blob',
    transformRequest: [(body: string) => body],
  });
}
