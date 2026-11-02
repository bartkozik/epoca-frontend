import { useToast } from '@/core/providers/toastProvider';
import { downloadSpreadsheet } from '@/modules/reports/downloadSpreadsheet';
import * as requests from '@/modules/reports/requests';
import { showReportExportError } from '@/modules/reports/showReportExportError';
import { ExportReportDto, SpreadsheetFormat, SpreadsheetReturn } from '@/modules/reports/types';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { Dayjs } from 'dayjs';
import i18n from 'i18next';

export interface ExportReportInput {
  format: SpreadsheetFormat;
  organizationSlug: string;
  selectedUnitIds: string[];
  selectedFromDate: Dayjs;
  selectedToDate: Dayjs | null;
}

const buildFileNameDateSegment = (fromDate: Dayjs, toDate: Dayjs | null): string =>
  fromDate.isSame(toDate, 'month') || !toDate
    ? fromDate.format('YYYY-MM')
    : `${fromDate.format('YYYY-MM')}_${toDate.format('YYYY-MM')}`;

export function useReportExportMutation(): UseMutationResult<SpreadsheetReturn, unknown, ExportReportInput> {
  const { addToast } = useToast();

  return useMutation({
    mutationFn: ({
      format,
      organizationSlug,
      selectedUnitIds,
      selectedFromDate,
      selectedToDate,
    }: ExportReportInput) => {
      const exportRequestDto: ExportReportDto = {
        columnNames: {
          date: i18n.t('common.date'),
          entryType: i18n.t('common.type'),
          clientName: i18n.t('common.client'),
          projectName: i18n.t('common.project'),
          userFullName: i18n.t('common.user'),
          taskId: i18n.t('common.task_id'),
          description: i18n.t('common.description'),
          duration: i18n.t('report.report_table_column.reported_hours'),
          createdAt: i18n.t('report.report_table_column.created_at'),
          modifiedAt: i18n.t('report.report_table_column.modified_at'),
        },
        format,
        organizationSlug,
        selectedUnitIds,
      };

      return requests.exportReport(exportRequestDto).then((response) => {
        downloadSpreadsheet(
          response.data,
          `reported_hours_${buildFileNameDateSegment(selectedFromDate, selectedToDate)}.${format}`,
          format,
        );
        return response;
      });
    },
    onError: (error) => {
      showReportExportError(error, addToast);
    },
  });
}
