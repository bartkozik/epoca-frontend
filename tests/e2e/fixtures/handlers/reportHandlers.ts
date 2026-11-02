import { validate as isUuid } from 'uuid';
import type { MockHandler, MockResponse } from './types';

const PRECISE_REPORTED_HOURS = 7.993333333333333;
const LEGACY_EXPORT_BODY_KEYS = ['clientIds', 'columnNames', 'ids', 'projectIds', 'userIds'];
const LEGACY_COLUMN_NAME_KEYS = [
  'clientName',
  'createdAt',
  'date',
  'description',
  'duration',
  'entryType',
  'modifiedAt',
  'projectName',
  'taskId',
  'userFullName',
];
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOS_DATE_1980_01_01 = 33;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (input: Buffer): number => {
  let checksum = 0xffffffff;
  for (const byte of input) checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
};

interface ZipPart {
  name: string;
  body: Buffer;
}

const createStoredZip = (parts: readonly ZipPart[]): Buffer => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const part of parts) {
    const name = Buffer.from(part.name, 'utf8');
    const checksum = crc32(part.body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(part.body.length, 18);
    localHeader.writeUInt32LE(part.body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, part.body);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(part.body.length, 20);
    centralHeader.writeUInt32LE(part.body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + part.body.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const xml = (source: string): Buffer => Buffer.from(source, 'utf8');

const createPreciseWorkbook = (): Buffer =>
  createStoredZip([
    {
      name: '[Content_Types].xml',
      body: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      body: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      body: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      body: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      body: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1"><c r="A1" t="inlineStr"><is><t>reportedHours</t></is></c></row>' +
          `<row r="2"><c r="A2"><v>${PRECISE_REPORTED_HOURS}</v></c></row>` +
          '</sheetData></worksheet>',
      ),
    },
  ]);

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string');

const hasExactKeys = (record: Record<string, unknown>, expectedKeys: readonly string[]): boolean => {
  const actualKeys = Object.keys(record);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
};

const validExportBody = (body: unknown): body is Record<string, unknown> => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (!hasExactKeys(record, LEGACY_EXPORT_BODY_KEYS)) return false;
  if (!stringArray(record.ids) || record.ids.length === 0) return false;
  if (!['projectIds', 'userIds', 'clientIds'].every((key) => Array.isArray(record[key]) && record[key].length === 0)) {
    return false;
  }
  if (record.columnNames === null || typeof record.columnNames !== 'object' || Array.isArray(record.columnNames)) {
    return false;
  }
  const columnNames = record.columnNames as Record<string, unknown>;
  const expectedColumnNameKeys = LEGACY_COLUMN_NAME_KEYS;
  return (
    hasExactKeys(columnNames, expectedColumnNameKeys) &&
    Object.values(columnNames).every((value) => typeof value === 'string')
  );
};

const identifiersExist = (identifiers: string[], entities: readonly { id: string }[]): boolean =>
  identifiers.every((identifier) => isUuid(identifier) && entities.some(({ id }) => id === identifier));

const invalidExport = (message: string): MockResponse => ({ status: 400, json: { message } });

export const reportHandlers: MockHandler[] = [
  {
    id: 'report-export',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/work-units\/export$/,
    handle: (request, runtime) => {
      const format = request.query.format;
      if (!format || format.length !== 1 || (format[0] !== 'csv' && format[0] !== 'xlsx')) {
        return invalidExport('Unsupported report format');
      }
      if (!validExportBody(request.body)) return invalidExport('Invalid report export payload');
      if (!identifiersExist(request.body.ids as string[], runtime.state.workUnits)) {
        return invalidExport('Invalid report export identifiers');
      }

      const extension = format[0];
      const filename = `reported_hours_${runtime.state.clock.slice(0, 7)}.${extension}`;
      return {
        status: 200,
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
          'content-type': extension === 'csv' ? 'text/csv' : XLSX_CONTENT_TYPE,
        },
        body:
          extension === 'csv'
            ? Buffer.from(`reportedHours\n${PRECISE_REPORTED_HOURS}\n`, 'utf8')
            : createPreciseWorkbook(),
      };
    },
  },
];
