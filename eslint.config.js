// eslint.config.js
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import restrictedGlobals from 'confusing-browser-globals';
// Pinned to ^8.7.0, which predates the `/flat` subpath export from v9 — its root export is
// already flat-config-compatible, so it's imported from the package root instead.
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

  // eslint:recommended
  js.configs.recommended,

  // plugin:react/recommended
  pluginReact.configs.flat.recommended,

  // plugin:@typescript-eslint/recommended (non-type-checked)
  ...tseslint.configs.recommended,

  // CT-358: plugin:@typescript-eslint/recommended-type-checked. Must be inserted here — before
  // the "epoca-frontend's own .eslintrc.js top-level overrides" block further down — so that
  // block's no-unused-vars/no-explicit-any/explicit-function-return-type overrides keep winning
  // unchanged (later flat-config entries win; this block deliberately loses to that one).
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

  // CT-358: template severity calibration (permanent). The no-unsafe-* family fires
  // overwhelmingly on interaction with untyped/JSON/allowJs code rather than real bugs —
  // vite-tanstack-zod-template itself downgrades exactly these five rules to 'warn' rather than
  // leaving them at the preset's 'error' default. Adopted as-is here.
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

  // Part (b) of plugin:prettier/recommended (running Prettier as a lint rule) stays disabled —
  // see the 'prettier/prettier': 'off' entry below.
  prettierConfig,

  // `'detect'` can't be used: eslint-plugin-react@7.37.1's version-detection path calls the
  // legacy `context.getFilename()` API, which ESLint 10 removed, crashing the lint run. Pinned
  // explicitly instead.
  {
    settings: {
      react: { version: '18.3.1' },
    },
  },

  // `env: { browser: true, es2021: true }` has no flat-config equivalent; `browser: true`'s
  // replacement is `languageOptions.globals: globals.browser`. `es2021` needs no replacement —
  // flat config's own default (`ecmaVersion: 'latest'`) is already a superset of ES2021 syntax.
  {
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Flat config defaults `reportUnusedDisableDirectives` to 'warn'; the old `.eslintrc.js` setup
  // never enabled it. Off here to match.
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },

  // `eslint:recommended` is a live preset — ESLint 9/10 added rules that didn't exist under the
  // ESLint 8.57.1 version this config was ported from. Turned back off to keep the lint contract
  // equal to the pre-migration baseline rather than silently adopting newer defaults.
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

  // eslint-config-react-app/index.js's top-level `rules` object has no `files` restriction of
  // its own — applies to every file, not just .ts/.tsx. Kept global/unscoped here to match; only
  // its separate, genuinely ts/tsx-scoped override (further down) stays scoped.
  {
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      // --- react-hooks ---
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',

      // --- jsx-a11y: all 17 rules, unchanged severities ---
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

      // --- react/* set directly by eslint-config-react-app ---
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
      // NOT part of plugin:react/recommended — ported as standalone entries.
      'react/forbid-foreign-prop-types': ['warn', { allowInPropTypes: true }],
      'react/jsx-pascal-case': ['warn', { allowAllCaps: true, ignore: [] }],
      'react/no-typos': 'error',
      'react/style-prop-object': 'warn',

      // --- import: only these two ported, the rest were webpack-specific ---
      'import/first': 'error',
      'import/no-anonymous-default-export': 'warn',

      // --- base plain ESLint rules from eslint-config-react-app/index.js ---
      'array-callback-return': 'warn',
      // These are turned back 'off' for .ts/.tsx in the ts/tsx-scoped block below, in favor of
      // TS-aware equivalents (or, for no-use-before-define, a TS-aware options variant).
      'default-case': ['warn', { commentPattern: '^no default$' }],
      'no-array-constructor': 'warn',
      'no-use-before-define': ['warn', { functions: false, classes: false, variables: false }],
      'no-redeclare': 'warn',
      'no-dupe-class-members': 'warn',
      'no-useless-constructor': 'warn',
      // `tseslint.configs.recommended` turns the base rule 'off' globally in favor of
      // '@typescript-eslint/no-unused-expressions' (with the plugin's stricter default options).
      // Restored here with react-app's options; the TS-prefixed global that would otherwise
      // double-report every violation on .mjs/.js is turned off in the block just below.
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

  // `tseslint.configs.recommended` sets both '@typescript-eslint/no-array-constructor' and
  // '@typescript-eslint/no-unused-expressions' to 'error' globally, not just for .ts/.tsx. Left
  // as-is, they'd double-report every violation on .mjs/.js files alongside the base-rule
  // counterparts above. Off here globally; the ts/tsx-scoped block below re-enables both.
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
      // --- react-refresh: Vite-specific ---
      'react-refresh/only-export-components': ['warn', { extraHOCs: ['observer'] }],

      // --- TS-scoped override block from eslint-config-react-app/index.js ---
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

      // typescript-eslint 8.x broadened this rule to also flag bare, unassigned `require(...)`
      // calls (e.g. `require('dayjs/locale/en')` for its side effect) — this repo has several
      // legitimate ones. Not something this migration means to newly enforce.
      '@typescript-eslint/no-require-imports': 'off',

      // `tseslint.configs.recommended` sets 'getter-return: off' for TS files (TypeScript's own
      // compiler already catches missing returns via ts(2378)), but the "base plain ESLint
      // rules" block above sets it 'warn' globally and comes later in array order, overriding it.
      // Repeated here, after that block, so 'off' wins again for .ts/.tsx.
      'getter-return': 'off',
    },
  },

  // epoca-frontend's own .eslintrc.js top-level overrides — deliberately global/unscoped, since
  // that's how the original file wrote them: a top-level `rules` object with no `files`
  // restriction, applying wherever the old project-wide TS parser setting applied.
  //
  // Must stay global: `tseslint.configs.recommended` (spread in above) itself sets most
  // `@typescript-eslint/*` rules globally, not just for .ts/.tsx (only its 'eslint-recommended'
  // sub-config, covered by the 'getter-return: off' comment above, is ts/tsx-scoped). This block
  // comes after that spread, so its no-explicit-any/no-unused-vars overrides win everywhere.
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
      // A bare 'warn' here would fall back to the plugin's own defaults (args: 'after-used',
      // ignoreRestSiblings: false), newly flagging unused params/rest-siblings this repo exempts.
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
    },
  },

  // Test-file-scoped rules, ported from eslint-config-react-app/jest.js to @vitest/eslint-plugin.
  // Three of the ten original jest/* rules have no Vitest equivalent (no-jasmine-globals,
  // no-jest-import, no-mocks-import — they check for Jest/Jasmine artifacts that can't occur
  // here) and are dropped rather than mapped to a non-existent rule name.
  //
  // eslint-plugin-testing-library 7.x renamed some rules from the version this was originally
  // transcribed against: await-async-query -> await-async-queries, no-await-sync-query ->
  // no-await-sync-queries, no-render-in-setup -> no-render-in-lifecycle. no-wait-for-empty-callback
  // was removed upstream with no replacement, and is dropped for the same reason as the jest/*
  // rules above.
  {
    files: ['**/__tests__/**/*', '**/*.{spec,test}.{ts,tsx}'],
    plugins: { vitest, 'testing-library': testingLibrary },
    rules: {
      // CT-358 MR2: vitest/unbound-method replaces the base rule for test files -- it recognizes
      // safe built-in method references (e.g. DOM methods like anchor.click) that the base
      // @typescript-eslint/unbound-method flags as false positives. It does NOT recognize mocked
      // third-party instance methods (see the per-line eslint-disable exceptions elsewhere in
      // this MR for why those still need individual suppression).
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

  // file-scoped override from .eslintrc.js
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // Both files use Playwright's `test.extend({ fixtureName: async (fixtures, use) => ... })`
  // pattern, where `use` is a plain callback parameter with no relation to React.
  // eslint-plugin-react-hooks 7.1.1's hook-call heuristic flags any call to an identifier
  // literally named `use` as a React Hook invocation regardless of context — not a real violation.
  {
    files: ['tests/e2e/fixtures/epocaTest.ts', 'tests/pmClassification/fixtures/pmClassificationApi.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  // `${VAR}` placeholders here are `envsubst` tokens (substituted by entrypoint.sh at container
  // startup), not JS template-literal expressions -- there is no backtick anywhere in the file.
  {
    files: ['public/assets/env.template.js'],
    rules: {
      'no-template-curly-in-string': 'off',
    },
  },

  // CT-540: eslint-plugin-boundaries enforces the app/core/module layering from
  // it-using-iterators-conventions' frontend/module-boundaries.md — core may import only core;
  // a module may import core and app, never another module; app may import anything. Elements
  // and the dependencies rule below mirror vite-tanstack-zod-template's eslint.config.js, pinned
  // to the same plugin versions so that reference stays valid.
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
      // Test files are free to cross boundaries for mocking/fixture convenience — matches the
      // template, which excludes them from this rule the same way.
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

            // --- Decision 1 (Coupling Ledger, Option C): documented module -> module allowlist ---
            // 27 pairs found scanning the tree at CT-540 time, several genuinely cyclic. Real
            // domain coupling (organizations owns roles/users that clients/projects/reports read;
            // workingTime <-> reports; teamSettings's integration tab is a shell around
            // integrationClients), not stray imports -- see the team's Coupling Ledger doc for the
            // full breakdown and the options considered. Expected to shrink as each domain moves
            // to TanStack Query rather than being fixed ahead of it. Delete a line here once its
            // pair is actually resolved -- don't let it silently become permanent.
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

  // CT-540: eslint-plugin-check-file's filename-naming-convention, scoped to what the team
  // decided (see PR discussion) -- matches vite-tanstack-zod-template's hooks/utils rules
  // exactly, plus a PascalCase rule for components that goes beyond what the template checks
  // (the codebase was already ~100% consistent there; this locks it in for new files).
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
          // `main.tsx` is the Vite entry point; `use*.test.tsx` are hook tests (camelCase,
          // needing `.tsx` only for the JSX used to render a test host around the hook).
          'src/**/!(use*|index|main).tsx': 'PASCAL_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  // CT-564: requests stay at the API boundary; models describe data, hooks own Query subscriptions.
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
