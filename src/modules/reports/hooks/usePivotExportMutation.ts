import { useToast } from '@/core/providers/toastProvider';
import { downloadSpreadsheet } from '@/modules/reports/downloadSpreadsheet';
import {
  PivotExportBudgetMismatchError,
  pivotExportFileName,
  serializePivotExportRequest,
} from '@/modules/reports/pivotTable/pivotExport';
import type { PivotExportPresentation, PivotExportSnapshot } from '@/modules/reports/pivotTable/types';
import * as requests from '@/modules/reports/requests';
import { showReportExportError } from '@/modules/reports/showReportExportError';
import { SpreadsheetFormat } from '@/modules/reports/types';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import i18n from 'i18next';

export interface ExportPivotTableInput {
  snapshot: PivotExportSnapshot;
  presentation: PivotExportPresentation;
}

export function usePivotExportMutation(
  format: SpreadsheetFormat,
): UseMutationResult<void, unknown, ExportPivotTableInput> {
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async ({ snapshot, presentation }: ExportPivotTableInput): Promise<void> => {
      const body = serializePivotExportRequest(
        { query: snapshot.query, projection: snapshot.projection, presentation },
        snapshot.maxDisplayValueCellCount,
      );
      const response = await requests.exportPivotTable({
        body,
        format,
        organizationSlug: snapshot.organizationSlug,
        params: snapshot.params,
      });

      if (response.status === 204) {
        addToast({ content: i18n.t('toast_message.report.pivot_table_export_empty') });
        return;
      }

      downloadSpreadsheet(response.data, pivotExportFileName(snapshot.params, format), format);
    },
    onError: (error) => {
      if (error instanceof PivotExportBudgetMismatchError) {
        addToast({
          content: i18n.t('toast_message.report.pivot_table_export_budget_mismatch'),
          type: 'error',
        });
        return;
      }

      showReportExportError(error, addToast);
    },
  });
}
