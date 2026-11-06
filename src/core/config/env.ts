declare global {
  interface Window {
    env: { [key: string]: string };
  }
}

export type Env = {
  backendUrl: string;
  publicUrl: string;
};

// Blank build-time values fall back to runtime config; static VITE_* lookups avoid bundling unused env vars.
function resolveEnv(buildTimeValue: string | undefined, name: string, defaultValue = ''): string {
  return buildTimeValue || (window['env'] ? window['env'][name] : undefined) || defaultValue;
}

const env: Env = {
  backendUrl: resolveEnv(import.meta.env.VITE_API_BASE_URL, 'API_BASE_URL'),
  publicUrl: resolveEnv(import.meta.env.VITE_PUBLIC_URL, 'PUBLIC_URL'),
};

export default env;
