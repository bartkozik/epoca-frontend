import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'yaml';

const ROOT_CI_URL = new URL('../.gitlab-ci.yml', import.meta.url);
const PACKAGE_URL = new URL('../package.json', import.meta.url);
const README_URL = new URL('../README.md', import.meta.url);
const rootCiSource = readFileSync(ROOT_CI_URL, 'utf8');
const rootCi = yaml.parse(rootCiSource);

const legacyStagingPaths = [
  '../.gitlab/ci/staging-pm-classification-acceptance.yml',
  '../playwright.pm-classification.staging.config.ts',
  './staging-pm-acceptance-ci.test.mjs',
  './wait-for-pm-classification-staging.mjs',
  './wait-for-pm-classification-staging.test.mjs',
  '../tests/pmClassification/fixtures/stagingAcceptanceSupport.ts',
  '../tests/pmClassification/fixtures/stagingEnv.ts',
  '../tests/pmClassification/pmClassification.staging.spec.ts',
  '../tests/pmClassification/stagingSupport.spec.ts',
];

function commands(job) {
  assert.ok(Array.isArray(job?.script), 'job requires a script command list');
  return job.script.map(String);
}

function assertDefaultBranchOnly(job) {
  assert.ok(job?.rules?.some((rule) => rule.if === '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'));
  assert.ok(!job?.rules?.some((rule) => rule.if === '$CI_COMMIT_BRANCH == "staging"'));
}

void test('root test gate executes the generic staging deploy contract', () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_URL, 'utf8'));
  assert.match(packageJson.devDependencies?.yaml ?? '', /^\^2\./, 'CI parser must remain a direct dev dependency');

  const testCommands = commands(rootCi.test).join('\n');
  assert.match(testCommands, /node --test/);
  assert.match(testCommands, /scripts\/staging-frontend-deploy-ci\.test\.mjs/);
  assert.doesNotMatch(testCommands, /staging-pm-acceptance|wait-for-pm-classification-staging/);
});

void test('default-branch build publishes the full-SHA frontend image and moves latest', () => {
  const build = rootCi.build_staging_frontend_image;
  assert.equal(build?.stage, 'build');
  assert.equal(build?.image, 'docker:19.03.12');
  assert.deepEqual(new Set(build?.tags), new Set(['privileged', 'bydle-server']));
  assertDefaultBranchOnly(build);

  const script = commands(build);
  const loginIndex = script.findIndex(
    (command) => /CI_JOB_TOKEN/.test(command) && /docker login/.test(command) && /--password-stdin/.test(command)
  );
  const buildIndex = script.findIndex(
    (command) =>
      /docker build/.test(command) &&
      /BUILD_VERSION=.*CI_COMMIT_SHA/.test(command) &&
      /CI_REGISTRY_IMAGE.*CI_COMMIT_SHA/.test(command)
  );
  const pushIndex = script.findIndex(
    (command) => /docker push/.test(command) && /CI_REGISTRY_IMAGE.*CI_COMMIT_SHA/.test(command)
  );
  assert.ok(loginIndex >= 0 && loginIndex < buildIndex && buildIndex < pushIndex);
  const latestIndex = script.findIndex(
    (command) =>
      /CI_COMMIT_BRANCH.*CI_DEFAULT_BRANCH/.test(command) &&
      /EPOCA_CLEAN_RELEASE_BUILD/.test(command) &&
      /docker push "\$CI_REGISTRY_IMAGE:latest"/.test(command)
  );
  assert.ok(latestIndex > pushIndex, 'latest is pushed only after the full-SHA image, on the default branch');
});

void test('staging deploy triggers only the generic DevOps frontend release', () => {
  const deploy = rootCi.deploy_staging_frontend;
  assert.equal(deploy?.stage, 'deploy');
  assert.equal(deploy?.needs, undefined, 'stage ordering must wait for every build job before deployment');
  assert.ok(rootCi.stages.indexOf('build') < rootCi.stages.indexOf('deploy'));
  assert.deepEqual(deploy?.variables, {
    DEPLOY_FRONTEND: '1',
    FRONTEND_IMAGE: '$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA',
    FRONTEND_SHA: '$CI_COMMIT_SHA',
  });
  assert.equal(deploy?.trigger?.project, 'epoca/epoca-devops');
  assert.equal(deploy?.trigger?.branch, 'main');
  assert.equal(deploy?.trigger?.strategy, 'mirror');
  assert.equal(deploy?.trigger?.forward?.yaml_variables, true);
  assert.equal(deploy?.trigger?.forward?.pipeline_variables, false);
  assert.equal(deploy?.script, undefined);
  assertDefaultBranchOnly(deploy);

  const serializedVariables = JSON.stringify(deploy.variables);
  assert.doesNotMatch(
    serializedVariables,
    /BACKEND|MIGRATION|SCHEMA|CT[-_]?\d+|OAUTH|INTEGRATION.?CLIENT|FIXTURE|ACCEPTANCE/i
  );
});

void test('task-specific staging fixture lifecycle is removed while controlled PM E2E remains', () => {
  const mrE2e = rootCi.e2e_mr;
  assert.equal(mrE2e?.stage, 'test');
  assert.ok(
    mrE2e?.rules?.some((rule) => rule.if === '$CI_PIPELINE_SOURCE == "merge_request_event"'),
    'controlled aggregate E2E must remain in merge request pipelines'
  );
  assert.match(commands(mrE2e).join('\n'), /test:e2e:ci/);
  assert.equal(rootCi.staging_pm_classification_lifecycle, undefined);
  for (const relativePath of legacyStagingPaths) {
    assert.equal(existsSync(new URL(relativePath, import.meta.url)), false, `${relativePath} must be removed`);
  }
  assert.doesNotMatch(rootCiSource, /CT512|CT-512|CT522|CT-522/);

  const readme = readFileSync(README_URL, 'utf8');
  assert.match(readme, /DEPLOY_FRONTEND=1/);
  assert.match(readme, /FRONTEND_SHA/);
  assert.match(readme, /FRONTEND_IMAGE/);
  assert.doesNotMatch(readme, /CT512|CT-512|CT522|CT-522/);
});
