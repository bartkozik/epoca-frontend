import { expect, test } from '@playwright/test';
import { RELEASE_VERIFICATION_COVERAGE } from '../release-coverage-map';
import { assertReleaseRequest, parseBackendSha, parseCompatibilityFixture, releaseRunId } from './releasePolicy';

const policy = {
  phase: 'rollback' as const,
  frontendOrigin: 'https://frontend.example.test',
  apiBaseURL: 'https://api.example.test/api/v1',
  organizationSlug: 'smoke',
  projectIds: ['owned-project'],
};
const fixture = {
  frontendOrigin: policy.frontendOrigin,
  apiBaseURL: policy.apiBaseURL,
  schemaVersion: 1,
  fixtureId: 'ct527-compat-v1',
  organizationId: 'org',
  organizationSlug: 'smoke',
  projectId: 'persistent-project',
  projectName: 'E2E CT-527 compatibility project',
  workUnitId: 'persistent-unit',
  description: 'E2E CT-527 compatibility worklog',
  date: '2026-09-01',
};

test('CT-527 rollback blocks mutations, foreign origins and foreign organizations @mr @technical', () => {
  for (const [method, url] of [
    ['PATCH', 'https://api.example.test/api/v1/organizations/smoke/projects/owned-project'],
    ['POST', 'https://api.example.test/api/v1/organizations/smoke/work-units'],
    ['GET', 'https://evil.example.test/'],
    ['GET', 'https://api.example.test/api/v1/organizations/other/work-units'],
    ['GET', 'https://frontend.example.test/api/v1/organizations/smoke/work-units'],
    ['POST', 'https://api.example.test/api/v1/organizations/smoke/pivot-tables/work-units/delete'],
  ])
    expect(() => assertReleaseRequest(policy, url, method)).toThrow();
});

test('CT-527 permits bounded auth and safe report reads in rollback @mr @technical', () => {
  for (const [method, url] of [
    ['GET', 'https://frontend.example.test/login'],
    ['POST', 'https://api.example.test/api/v1/auth/login'],
    ['GET', 'https://api.example.test/api/v1/organizations/smoke/work-units?id=persistent-unit'],
    ['POST', 'https://api.example.test/api/v1/organizations/smoke/pivot-tables/work-units/query'],
    ['POST', 'https://api.example.test/api/v1/organizations/smoke/pivot-tables/work-units/export'],
  ])
    expect(() => assertReleaseRequest(policy, url, method)).not.toThrow();
});

test('CT-527 deploy only permits edits of its owned project and marked worklog creation @mr @technical', () => {
  const deploy = { ...policy, phase: 'deploy' as const, runId: 'ct527-test' };
  expect(() =>
    assertReleaseRequest(deploy, `${policy.apiBaseURL}/organizations/smoke/projects/owned-project`, 'PATCH'),
  ).not.toThrow();
  expect(() =>
    assertReleaseRequest(deploy, `${policy.apiBaseURL}/organizations/smoke/projects/persistent-project`, 'PATCH'),
  ).toThrow();
  expect(() =>
    assertReleaseRequest(deploy, `${policy.apiBaseURL}/organizations/smoke/work-units`, 'POST', {
      projectId: 'owned-project',
      description: 'E2E ct527-test worklog',
    }),
  ).not.toThrow();
  expect(() =>
    assertReleaseRequest(deploy, `${policy.apiBaseURL}/organizations/smoke/work-units`, 'POST', {
      projectId: 'persistent-project',
      description: 'E2E ct527-test worklog',
    }),
  ).toThrow();
});

test('CT-527 fixture is prepared, marked and bound to exact dedicated organization @mr @technical', () => {
  expect(parseCompatibilityFixture(fixture, 'org', 'smoke', 'ct527-compat-v1')).toEqual(fixture);
  for (const changed of [
    { organizationId: 'foreign' },
    { description: 'customer data' },
    { fixtureId: 'other' },
    { date: '2026-99-88' },
  ]) {
    expect(() => parseCompatibilityFixture({ ...fixture, ...changed }, 'org', 'smoke', 'ct527-compat-v1')).toThrow();
  }
});

test('CT-527 build-info verifies the deployed exact commit rather than metadata supplied by caller @mr @technical', () => {
  const sha = 'a'.repeat(40);
  expect(parseBackendSha({ commitSha: sha }, sha)).toBe(sha);
  for (const body of [{ commitSha: 'b'.repeat(40) }, {}, { commitSha: sha.slice(0, 8) }, null]) {
    expect(() => parseBackendSha(body, sha)).toThrow();
  }
  expect(() => parseBackendSha({ commitSha: sha }, '')).toThrow();
});

test('CT-527 requires a unique explicit run identity @mr @technical', () => {
  expect(releaseRunId('ct527-123-deploy-a1')).toBe('ct527-123-deploy-a1');
  for (const value of ['', '../path', 'ct530-123']) expect(() => releaseRunId(value)).toThrow();
});

test('CT-527 separate release map binds both opt-in phase jobs @mr @technical', () => {
  expect(RELEASE_VERIFICATION_COVERAGE.map((entry) => entry.evidence.job)).toEqual([
    'deploy_e2e_smoke',
    'post_rollback_e2e_smoke',
  ]);
  expect(RELEASE_VERIFICATION_COVERAGE.map((entry) => entry.command)).toEqual([
    'node scripts/e2e/run-release-smoke.mjs deploy',
    'node scripts/e2e/run-release-smoke.mjs rollback',
  ]);
});
