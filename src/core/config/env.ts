declare global {
  interface Window {
    env: { [key: string]: string };
  }
}

export type Env = {
  backendUrl: string;
  publicUrl: string;
};

// `||`, not `??`: an intentionally-blank build-time var (e.g. `VITE_PUBLIC_URL=`) is a defined
// empty string, not `undefined` -- `??` would stop there and never consult the runtime-injected
// `window.env` (set by `entrypoint.sh` at container startup).
//
// Takes the already-resolved `import.meta.env.VITE_X` value as a parameter -- each call site below
// accesses it with a static, literal property name. A dynamic `import.meta.env[key]` lookup here
// instead would defeat Vite's static analysis of which `VITE_`-prefixed vars are actually read, so
// it would bundle the entire resolved env object (every var set at build time, used or not) rather
// than only the ones referenced below.
function resolveEnv(buildTimeValue: string | undefined, name: string, defaultValue = ''): string {
  return buildTimeValue || (window['env'] ? window['env'][name] : undefined) || defaultValue;
}

const env: Env = {
  backendUrl: resolveEnv(import.meta.env.VITE_API_BASE_URL, 'API_BASE_URL'),
  publicUrl: resolveEnv(import.meta.env.VITE_PUBLIC_URL, 'PUBLIC_URL'),
};

export default env;
