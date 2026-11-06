import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

export const trustedCoverageFixturePath = fileURLToPath(new URL('./fixtures/coverage-map.fixture.ts', import.meta.url));
export const trustedCoverageMapPath = fileURLToPath(new URL('../../tests/e2e/coverage-map.ts', import.meta.url));

/** @param {string} detail @returns {never} */
const fail = (detail) => {
  throw new Error(`Coverage source must contain trusted static data only: ${detail}`);
};

/** @param {import("typescript").Node} node @param {import("typescript").SyntaxKind} kind */
const hasModifier = (node, kind) =>
  Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));

/** @param {import("typescript").Expression} node @returns {import("typescript").Expression} */
const unwrapDataExpression = (node) => {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return unwrapDataExpression(node.expression);
  }
  return node;
};

/** @param {import("typescript").Expression} input @param {string} path */
const assertDataExpression = (input, path) => {
  const node = unwrapDataExpression(input);
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(node.operand)
  ) {
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) fail(`${path}[${index}] is executable`);
      assertDataExpression(element, `${path}[${index}]`);
    });
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const names = new Set();
    for (const property of node.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        property.name === undefined ||
        ts.isComputedPropertyName(property.name)
      ) {
        fail(`${path} contains a non-data property`);
      }
      if (
        !ts.isIdentifier(property.name) &&
        !ts.isStringLiteral(property.name) &&
        !ts.isNumericLiteral(property.name)
      ) {
        fail(`${path} contains an unsupported property name`);
      }
      const name = property.name.text;
      if (name === '__proto__' || name === 'prototype' || name === 'constructor') {
        fail(`${path}.${name} is not allowed`);
      }
      if (names.has(name)) fail(`${path}.${name} is duplicated`);
      names.add(name);
      assertDataExpression(property.initializer, `${path}.${name}`);
    }
    return;
  }
  fail(`${path} uses ${ts.SyntaxKind[node.kind]}`);
};

/** @param {string} source @param {string} fileName */
const assertTrustedSource = (source, fileName) => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (
    ts
      .transpileModule(source, { reportDiagnostics: true })
      .diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
  )
    fail(`invalid TypeScript in ${fileName}`);

  for (const statement of sourceFile.statements) {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEmptyStatement(statement)
    ) {
      continue;
    }
    if (!ts.isVariableStatement(statement)) fail(`${fileName} contains ${ts.SyntaxKind[statement.kind]}`);
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) fail(`${fileName} contains non-const data`);
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) fail(`${fileName} contains a default export`);
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
        fail(`${fileName} contains a non-data declaration`);
      }
      assertDataExpression(declaration.initializer, declaration.name.text);
    }
  }
  return sourceFile;
};

/** @param {unknown} value @param {string} [path] @returns {unknown} */
const clonePlainData = (value, path = 'exports') => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return Array.from(value, (item, index) => clonePlainData(item, `${path}[${index}]`));
  if (typeof value !== 'object') fail(`${path} contains non-data output`);
  if (Object.getOwnPropertySymbols(value).length > 0) fail(`${path} contains symbol keys`);

  /** @type {Record<string, unknown>} */
  const output = {};
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail(`${path}.${key} is not allowed`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) fail(`${path}.${key} is not plain data`);
    output[key] = clonePlainData(descriptor.value, `${path}.${key}`);
  }
  return output;
};

/** @param {string} source @param {string} [fileName] @returns {Record<string, unknown>} */
export const loadCoverageMapSource = (source, fileName = 'coverage-map.ts') => {
  if (typeof source !== 'string') fail('source must be a string');
  assertTrustedSource(source, fileName);

  const transpiled = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  });
  const errors = transpiled.diagnostics?.filter(({ category }) => category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length > 0) fail(`TypeScript transpilation failed for ${fileName}`);

  /** @type {Record<string, unknown>} */
  const exportsObject = {};
  Object.setPrototypeOf(exportsObject, null);
  const moduleObject = { exports: exportsObject };
  /** @type {Record<string, unknown>} */
  const sandbox = {};
  Object.setPrototypeOf(sandbox, null);
  sandbox.module = moduleObject;
  sandbox.exports = exportsObject;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const script = new vm.Script(transpiled.outputText, { filename: fileName });
  script.runInContext(context, { timeout: 100 });
  const cloned = clonePlainData(moduleObject.exports);
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) fail('exports must be an object');
  return Object.fromEntries(Object.entries(cloned));
};

/** @returns {typeof import("./fixtures/coverage-map.fixture.ts")} */
export const loadCoverageFixture = () => {
  const loaded = loadCoverageMapSource(readFileSync(trustedCoverageFixturePath, 'utf8'), trustedCoverageFixturePath);
  const keys = Object.keys(loaded).sort();
  if (keys.length !== 2 || keys[0] !== 'coverageMap' || keys[1] !== 'expectedBackfillIds') {
    fail('trusted fixture must export only coverageMap and expectedBackfillIds');
  }
  return loaded;
};

/** @returns {typeof import("../../tests/e2e/coverage-map.ts")} */
export const loadCoverageMap = () => {
  const loaded = loadCoverageMapSource(readFileSync(trustedCoverageMapPath, 'utf8'), trustedCoverageMapPath);
  const keys = Object.keys(loaded).sort();
  const expected = [
    'BACKFILL_COVERAGE_IDS',
    'E2E_SUITE_REGISTRY',
    'WORK_UNIT_OVERRIDES_BASELINE',
    'coverageMap',
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail('trusted coverage map must export only coverage map, backfills, suite registry, and override baseline');
  }
  return loaded;
};
