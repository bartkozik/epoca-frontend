// scripts/capture-baseline.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

// Rethrows failures prefixed with the step name so the log makes clear which step broke.
const runStep = (label, command, args) => {
  console.log(`Running ${label}...`);
  try {
    return run(command, args);
  } catch (error) {
    throw new Error(`${label} failed: ${error.message}`, { cause: error });
  }
};

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
};

const gitStatus = run('git', ['status', '--porcelain']);
if (gitStatus !== '') {
  console.error(
    'Working tree is not clean — commit or stash changes before capturing a baseline, ' +
      'otherwise the recorded SOURCE_SHA will not match what was actually measured.',
  );
  process.exit(1);
}

mkdirSync('target', { recursive: true });

const sourceSha = run('git', ['rev-parse', 'HEAD']);
const lockfileSha = sha256File('yarn.lock');
const nodeVersion = process.version;
const yarnVersion = run('node', ['.yarn/releases/yarn-4.18.0.cjs', '--version']);

// Vitest's `json` reporter deliberately mirrors Jest's --json report shape, so this parses the
// same fields as before.
runStep('test suite', 'node', [
  '.yarn/releases/yarn-4.18.0.cjs',
  'vitest',
  'run',
  '--reporter=json',
  '--outputFile=target/baseline-jest-report.json',
]);
let jestReport;
try {
  jestReport = JSON.parse(readFileSync('target/baseline-jest-report.json', 'utf8'));
} catch (error) {
  throw new Error(`reading/parsing test report failed: ${error.message}`, { cause: error });
}
const jestSuiteCount = jestReport.numTotalTestSuites;
const jestTestCount = jestReport.numTotalTests;
const jestSnapshotCount = jestReport.snapshot?.total;

// A test run that collected nothing is exactly as wrong as one whose report is malformed, so
// fail loudly on a missing/non-integer field rather than writing `undefined` or a misleading 0
// into the accepted baseline.
for (const [fieldName, value] of [
  ['numTotalTestSuites', jestSuiteCount],
  ['numTotalTests', jestTestCount],
  ['snapshot.total', jestSnapshotCount],
]) {
  if (!Number.isInteger(value) || (value === 0 && fieldName !== 'snapshot.total')) {
    throw new Error(
      `test report field "${fieldName}" is missing, not an integer, or zero (got ${JSON.stringify(value)}) — ` +
        'the --json report shape may have changed or the test run produced no results.',
    );
  }
}

runStep('lint', 'node', ['.yarn/releases/yarn-4.18.0.cjs', 'lint', '-f', 'json', '-o', 'target/baseline-lint.json']);
const lintFindingsSha = sha256File('target/baseline-lint.json');

runStep('typecheck', 'node', ['.yarn/releases/yarn-4.18.0.cjs', 'typecheck']);

runStep('production build', 'env', ['CI=false', 'node', '.yarn/releases/yarn-4.18.0.cjs', 'build']);

console.log('Running post-build asset walk...');
let buildFiles, bundleBytes, jsChunks, chunkManifestSha;
try {
  buildFiles = walk('build');
  bundleBytes = buildFiles.reduce((total, path) => total + statSync(path).size, 0);
  // build/assets/env.template.js and other passthrough static files also end in .js but
  // aren't real JS bundle chunks, so scope to the actual code-split output directory.
  jsChunks = walk(join('build', 'static', 'js')).filter((path) => path.endsWith('.js'));

  if (jsChunks.length === 0) {
    throw new Error(
      'No JS chunks found under build/static/js — build output looks incomplete or misconfigured',
    );
  }

  const chunkManifest = jsChunks
    .map((path) => `${path}\t${sha256File(path)}`)
    .sort()
    .join('\n');
  writeFileSync('target/baseline-chunk-manifest.tsv', `${chunkManifest}\n`);
  chunkManifestSha = sha256File('target/baseline-chunk-manifest.tsv');
} catch (error) {
  throw new Error(`post-build asset walk failed: ${error.message}`, { cause: error });
}

const baselineEnv = `FE_ACCEPTED_BASELINE_DISPOSITION=accepted
FE_ACCEPTED_BASELINE_SOURCE_SHA=${sourceSha}
FE_ACCEPTED_BASELINE_LOCKFILE_SHA256=${lockfileSha}
FE_ACCEPTED_BASELINE_NODE_VERSION=${nodeVersion}
FE_ACCEPTED_BASELINE_YARN_VERSION=${yarnVersion}
FE_ACCEPTED_BASELINE_BUILDER_DIGEST=UNRESOLVED_CONFIRM_AT_IMPLEMENTATION_TIME
FE_ACCEPTED_BASELINE_JEST_SUITE_COUNT=${jestSuiteCount}
FE_ACCEPTED_BASELINE_JEST_TEST_COUNT=${jestTestCount}
FE_ACCEPTED_BASELINE_JEST_SNAPSHOT_COUNT=${jestSnapshotCount}
FE_ACCEPTED_BASELINE_LINT_FINDINGS_PATH=target/baseline-lint.json
FE_ACCEPTED_BASELINE_LINT_FINDINGS_SHA256=${lintFindingsSha}
FE_ACCEPTED_BASELINE_OUTPUT_DIR=build
FE_ACCEPTED_BASELINE_BUNDLE_KIB=${Math.round(bundleBytes / 1024)}
FE_ACCEPTED_BASELINE_JS_CHUNK_COUNT=${jsChunks.length}
FE_ACCEPTED_BASELINE_CHUNK_MANIFEST_SHA256=${chunkManifestSha}
FE_ACCEPTED_BASELINE_IMAGE_DIGEST=UNRESOLVED_CONFIRM_AT_IMPLEMENTATION_TIME
FE_ACCEPTED_BASELINE_VULNERABILITY_POLICY_PATH=UNRESOLVED_CONFIRM_AT_IMPLEMENTATION_TIME
FE_ACCEPTED_BASELINE_VULNERABILITY_POLICY_SHA256=UNRESOLVED_CONFIRM_AT_IMPLEMENTATION_TIME
`;
writeFileSync('FE_ACCEPTED_BASELINE.env', baselineEnv);
console.log('Wrote FE_ACCEPTED_BASELINE.env');
