import path from 'node:path';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value @param {string} label @param {{optional?: boolean}} [options] @returns {unknown[]} */
const assertArrayField = (value, label, { optional = false } = {}) => {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new Error(`Playwright ${label} must be an array`);
  return value;
};

/** @param {unknown} file @param {string} rootDir @param {string} repositoryRoot */
const normalizeSpec = (file, rootDir, repositoryRoot) => {
  if (typeof file !== 'string' || file.trim() === '') throw new Error('Playwright spec file must be non-empty');
  const absolute = path.isAbsolute(file) ? file : path.resolve(rootDir, file);
  const relative = path.relative(repositoryRoot, absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Playwright spec file escapes the repository: ${file}`);
  }
  return relative.split(path.sep).join('/');
};

/** @param {unknown} tags @returns {string[]} */
const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) throw new Error('Playwright spec tags must be an array');
  return tags.map((tag) => {
    if (typeof tag !== 'string' || tag.trim() === '') throw new Error('Playwright tags must be non-empty strings');
    const normalized = tag.trim().replace(/^@/, '');
    if (normalized === '') throw new Error('Playwright tags must be non-empty strings');
    return normalized;
  });
};

/** @param {string} json @param {{repositoryRoot?: string}} [options] @returns {import("./coverage-validator.mjs").InventoryItem[]} */
export const parsePlaywrightInventory = (json, { repositoryRoot = process.cwd() } = {}) => {
  /** @type {unknown} */
  let report;
  try {
    report = JSON.parse(json);
  } catch {
    throw new Error('Invalid Playwright JSON reporter output');
  }
  if (!isRecord(report)) {
    throw new Error('Invalid Playwright JSON reporter root');
  }
  const errors = assertArrayField(report.errors, 'errors');
  if (errors.length > 0) throw new Error(`Playwright reporter errors: ${JSON.stringify(errors)}`);
  const suites = assertArrayField(report.suites, 'suites');
  const rootDir =
    isRecord(report.config) && typeof report.config.rootDir === 'string' ? report.config.rootDir : repositoryRoot;
  /** @type {import("./coverage-validator.mjs").InventoryItem[]} */
  const inventory = [];

  /** @param {unknown} suite @param {string[]} parents @param {boolean} fileSuite */
  const visitSuite = (suite, parents, fileSuite) => {
    if (!isRecord(suite)) {
      throw new Error('Playwright suite must be an object');
    }
    if (typeof suite.title !== 'string' || suite.title.trim() === '') {
      throw new Error('Playwright suite title must be non-empty');
    }
    const specs = assertArrayField(suite.specs, 'suite specs');
    const childSuites = assertArrayField(suite.suites, 'nested suites', { optional: true });
    const titleParts = fileSuite ? parents : [...parents, suite.title.trim()];

    for (const spec of specs) {
      if (!isRecord(spec)) {
        throw new Error('Playwright spec must be an object');
      }
      if (typeof spec.title !== 'string' || spec.title.trim() === '') {
        throw new Error('Playwright spec title must be non-empty');
      }
      const tests = assertArrayField(spec.tests, 'spec tests');
      if (tests.length === 0) throw new Error('Playwright spec tests must not be empty');
      const tags = normalizeTags(spec.tags);
      const normalizedSpec = normalizeSpec(spec.file, rootDir, repositoryRoot);
      const title = [...titleParts, spec.title.trim()].join(' ');

      for (const playwrightTest of tests) {
        if (
          !isRecord(playwrightTest) ||
          typeof playwrightTest.projectName !== 'string' ||
          playwrightTest.projectName.trim() === ''
        ) {
          throw new Error('Playwright test projectName must be non-empty');
        }
        inventory.push({
          projectName: playwrightTest.projectName.trim(),
          spec: normalizedSpec,
          title,
          tags: [...tags],
        });
      }
    }
    childSuites.forEach((child) => visitSuite(child, titleParts, false));
  };

  suites.forEach((suite) => visitSuite(suite, [], true));
  if (inventory.length === 0) throw new Error('Playwright inventory contains zero tests');

  const identities = new Set();
  for (const entry of inventory) {
    const identity = `${entry.projectName}\0${entry.spec}\0${entry.title}`;
    if (identities.has(identity)) throw new Error(`Ambiguous source identity: ${entry.spec} :: ${entry.title}`);
    identities.add(identity);
  }
  return inventory;
};
