import 'node:module';

declare module 'node:module' {
  export function stripTypeScriptTypes(
    code: string,
    options?: { mode?: 'strip' | 'transform'; sourceMap?: boolean; sourceUrl?: string },
  ): string;
}
