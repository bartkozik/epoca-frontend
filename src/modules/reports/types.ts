import { AxiosResponse } from 'axios';
import type { PivotTableQueryParams } from './pivotTable/types';

export enum SpreadsheetFormat {
  XLS = 'xlsx',
  CSV = 'csv',
}
export enum ReportsViewTabs {
  report = 'report',
  pivotTable = 'pivotTable',
}

export interface ExportReportDto {
  organizationSlug: string;
  format: SpreadsheetFormat;
  selectedUnitIds: string[];
  columnNames: ExportReportTableColumnNames;
}

export interface PivotExportRequestDto {
  organizationSlug: string;
  format: SpreadsheetFormat;
  params: PivotTableQueryParams;
  body: string;
}

export interface ExportReportTableColumnNames {
  date: string;
  entryType: string;
  clientName: string;
  projectName: string;
  userFullName: string;
  taskId: string;
  description: string;
  duration: string;
  createdAt: string;
  modifiedAt: string;
}

export type SpreadsheetReturn = AxiosResponse<Blob>;
