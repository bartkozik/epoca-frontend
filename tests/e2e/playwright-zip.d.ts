declare module 'playwright-core/lib/zipBundle' {
  import type { Readable } from 'node:stream';

  interface ZipEntry {
    fileName: string;
  }
  interface ZipFile {
    close(): void;
    readEntry(): void;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'entry', listener: (entry: ZipEntry) => void): this;
    openReadStream(entry: ZipEntry, callback: (error: Error | null, stream?: Readable) => void): void;
  }
  export const yauzl: {
    fromBuffer(
      buffer: Buffer,
      options: { lazyEntries: boolean },
      callback: (error: Error | null, file?: ZipFile) => void,
    ): void;
  };
}
