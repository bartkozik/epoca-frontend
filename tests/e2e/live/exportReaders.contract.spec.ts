import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { writeFile } from 'node:fs/promises';
import { createReportExportFile, readReportedHours } from './exportReaders';

const preciseHours = 7.993333333333333;

test('CSV and XLSX readers preserve the raw reportedHours number @mr @technical', async ({ browserName }, testInfo) => {
  const csvPath = testInfo.outputPath(`${browserName}-csv-download-artifact`);
  const xlsxPath = testInfo.outputPath(`${browserName}-xlsx-download-artifact`);

  await writeFile(
    csvPath,
    ['runId,reportedHours,description', `ct530-contract,${preciseHours},fixed metadata order`, ''].join('\n'),
    'utf8'
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CT-530 contract';
  workbook.created = new Date('2026-08-05T00:00:00.000Z');
  const worksheet = workbook.addWorksheet('reported-hours');
  worksheet.columns = [
    { header: 'runId', key: 'runId' },
    { header: 'reportedHours', key: 'reportedHours' },
    { header: 'description', key: 'description' },
  ];
  worksheet.addRow({ runId: 'ct530-contract', reportedHours: preciseHours, description: 'fixed metadata order' });
  await workbook.xlsx.writeFile(xlsxPath);

  const csv = createReportExportFile(csvPath, 'precise-hours.csv', 'csv');
  const xlsx = createReportExportFile(xlsxPath, 'precise-hours.xlsx', 'xlsx');

  expect(await readReportedHours(csv)).toBe(preciseHours);
  expect(await readReportedHours(xlsx)).toBe(preciseHours);
});

test('CSV and XLSX readers use the exact localized duration header sent by the frontend @mr @technical', async ({
  browserName,
}, testInfo) => {
  const durationHeader = 'Zgłoszone godziny';
  const csvPath = testInfo.outputPath(`${browserName}-localized.csv`);
  const xlsxPath = testInfo.outputPath(`${browserName}-localized.xlsx`);
  await writeFile(csvPath, `${durationHeader}\n${preciseHours}\n`, 'utf8');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('reported-hours');
  worksheet.addRow([durationHeader]);
  worksheet.addRow([preciseHours]);
  await workbook.xlsx.writeFile(xlsxPath);

  expect(await readReportedHours(createReportExportFile(csvPath, 'localized.csv', 'csv', durationHeader))).toBe(
    preciseHours
  );
  expect(await readReportedHours(createReportExportFile(xlsxPath, 'localized.xlsx', 'xlsx', durationHeader))).toBe(
    preciseHours
  );
});

test('export readers reject filename and explicit format mismatches or unknown formats @mr @technical', async ({
  browserName,
}, testInfo) => {
  const artifactPath = testInfo.outputPath(`${browserName}-extensionless-download-artifact`);
  await writeFile(artifactPath, 'reportedHours\n7.9\n', 'utf8');

  expect(() => createReportExportFile(artifactPath, 'report.xlsx', 'csv')).toThrow(/format/i);
  expect(() => createReportExportFile(artifactPath, 'report.csv', 'pdf' as never)).toThrow(/format/i);
});

test('export readers reject missing formula and non-numeric reportedHours cells @mr @technical', async ({
  browserName,
}, testInfo) => {
  const missingPath = testInfo.outputPath('missing.csv');
  const formulaPath = testInfo.outputPath('formula.xlsx');
  const textPath = testInfo.outputPath(`${browserName}-text.xlsx`);
  await writeFile(missingPath, 'duration,description\n7.9,missing exact header\n', 'utf8');

  const formulaWorkbook = new ExcelJS.Workbook();
  const formulaSheet = formulaWorkbook.addWorksheet('reported-hours');
  formulaSheet.addRow(['reportedHours']);
  formulaSheet.addRow([{ formula: '7+0.9', result: preciseHours }]);
  await formulaWorkbook.xlsx.writeFile(formulaPath);

  const textWorkbook = new ExcelJS.Workbook();
  const textSheet = textWorkbook.addWorksheet('reported-hours');
  textSheet.addRow(['reportedHours']);
  textSheet.addRow([String(preciseHours)]);
  await textWorkbook.xlsx.writeFile(textPath);

  await expect(readReportedHours(createReportExportFile(missingPath, 'missing.csv', 'csv'))).rejects.toThrow(
    /reportedHours/
  );
  await expect(readReportedHours(createReportExportFile(formulaPath, 'formula.xlsx', 'xlsx'))).rejects.toThrow(
    /formula/i
  );
  await expect(readReportedHours(createReportExportFile(textPath, 'text.xlsx', 'xlsx'))).rejects.toThrow(/numeric/i);
});

test('export readers reject duplicate reportedHours headers in CSV and XLSX @mr @technical', async ({
  browserName: _browserName,
}, testInfo) => {
  const csvPath = testInfo.outputPath('duplicate.csv');
  const xlsxPath = testInfo.outputPath('duplicate.xlsx');
  await writeFile(csvPath, 'reportedHours,description,reportedHours\n7.9,duplicate,7.9\n', 'utf8');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('reported-hours');
  sheet.addRow(['reportedHours', 'description', 'reportedHours']);
  sheet.addRow([7.9, 'duplicate', 7.9]);
  await workbook.xlsx.writeFile(xlsxPath);

  await expect(readReportedHours(createReportExportFile(csvPath, 'duplicate.csv', 'csv'))).rejects.toThrow(
    /exactly one|duplicate/i
  );
  await expect(readReportedHours(createReportExportFile(xlsxPath, 'duplicate.xlsx', 'xlsx'))).rejects.toThrow(
    /exactly one|duplicate/i
  );
});

test('CSV reader accepts only plain finite decimal reportedHours values @mr @technical', async ({
  browserName: _browserName,
}, testInfo) => {
  for (const [index, value] of ['+7', '0x10', '1e2', 'Infinity', 'NaN'].entries()) {
    const csvPath = testInfo.outputPath(`ambiguous-${index}.csv`);
    await writeFile(csvPath, `reportedHours\n${value}\n`, 'utf8');
    await expect(readReportedHours(createReportExportFile(csvPath, `ambiguous-${index}.csv`, 'csv'))).rejects.toThrow(
      /plain decimal|numeric/i
    );
  }
});
