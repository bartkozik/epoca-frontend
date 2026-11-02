import { posix } from 'node:path';
import { yauzl } from 'playwright-core/lib/zipBundle';

export type PivotWorkbookCell = {
  numberFormat: string;
  reference: string;
  styleIndex: number;
  type: 'blank' | 'number' | 'text';
  value: number | string | null;
};

export type PivotWorkbook = {
  cells: ReadonlyMap<string, PivotWorkbookCell>;
  merges: string[];
  pane: {
    state: string;
    topLeftCell: string;
    xSplit: number;
    ySplit: number;
  } | null;
  sheetName: string;
  sheetPath: string;
};

const xmlDecode = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');

const attribute = (attributes: string, name: string): string | undefined =>
  attributes.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`))?.[1];

const xmlText = (value: string): string =>
  Array.from(value.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), ([, text]) => xmlDecode(text)).join('');

const unzip = (buffer: Buffer): Promise<Map<string, Buffer>> =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject((openError as Error | null) ?? new Error('Downloaded XLSX cannot be opened'));
        return;
      }
      const entries = new Map<string, Buffer>();
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      zipFile.on('error', fail);
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipFile.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(streamError ?? new Error(`Cannot read XLSX ZIP entry ${entry.fileName}`));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on('error', fail);
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zipFile.readEntry();
          });
        });
      });
      zipFile.readEntry();
    });
  });

const requiredXml = (files: ReadonlyMap<string, Buffer>, path: string): string => {
  const contents = files.get(path);
  if (!contents) throw new Error(`Downloaded XLSX is missing ${path}`);
  return contents.toString('utf8');
};

const resolveSheet = (files: ReadonlyMap<string, Buffer>): { name: string; path: string } => {
  const workbook = requiredXml(files, 'xl/workbook.xml');
  const relationshipXml = requiredXml(files, 'xl/_rels/workbook.xml.rels');
  const sheet = workbook.match(/<sheet\s([^>]*?)\/?>(?:<\/sheet>)?/);
  if (!sheet) throw new Error('Downloaded XLSX workbook has no worksheet');
  const name = xmlDecode(attribute(sheet[1], 'name') ?? '');
  const relationshipId = attribute(sheet[1], 'r:id');
  if (!name || !relationshipId) throw new Error('Downloaded XLSX first worksheet is incomplete');
  const relationship = Array.from(relationshipXml.matchAll(/<Relationship\s([^>]*?)\/?>(?:<\/Relationship>)?/g)).find(
    ([, attributes]) => attribute(attributes, 'Id') === relationshipId
  );
  const target = relationship ? attribute(relationship[1], 'Target') : undefined;
  if (!target) throw new Error(`Downloaded XLSX has no relationship ${relationshipId}`);
  const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('xl', target));
  return { name, path };
};

const sharedStrings = (files: ReadonlyMap<string, Buffer>): string[] => {
  const xml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  return Array.from(xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g), ([, value]) => xmlText(value));
};

const styleFormats = (files: ReadonlyMap<string, Buffer>): string[] => {
  const xml = requiredXml(files, 'xl/styles.xml');
  const customFormats = new Map(
    Array.from(xml.matchAll(/<numFmt\s([^>]*?)\/?>(?:<\/numFmt>)?/g), ([, attributes]) => [
      Number(attribute(attributes, 'numFmtId')),
      xmlDecode(attribute(attributes, 'formatCode') ?? ''),
    ])
  );
  const builtInFormats = new Map<number, string>([
    [0, 'General'],
    [1, '0'],
  ]);
  const cellXfs = xml.match(/<cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/cellXfs>/)?.[1];
  if (!cellXfs) throw new Error('Downloaded XLSX styles have no cell formats');
  return Array.from(cellXfs.matchAll(/<xf\s([^>]*?)\/?>(?:<\/xf>)?/g), ([, attributes]) => {
    const id = Number(attribute(attributes, 'numFmtId') ?? 0);
    return customFormats.get(id) ?? builtInFormats.get(id) ?? `numFmtId:${id}`;
  });
};

export async function parsePivotExportWorkbook(contents: Buffer): Promise<PivotWorkbook> {
  const files = await unzip(contents);
  const sheet = resolveSheet(files);
  const worksheet = requiredXml(files, sheet.path);
  const strings = sharedStrings(files);
  const formats = styleFormats(files);
  const cells = new Map<string, PivotWorkbookCell>();

  for (const match of worksheet.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1];
    const body = match[2] ?? '';
    const reference = attribute(attributes, 'r');
    if (!reference) throw new Error('Downloaded XLSX contains a cell without a reference');
    const styleIndex = Number(attribute(attributes, 's') ?? 0);
    const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
    const cellType = attribute(attributes, 't');
    let type: PivotWorkbookCell['type'] = 'blank';
    let value: PivotWorkbookCell['value'] = null;
    if (cellType === 's' && raw !== undefined) {
      type = 'text';
      value = strings[Number(raw)] ?? '';
    } else if (cellType === 'inlineStr') {
      type = 'text';
      value = xmlText(body);
    } else if (raw !== undefined) {
      type = 'number';
      value = Number(raw);
    }
    cells.set(reference, {
      numberFormat: formats[styleIndex] ?? `style:${styleIndex}`,
      reference,
      styleIndex,
      type,
      value,
    });
  }

  const merges = Array.from(worksheet.matchAll(/<mergeCell\s([^>]*?)\/?>(?:<\/mergeCell>)?/g), ([, attributes]) =>
    attribute(attributes, 'ref')
  ).filter((value): value is string => Boolean(value));
  const paneAttributes = worksheet.match(/<pane\s([^>]*?)\/?>(?:<\/pane>)?/)?.[1];
  const pane = paneAttributes
    ? {
        state: attribute(paneAttributes, 'state') ?? '',
        topLeftCell: attribute(paneAttributes, 'topLeftCell') ?? '',
        xSplit: Number(attribute(paneAttributes, 'xSplit') ?? 0),
        ySplit: Number(attribute(paneAttributes, 'ySplit') ?? 0),
      }
    : null;

  return { cells, merges, pane, sheetName: sheet.name, sheetPath: sheet.path };
}
