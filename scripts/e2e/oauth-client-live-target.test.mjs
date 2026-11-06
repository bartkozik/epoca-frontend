import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** @param {string} relativePath */
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

void test('OAuth client targeted live selection fails closed before config target resolution and global provisioning', () => {
  const config = read('playwright.live.config.ts');
  const globalSetup = read('tests/e2e/live/global-setup.ts');
  const configGuard = config.lastIndexOf('assertOAuthClientTargetedSelection(');
  const targetResolution = config.indexOf('const baseURL = resolveBaseURL()');
  const setupGuard = globalSetup.lastIndexOf('assertOAuthClientTargetedSelection(');
  const provisioning = globalSetup.lastIndexOf('withLifecycleDeadline(');

  assert.ok(configGuard >= 0 && configGuard < targetResolution, 'config guard must run before live target resolution');
  assert.ok(setupGuard >= 0 && setupGuard < provisioning, 'global setup guard must run before provisioning');

  const probe = [
    "import assert from 'node:assert/strict';",
    "import { assertOAuthClientTargetedSelection } from './tests/e2e/live/oauthClientTargetGuard.ts';",
    "assert.throws(() => assertOAuthClientTargetedSelection(['playwright', '--grep', '@live.*@oauth-client'], {}), /disposable review environment/);",
    "const base = { PLAYWRIGHT_LIVE_OAUTH_CLIENT_DISPOSABLE_REVIEW: 'true', PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ID: 'oauth-client-review-contract', PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ORG_ID: 'review-org', PLAYWRIGHT_LIVE_ALLOWED_ORG_ID: 'review-org', PLAYWRIGHT_LIVE_ORG_SLUG: 'review-org' };",
    "const review = { ...base, PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_HOSTS: 'oauth-client-review-contract.example.invalid,api.oauth-client-review-contract.example.invalid', PLAYWRIGHT_LIVE_BASE_URL: 'https://oauth-client-review-contract.example.invalid', PLAYWRIGHT_LIVE_API_BASE_URL: 'https://api.oauth-client-review-contract.example.invalid/api/v1' };",
    "if (!assertOAuthClientTargetedSelection(['playwright', '--grep', '@oauth-client'], review)) throw new Error('valid review target rejected');",
    "const staging = { ...base, PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_HOSTS: 'epoca-staging.company-5897fee414.example.invalid', PLAYWRIGHT_LIVE_BASE_URL: 'https://epoca-staging.company-5897fee414.example.invalid', PLAYWRIGHT_LIVE_API_BASE_URL: 'https://epoca-staging.company-5897fee414.example.invalid/api/v1' };",
    "try { assertOAuthClientTargetedSelection(['playwright', '--grep', '@oauth-client'], staging); throw new Error('stable staging accepted'); }",
    "catch (error) { if (!String(error.message).includes('disposable review host')) throw error; }",
  ].join('\n');
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', probe], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
});

void test('OAuth client wrapper owns the exact live config project grep and explicit targeted marker', () => {
  const wrapper = read('scripts/e2e/run-oauth-client-live.mjs');
  const packageJson = z
    .object({ packageManager: z.string(), scripts: z.record(z.string()), devDependencies: z.record(z.string()) })
    .parse(JSON.parse(read('package.json')));
  assert.match(wrapper, /PLAYWRIGHT_LIVE_OAUTH_CLIENT_TARGETED/);
  assert.match(wrapper, /playwright\.live\.config\.ts/);
  assert.match(wrapper, /live-chromium/);
  assert.match(wrapper, /@live\.\*@oauth-client\|@oauth-client\.\*@live/);
  assert.equal(packageJson.scripts['test:e2e:live:oauth-client'], 'node scripts/e2e/run-oauth-client-live.mjs');
});
