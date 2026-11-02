import { stripTypeScriptTypes } from 'node:module';

export const resolve = async (specifier, context, nextResolve) => {
  // Match tsconfig's @/* -> src/* alias, independently of the command's working directory.
  const alias = specifier.startsWith('@/');
  const target = alias ? new URL(`../../src/${specifier.slice(2)}`, import.meta.url).href : specifier;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || (!alias && !specifier.startsWith('.'))) throw error;
    return nextResolve(`${target}.ts`, context);
  }
};

export const load = async (url, context, nextLoad) => {
  const typescript = url.startsWith('file:') && new URL(url).pathname.endsWith('.ts');
  // Avoid Node's strip-only format detection before our enum-capable transformation.
  const loaded = await nextLoad(url, typescript ? { ...context, format: 'module' } : context);
  if (!typescript) return loaded;
  // Shared production schemas use enums, which Node's strip-only mode cannot execute.
  const source = typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(loaded.source);
  return { ...loaded, format: 'module', source: stripTypeScriptTypes(source, { mode: 'transform' }) };
};
