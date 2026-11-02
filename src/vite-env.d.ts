/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

// vite/client's own ImportMetaEnv only declares the vars Vite itself injects (BASE_URL, MODE, ...)
// and otherwise falls back to `Record<string, any>` for anything else -- augmenting it here (see
// https://vitejs.dev/guide/env-and-mode.html#intellisense-for-typescript) gives our app's own
// `VITE_*` build-time vars (read in src/core/config/env.ts) a real type instead of `any`. Optional
// because an unset build-time var resolves to `undefined` at runtime, which env.ts already handles.
// Not `readonly` -- env.test.ts deliberately reassigns these to mock build-time values per test.
interface ImportMetaEnv {
  VITE_API_BASE_URL?: string;
  VITE_PUBLIC_URL?: string;
}
