import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig, type Plugin } from 'vitest/config';

const isTest = process.env.VITEST === 'true';

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
  plugins: [react(), tsconfigPaths(), ...(isTest ? [mockFileAssets()] : [svgr()])],
  server: {
    host: '127.0.0.1',
    proxy: {
      '^/api(?:/|\\?|$)': {
        target: process.env.EPOCA_LOCAL_PROXY_TARGET || 'http://127.0.0.1:9000',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: 'build',
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
      generateScopedName: '[name]_[local]_[hash:base64:5]',
    },
    preprocessorOptions: {
      scss: {
        loadPaths: [path.resolve(__dirname, 'src')],
        api: 'modern-compiler',
      },
    },
  },
  test: {
    maxWorkers: process.env.CI ? 2 : undefined,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
