import { SpreadsheetFormat } from './types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadSpreadsheet(data: BlobPart, fileName: string, format: SpreadsheetFormat): void {
  const blob = new Blob([data], {
    type: format === SpreadsheetFormat.XLS ? XLSX_MIME : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
