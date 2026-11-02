import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type ReportExportFormat = 'csv' | 'xlsx';

export interface ReportExportFile {
  filePath: string;
  format: ReportExportFormat;
  reportedHoursHeader: string;
  suggestedFilename: string;
}

export const createReportExportFile = (
  filePath: string,
  suggestedFilename: string,
  format: ReportExportFormat,
  reportedHoursHeader = 'reportedHours'
): ReportExportFile => {
  if (!filePath.trim()) throw new Error('Report export artifact path is required');
  if (!suggestedFilename.trim() || path.basename(suggestedFilename) !== suggestedFilename) {
    throw new Error('Report export suggested filename is invalid');
  }
  if (format !== 'csv' && format !== 'xlsx') throw new Error('Report export format is unsupported');
  if (path.extname(suggestedFilename).toLowerCase() !== `.${format}`) {
    throw new Error('Report export filename does not match its explicit format');
  }
  if (
    !reportedHoursHeader.trim() ||
    reportedHoursHeader.trim() !== reportedHoursHeader ||
    /[\r\n]/.test(reportedHoursHeader)
  ) {
    throw new Error('Reported-hours export header is invalid');
  }
  return { filePath, suggestedFilename, format, reportedHoursHeader };
};

const parseCsvRow = (row: string): string[] => {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted cell');
  values.push(value);
  return values;
};

const assertNumericValue = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('reportedHours cell must contain a raw numeric value');
  }
  return value;
};

const readCsvReportedHours = async (filePath: string, reportedHoursHeader: string): Promise<number> => {
  const rows = (await readFile(filePath, 'utf8'))
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((row) => row.length > 0)
    .map(parseCsvRow);
  const headerMatches = (rows[0] ?? [])
    .map((value, index) => ({ index, value }))
    .filter(({ value }) => value === reportedHoursHeader);
  if (headerMatches.length !== 1) throw new Error('CSV must contain exactly one reportedHours header');
  const headerIndex = headerMatches[0].index;
  const rawValue = rows[1]?.[headerIndex];
  if (rawValue?.trim().startsWith('=')) throw new Error('reportedHours formula cells are forbidden');
  if (rawValue === undefined || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rawValue)) {
    throw new Error('reportedHours cell must contain a plain decimal numeric value');
  }
  const value = Number(rawValue);
  return assertNumericValue(value);
};

const readXlsxReportedHours = async (filePath: string, reportedHoursHeader: string): Promise<number> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  if (workbook.worksheets.length !== 1) throw new Error('XLSX export must contain exactly one worksheet');
  const worksheet = workbook.worksheets[0];
  const headerRow = worksheet.getRow(1);
  const reportedHoursColumns: number[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
    if (cell.value === reportedHoursHeader) reportedHoursColumns.push(column);
  });
  if (reportedHoursColumns.length !== 1) throw new Error('XLSX must contain exactly one reportedHours header');
  const reportedHoursColumn = reportedHoursColumns[0];
  const cell = worksheet.getRow(2).getCell(reportedHoursColumn);
  if (
    cell.type === ExcelJS.ValueType.Formula ||
    (typeof cell.value === 'object' && cell.value && 'formula' in cell.value)
  ) {
    throw new Error('reportedHours formula cells are forbidden');
  }
  return assertNumericValue(cell.value);
};

export const readReportedHours = async (file: ReportExportFile): Promise<number> => {
  const validated = createReportExportFile(
    file.filePath,
    file.suggestedFilename,
    file.format,
    file.reportedHoursHeader
  );
  if (validated.format === 'csv') return readCsvReportedHours(validated.filePath, validated.reportedHoursHeader);
  return readXlsxReportedHours(validated.filePath, validated.reportedHoursHeader);
};
