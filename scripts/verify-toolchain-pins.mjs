import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** @param {string} path */
const read = (path) => readFileSync(path, 'utf8');
const packageJson = z
  .object({ packageManager: z.string(), scripts: z.record(z.string()), devDependencies: z.record(z.string()) })
  .parse(JSON.parse(read('package.json')));
const nvmrc = read('.nvmrc').trim();
const yarnrc = read('.yarnrc.yml');
const dockerfile = read('Dockerfile');
const gitlabCi = read('.gitlab-ci.yml');

assert.equal(nvmrc, 'v22.23.2');
assert.equal(packageJson.packageManager, 'yarn@4.18.0');
assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
assert.equal(packageJson.scripts['verify:toolchain'], 'node scripts/verify-toolchain-pins.mjs');
assert.match(yarnrc, /^yarnPath: \.yarn\/releases\/yarn-4\.18\.0\.cjs$/m);
assert.match(dockerfile, /^FROM node:22\.23\.2 AS builder$/m);
assert.match(dockerfile, /node \.yarn\/releases\/yarn-4\.18\.0\.cjs install --immutable/);
assert.match(dockerfile, /^RUN node \.yarn\/releases\/yarn-4\.18\.0\.cjs build$/m);
assert.match(gitlabCi, /image: node:22\.23\.2/);
assert.match(gitlabCi, /node \.yarn\/releases\/yarn-4\.18\.0\.cjs install --immutable/);
assert.match(
  gitlabCi,
  /^lint:\n {2}extends: \.node_yarn_job\n {2}stage: lint\n {2}script:\n {4}- node \.yarn\/releases\/yarn-4\.18\.0\.cjs lint$/m,
);
assert.match(
  gitlabCi,
  /^test:\n {2}extends: \.node_yarn_job\n {2}stage: test\n {2}script:\n {4}- node --test scripts\/staging-frontend-deploy-ci\.test\.mjs(?: scripts\/[\w./-]+\.test\.mjs)*\n {4}- CI=true node \.yarn\/releases\/yarn-4\.18\.0\.cjs test$/m,
);
assert.match(
  gitlabCi,
  /^typecheck:\n {2}extends: \.node_yarn_job\n {2}stage: test\n {2}script:\n {4}- node \.yarn\/releases\/yarn-4\.18\.0\.cjs typecheck$/m,
);
assert.match(
  gitlabCi,
  /^build_frontend:\n {2}extends: \.node_yarn_job\n {2}stage: build\n {2}script:\n {4}- CI=false node \.yarn\/releases\/yarn-4\.18\.0\.cjs build$/m,
);
assert.doesNotMatch(`${dockerfile}\n${gitlabCi}\n${yarnrc}`, /yarn-4\.5\.1/);

const bareYarnCommands = gitlabCi.split('\n').filter((line) => /^\s*-\s+yarn(?:\s|$)/.test(line));
assert.deepEqual(bareYarnCommands, []);

console.log('CT-531 toolchain pins are consistent.');
