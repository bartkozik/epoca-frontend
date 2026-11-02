import path from 'node:path';

const assertArrayField = (value, label, { optional = false } = {}) => {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new Error(`Playwright ${label} must be an array`);
  return value;
};

const normalizeSpec = (file, rootDir, repositoryRoot) => {
  if (typeof file !== 'string' || file.trim() === '') throw new Error('Playwright spec file must be non-empty');
  const absolute = path.isAbsolute(file) ? file : path.resolve(rootDir, file);
  const relative = path.relative(repositoryRoot, absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Playwright spec file escapes the repository: ${file}`);
  }
  return relative.split(path.sep).join('/');
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) throw new Error('Playwright spec tags must be an array');
  return tags.map((tag) => {
    if (typeof tag !== 'string' || tag.trim() === '') throw new Error('Playwright tags must be non-empty strings');
    const normalized = tag.trim().replace(/^@/, '');
    if (normalized === '') throw new Error('Playwright tags must be non-empty strings');
    return normalized;
  });
};

export const parsePlaywrightInventory = (json, { repositoryRoot = process.cwd() } = {}) => {
  let report;
  try {
    report = JSON.parse(json);
  } catch {
    throw new Error('Invalid Playwright JSON reporter output');
  }
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Invalid Playwright JSON reporter root');
  }
  const errors = assertArrayField(report.errors, 'errors');
  if (errors.length > 0) throw new Error(`Playwright reporter errors: ${JSON.stringify(errors)}`);
  const suites = assertArrayField(report.suites, 'suites');
  const rootDir =
    report.config && typeof report.config === 'object' && typeof report.config.rootDir === 'string'
      ? report.config.rootDir
      : repositoryRoot;
  const inventory = [];

  const visitSuite = (suite, parents, fileSuite) => {
    if (suite === null || typeof suite !== 'object' || Array.isArray(suite)) {
      throw new Error('Playwright suite must be an object');
    }
    if (typeof suite.title !== 'string' || suite.title.trim() === '') {
      throw new Error('Playwright suite title must be non-empty');
    }
    const specs = assertArrayField(suite.specs, 'suite specs');
    const childSuites = assertArrayField(suite.suites, 'nested suites', { optional: true });
    const titleParts = fileSuite ? parents : [...parents, suite.title.trim()];

    for (const spec of specs) {
      if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
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
          playwrightTest === null ||
          typeof playwrightTest !== 'object' ||
          Array.isArray(playwrightTest) ||
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
