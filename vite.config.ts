import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
// `vitest/config`'s `defineConfig` re-exports Vite's own, but also types the `test` field below —
// plain `vite`'s `defineConfig` doesn't know about `test` and `tsc` would reject it.
import { defineConfig, type Plugin } from 'vitest/config';

// Vitest sets `process.env.VITEST` for every run — distinguishes real app mode from test mode.
const isTest = process.env.VITEST === 'true';

// Mocks non-code imports (default export = filename), matching how tests assert against asset
// filenames (e.g. an icon's accessible name). For `.svg?react` imports specifically, produces a
// mock `forwardRef` component instead of a real render, so component tests don't need real SVGs.
const CODE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.json',
]);

const pascalCase = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char: string) => char.toUpperCase())
    .replace(/^[a-z]/, (char) => char.toUpperCase());

// The same asset is often imported with both a plain and a `?react` specifier across many test
// files; cache by resolved file path (query stripped) so both specifiers share one fs check.
const fileExistsCache = new Map<string, boolean>();
const isExistingFile = (filePath: string): boolean => {
  const cached = fileExistsCache.get(filePath);
  if (cached !== undefined) return cached;
  const result = existsSync(filePath) && statSync(filePath).isFile();
  fileExistsCache.set(filePath, result);
  return result;
};

const mockFileAssets = (): Plugin => ({
  name: 'mock-file-assets-like-cra-jest',
  enforce: 'pre',
  transform(_code, id) {
    const filePath = id.replace(/[?#].*$/, '');
    if (CODE_EXTENSIONS.has(path.extname(filePath))) return null;
    // Only this app's own source gets the filename-mock treatment.
    if (filePath.includes(`${path.sep}node_modules${path.sep}`)) return null;
    if (!isExistingFile(filePath)) return null;

    const assetFilename = JSON.stringify(path.basename(filePath));
    const isReactComponentQuery = /[?&]react(&|$)/.test(id.slice(filePath.length));

    if (!/\.svg$/i.test(filePath) || !isReactComponentQuery) {
      return { code: `export default ${assetFilename};`, map: null };
    }

    const componentName = `Svg${pascalCase(path.parse(filePath).name)}`;
    return {
      code: `import { createElement, forwardRef } from 'react';
const ${componentName} = forwardRef(function ${componentName}(props, ref) {
  return createElement('svg', { ...props, ref }, ${assetFilename});
});
export default ${componentName};
`,
      map: null,
    };
  },
});

export default defineConfig({
  // `svgr` is pinned to 4.3.0 (not the newer major) because this project's Node/Yarn toolchain
  // predates v5's rewrite, and 4.3.0 already matches the `?react` convention used here.
  plugins: [react(), tsconfigPaths(), ...(isTest ? [mockFileAssets()] : [svgr()])],
  server: {
    // Bare `localhost` resolves to the IPv6 loopback (`::1`) only on this toolchain; Playwright
    // configs hit `127.0.0.1` explicitly, so binding here avoids a silent "connection refused".
    host: '127.0.0.1',
    // Without this, `yarn dev` silently serves the SPA's own `index.html` for every unmocked
    // `/api/*` request (200 with the wrong content, not a visible error) instead of proxying it.
    // `EPOCA_LOCAL_PROXY_TARGET` also backs playwright.local-proxy.config.ts's proxy target, so
    // both stay in sync from one place; defaults to the local backend; no company staging connection is configured.
    proxy: {
      // Vite's plain string keys are prefix matches: `/api` also catches `/apiary`.
      // Match the API path segment, including a query on the bare `/api` endpoint.
      '^/api(?:/|\\?|$)': {
        target: process.env.EPOCA_LOCAL_PROXY_TARGET || 'http://127.0.0.1:9000',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: 'build',
    // No explicit `target`: intentionally accepting Vite's own default (unlike CRA, which read
    // the removed `browserslist` field via @babel/preset-env/autoprefixer, neither of which this
    // project uses anymore). Narrowing or widening browser support is a product decision, not
    // made here — set `target` explicitly if that's ever decided.
    // `scripts/capture-baseline.mjs` and the Dockerfile/nginx.conf artifact contract expect JS
    // chunks under `build/static/js` — Vite's default flat `assets/[name]-[hash][extname]` layout
    // wouldn't satisfy that.
    rollupOptions: {
      output: {
        entryFileNames: 'static/js/[name].[hash].js',
        chunkFileNames: 'static/js/[name].[hash].chunk.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some((name) => name.endsWith('.css'))) {
            return 'static/css/[name].[hash][extname]';
          }
          return 'static/media/[name].[hash][extname]';
        },
      },
    },
  },
  css: {
    modules: {
      // Matches vite-tanstack-zod-template's scoped class naming convention.
      generateScopedName: '[name]_[local]_[hash:base64:5]',
    },
    preprocessorOptions: {
      scss: {
        // `vite-tsconfig-paths` only patches JS/TS resolution, so Sass needs its own `loadPaths`
        // entry to resolve bare specifiers like `@use 'core/theme/common-colors' as colors;` against `src/`.
        loadPaths: [path.resolve(__dirname, 'src')],
        // Modern API avoids the deprecated legacy Sass JS API; matches template convention.
        api: 'modern-compiler',
      },
    },
  },
  test: {
    // Limit CPU contention with other jobs on shared CI runners so DOM timers can run.
    maxWorkers: process.env.CI ? 2 : undefined,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    // Vitest's default glob also picks up `tests/**/*.spec.ts`, which are Playwright e2e specs
    // run separately via `playwright test`, not Vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
