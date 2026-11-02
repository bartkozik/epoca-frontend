import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'yaml';
import { z } from 'zod';

const source = readFileSync(new URL('../.gitlab-ci.yml', import.meta.url), 'utf8');
const jobs = z.record(z.unknown()).parse(yaml.parse(source));
const jobSchema = z
  .object({
    rules: z.array(z.object({ if: z.string(), when: z.string().optional() })),
    script: z.array(z.string()).optional(),
    artifacts: z.object({ access: z.string(), expire_in: z.string(), paths: z.array(z.string()) }).optional(),
  })
  .passthrough();
void test('release smoke API jobs are opt-in, phase selected and artifacts restricted', () => {
  for (const [name, phase] of [
    ['deploy_e2e_smoke', 'deploy'],
    ['post_rollback_e2e_smoke', 'rollback'],
  ]) {
    const job = jobSchema.parse(jobs[name]);
    assert.ok(
      job.rules.some(
        (rule) =>
          rule.if.includes('$CI_PIPELINE_SOURCE == "api"') &&
          rule.if.includes('$EPOCA_RELEASE_VERIFICATION == "true"') &&
          rule.if.includes(`$EPOCA_RELEASE_PHASE == "${phase}"`),
      ),
    );
    assert.ok(job.rules.some((rule) => rule.if.includes('"web"') && rule.when === 'manual'));
    assert.ok(job.rules.every((rule) => !rule.if.includes('merge_request_event')));
  }
  const base = z
    .object({
      artifacts: z.object({
        access: z.literal('developer'),
        expire_in: z.literal('7 days'),
        paths: z.array(z.string()),
      }),
    })
    .parse(jobs['.release_smoke']);
  assert.deepEqual(base.artifacts.paths, ['safe-artifacts/release-smoke.json']);
});
void test('release build explicitly disables Docker and dependency cache and cannot trigger deployment', () => {
  assert.match(source, /docker build --no-cache --pull/);
  assert.match(source, /YARN_ENABLE_GLOBAL_CACHE=false/);
  assert.match(source, /YARN_CACHE_FOLDER=.*CI_JOB_ID/);
  const deploy = jobSchema.parse(jobs.deploy_staging_frontend);
  assert.equal(deploy.rules[0]?.when, 'never');
  assert.match(deploy.rules[0]?.if ?? '', /EPOCA_CLEAN_RELEASE_BUILD/);
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /HEALTHCHECK.*CMD/);
  assert.match(dockerfile, /127\.0\.0\.1.*frontend-version/);
  assert.match(dockerfile, /RESOURCE_PATH_PREFIX/);
});
void test('candidate Docker context excludes private state and exposes its immutable revision', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /LABEL org\.opencontainers\.image\.revision=\$BUILD_VERSION/);
  const ignore = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8');
  for (const pattern of ['node_modules', 'test-results', 'safe-artifacts', '.git'])
    assert.ok(ignore.split('\n').includes(pattern));
});

void test('HTTP healthcheck rejects failure or wrong revision and supports a non-root prefix', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const line = dockerfile.split('\n').find((entry) => entry.startsWith('HEALTHCHECK '));
  assert.ok(line);
  const command = line.slice(line.indexOf(' CMD ') + 5);
  /** @type {Array<[string, number]>} */
  const healthCases = [
    ['expected-sha', 0],
    ['wrong-sha', 1],
    ['', 1],
  ];
  for (const [actual, expectedStatus] of healthCases) {
    const script = `wget() { case "$*" in *http://127.0.0.1/teams/epoca/frontend-version) printf '%s' "$HEALTH_BODY";; *) return 1;; esac; }; cat() { printf expected-sha; }; ${command}`;
    const result = spawnSync('/bin/sh', ['-c', script], {
      encoding: 'utf8',
      env: { RESOURCE_PATH_PREFIX: '/teams/epoca/', HEALTH_BODY: actual },
    });
    assert.equal(result.status, expectedStatus);
  }
});
void test('clean Docker verifier actually adds no-cache and pull only on explicit request', () => {
  const job = jobSchema.parse(jobs.verify_docker_image);
  const definition = job.script?.[0];
  assert.ok(definition);
  /** @type {Array<[string, string[]]>} */
  const buildCases = [
    ['true', ['build', '--no-cache', '--pull', 'candidate']],
    ['false', ['build', 'candidate']],
  ];
  for (const [flag, expected] of buildCases) {
    /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
    const options = { encoding: 'utf8', env: { EPOCA_CLEAN_RELEASE_BUILD: flag } };
    /** @type {import('node:child_process').SpawnSyncReturns<string>} */
    const result = spawnSync(
      '/bin/sh',
      ['-c', `docker() { printf '%s\\n' "$@"; }; ${definition}\ndocker_build candidate`],
      options,
    );
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split('\n'), expected);
  }
});
