import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import restrictedGlobals from 'confusing-browser-globals';
import prettierConfig from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import checkFile from 'eslint-plugin-check-file';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import pluginReact from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'build/**',
      'coverage/**',
      'target/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.worktrees/**',
    ],
  },

  js.configs.recommended,

  pluginReact.configs.flat.recommended,

  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mjs}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.e2e.json', './tsconfig.scripts.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx,mjs}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },

  prettierConfig,

  // React version autodetection uses context.getFilename(), which ESLint 10 removed.
  {
    settings: {
      react: { version: '18.3.1' },
    },
  },

  {
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },

  {
    rules: {
      'no-constant-binary-expression': 'off',
      'no-empty-static-block': 'off',
      'no-new-native-nonconstructor': 'off',
      'no-unassigned-vars': 'off',
      'no-unused-private-class-members': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },

  {
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',

      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/anchor-is-valid': ['warn', { aspects: ['noHref', 'invalidHref'] }],
      'jsx-a11y/aria-activedescendant-has-tabindex': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-role': ['warn', { ignoreNonDOM: true }],
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/heading-has-content': 'warn',
      'jsx-a11y/iframe-has-title': 'warn',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/no-access-key': 'warn',
      'jsx-a11y/no-distracting-elements': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
      'jsx-a11y/scope': 'warn',

      'react/jsx-no-comment-textnodes': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-is-mounted': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-no-undef': 'error',
      'react/require-render-return': 'error',
      'react/forbid-foreign-prop-types': ['warn', { allowInPropTypes: true }],
      'react/jsx-pascal-case': ['warn', { allowAllCaps: true, ignore: [] }],
      'react/no-typos': 'error',
      'react/style-prop-object': 'warn',

      'import/first': 'error',
      'import/no-anonymous-default-export': 'warn',

      'array-callback-return': 'warn',
      'default-case': ['warn', { commentPattern: '^no default$' }],
      'no-array-constructor': 'warn',
      'no-use-before-define': ['warn', { functions: false, classes: false, variables: false }],
      'no-redeclare': 'warn',
      'no-dupe-class-members': 'warn',
      'no-useless-constructor': 'warn',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true }],
      'dot-location': ['warn', 'property'],
      eqeqeq: ['warn', 'smart'],
      'new-parens': 'warn',
      'no-caller': 'warn',
      'no-cond-assign': ['warn', 'except-parens'],
      'no-const-assign': 'warn',
      'no-control-regex': 'warn',
      'no-delete-var': 'warn',
      'no-dupe-args': 'warn',
      'no-dupe-keys': 'warn',
      'no-duplicate-case': 'warn',
      'no-empty-character-class': 'warn',
      'no-empty-pattern': 'warn',
      'no-eval': 'warn',
      'no-ex-assign': 'warn',
      'no-extend-native': 'warn',
      'no-extra-bind': 'warn',
      'no-extra-label': 'warn',
      'no-fallthrough': 'warn',
      'no-func-assign': 'warn',
      'no-implied-eval': 'warn',
      'no-invalid-regexp': 'warn',
      'no-iterator': 'warn',
      'no-label-var': 'warn',
      'no-labels': ['warn', { allowLoop: true, allowSwitch: false }],
      'no-lone-blocks': 'warn',
      'no-loop-func': 'warn',
      'no-mixed-operators': [
        'warn',
        {
          groups: [
            ['&', '|', '^', '~', '<<', '>>', '>>>'],
            ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
            ['&&', '||'],
            ['in', 'instanceof'],
          ],
          allowSamePrecedence: false,
        },
      ],
      'no-multi-str': 'warn',
      'no-global-assign': 'warn',
      'no-unsafe-negation': 'warn',
      'no-new-func': 'warn',
      'no-new-object': 'warn',
      'no-new-symbol': 'warn',
      'no-new-wrappers': 'warn',
      'no-obj-calls': 'warn',
      'no-octal': 'warn',
      'no-octal-escape': 'warn',
      'no-regex-spaces': 'warn',
      'no-restricted-syntax': ['warn', 'WithStatement'],
      'no-script-url': 'warn',
      'no-self-assign': 'warn',
      'no-self-compare': 'warn',
      'no-sequences': 'warn',
      'no-shadow-restricted-names': 'warn',
      'no-sparse-arrays': 'warn',
      'no-template-curly-in-string': 'warn',
      'no-this-before-super': 'warn',
      'no-throw-literal': 'warn',
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-unreachable': 'warn',
      'no-unused-labels': 'warn',
      'no-useless-computed-key': 'warn',
      'no-useless-concat': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-rename': ['warn', { ignoreDestructuring: false, ignoreImport: false, ignoreExport: false }],
      'no-with': 'warn',
      'no-whitespace-before-property': 'warn',
      'require-yield': 'warn',
      'rest-spread-spacing': ['warn', 'never'],
      strict: ['warn', 'never'],
      'unicode-bom': ['warn', 'never'],
      'use-isnan': 'warn',
      'valid-typeof': 'warn',
      'no-restricted-properties': [
        'error',
        { object: 'require', property: 'ensure', message: 'Please use import() instead.' },
        { object: 'System', property: 'import', message: 'Please use import() instead.' },
      ],
      'getter-return': 'warn',
    },
  },

  {
    rules: {
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { extraHOCs: ['observer'] }],

      'default-case': 'off',
      'no-array-constructor': 'off',
      '@typescript-eslint/no-array-constructor': 'warn',
      'no-dupe-class-members': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'warn',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'warn',
        { functions: false, classes: false, variables: false, typedefs: false },
      ],
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true },
      ],
      'no-useless-constructor': 'off',
      '@typescript-eslint/consistent-type-assertions': 'warn',
      '@typescript-eslint/no-useless-constructor': 'warn',

      '@typescript-eslint/no-require-imports': 'off',

      'getter-return': 'off',
    },
  },

  {
    rules: {
      indent: 0,
      'linebreak-style': ['error', 'unix'],
      'prettier/prettier': 0,
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
      'no-undef': 'off',
      'react/no-unescaped-entities': 0,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
    },
  },

  {
    files: ['**/__tests__/**/*', '**/*.{spec,test}.{ts,tsx}'],
    plugins: { vitest, 'testing-library': testingLibrary },
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'vitest/unbound-method': 'error',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/no-interpolation-in-snapshots': 'error',
      'vitest/valid-describe-callback': 'error',
      'vitest/valid-expect': 'error',
      'vitest/valid-expect-in-promise': 'error',
      'vitest/valid-title': 'warn',

      'testing-library/await-async-queries': 'error',
      'testing-library/await-async-utils': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-container': 'error',
      'testing-library/no-debugging-utils': 'error',
      'testing-library/no-dom-import': ['error', 'react'],
      'testing-library/no-node-access': 'error',
      'testing-library/no-promise-in-fire-event': 'error',
      'testing-library/no-render-in-lifecycle': 'error',
      'testing-library/no-unnecessary-act': 'error',
      'testing-library/no-wait-for-multiple-assertions': 'error',
      'testing-library/no-wait-for-side-effects': 'error',
      'testing-library/no-wait-for-snapshot': 'error',
      'testing-library/prefer-find-by': 'error',
      'testing-library/prefer-presence-queries': 'error',
      'testing-library/prefer-query-by-disappearance': 'error',
      'testing-library/prefer-screen-queries': 'off',
      'testing-library/render-result-naming-convention': 'error',
    },
  },

  {
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  {
    files: ['tests/e2e/fixtures/epocaTest.ts', 'tests/pmClassification/fixtures/pmClassificationApi.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  {
    files: ['public/assets/env.template.js'],
    rules: {
      'no-template-curly-in-string': 'off',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        { type: 'app', pattern: 'src/main.tsx', mode: 'file' },
        { type: 'module', pattern: 'src/modules/*', capture: ['moduleName'] },
        { type: 'core', pattern: 'src/core/*' },
      ],
      'boundaries/ignore': ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'app' },
              allow: [{ to: { type: 'app' } }, { to: { type: 'core' } }, { to: { type: 'module' } }],
            },
            { from: { type: 'module' }, allow: [{ to: { type: 'core' } }, { to: { type: 'app' } }] },
            { from: { type: 'core' }, allow: [{ to: { type: 'core' } }] },

            {
              from: { type: 'module', captured: { moduleName: 'teamSettings' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'integrationClients' } } },
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
                { to: { type: 'module', captured: { moduleName: 'ssoAuth' } } },
                { to: { type: 'module', captured: { moduleName: 'projects' } } },
                { to: { type: 'module', captured: { moduleName: 'clients' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'clients' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'projects' } } },
                { to: { type: 'module', captured: { moduleName: 'users' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'projects' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
                { to: { type: 'module', captured: { moduleName: 'users' } } },
                { to: { type: 'module', captured: { moduleName: 'clients' } } },
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'organizations' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'users' } } },
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
                { to: { type: 'module', captured: { moduleName: 'reports' } } },
                { to: { type: 'module', captured: { moduleName: 'clients' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'auth' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'ssoAuth' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'users' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'ssoAuth' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'workingTime' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'reports' } } },
                { to: { type: 'module', captured: { moduleName: 'projects' } } },
                { to: { type: 'module', captured: { moduleName: 'clients' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'reports' } },
              allow: [
                { to: { type: 'module', captured: { moduleName: 'auth' } } },
                { to: { type: 'module', captured: { moduleName: 'workingTime' } } },
                { to: { type: 'module', captured: { moduleName: 'projects' } } },
                { to: { type: 'module', captured: { moduleName: 'organizations' } } },
                { to: { type: 'module', captured: { moduleName: 'clients' } } },
                { to: { type: 'module', captured: { moduleName: 'users' } } },
              ],
            },
            {
              from: { type: 'module', captured: { moduleName: 'integrationClients' } },
              allow: [{ to: { type: 'module', captured: { moduleName: 'teamSettings' } } }],
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/**/*'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          'src/**/hooks/!(index).ts': 'CAMEL_CASE',
          'src/**/utils/!(index).ts': 'KEBAB_CASE',
          'src/**/utils/!(hooks)/**/!(index).ts': 'KEBAB_CASE',
          'src/**/!(use*|index|main).tsx': 'PASCAL_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    ignores: ['**/hooks/**', '**/*.test.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tanstack/react-query',
              importNames: [
                'useQuery',
                'useQueries',
                'useInfiniteQuery',
                'useMutation',
                'useSuspenseQuery',
                'useSuspenseQueries',
                'useSuspenseInfiniteQuery',
              ],
              message:
                'CT-564: define server-state hooks in the owning feature hooks/ directory; providers compose them.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/**/models/*.model.ts', 'src/modules/**/queryKeys.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'CT-564: keep models and query keys independent of React hooks.' },
            {
              name: '@tanstack/react-query',
              message: 'CT-564: put Query hooks in hooks/ and cache operations in a query service.',
            },
          ],
        },
      ],
    },
  },
);
