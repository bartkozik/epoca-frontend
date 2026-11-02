import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertExactSha,
  assertSafeGitLabWebUrl,
  gitLabGetAllPages,
  selectExactSuccessfulJob,
  selectExactSuccessfulPipeline,
  validateBackendEvidenceDocument,
  writeEvidenceAtomically,
} from './e2e/gate-evidence.mjs';

const BACKEND_PROJECT_ID = 'epoca/epoca';
const BACKEND_JOB = 'test_backend';
const testResultsRoot = fileURLToPath(new URL('../test-results', import.meta.url));
const defaultOutputPath = fileURLToPath(new URL('../test-results/backend-gates.json', import.meta.url));

const requireEnv = (env, name) => {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value;
};

export const verifyBackendGates = async ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  outputPath = defaultOutputPath,
} = {}) => {
  const apiBaseUrl = requireEnv(env, 'CI_API_V4_URL');
  const token = requireEnv(env, 'CI_JOB_TOKEN');
  const sha = assertExactSha(requireEnv(env, 'EPOCA_BACKEND_SHA'), 'EPOCA_BACKEND_SHA');

  const pipelines = await gitLabGetAllPages({
    fetchImpl,
    apiBaseUrl,
    token,
    pathSegments: ['projects', BACKEND_PROJECT_ID, 'pipelines'],
    search: { sha, status: 'success' },
    label: 'backend pipeline lookup',
  });
  const pipeline = selectExactSuccessfulPipeline(pipelines, sha);
  const pipelineUrl = assertSafeGitLabWebUrl(apiBaseUrl, pipeline.web_url, 'backend pipeline URL', {
    projectId: BACKEND_PROJECT_ID,
    resource: 'pipelines',
    id: pipeline.id,
  });

  const jobs = await gitLabGetAllPages({
    fetchImpl,
    apiBaseUrl,
    token,
    pathSegments: ['projects', BACKEND_PROJECT_ID, 'pipelines', pipeline.id, 'jobs'],
    search: { 'scope[]': 'success' },
    label: 'backend job lookup',
  });
  const job = selectExactSuccessfulJob(jobs, BACKEND_JOB);
  const jobUrl = assertSafeGitLabWebUrl(apiBaseUrl, job.web_url, 'backend job URL', {
    projectId: BACKEND_PROJECT_ID,
    resource: 'jobs',
    id: job.id,
  });

  const document = { schemaVersion: 1, sha, pipelineUrl, jobUrl };
  await writeEvidenceAtomically(outputPath, document, validateBackendEvidenceDocument, {
    allowedRoot: testResultsRoot,
  });
  return document;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  verifyBackendGates().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
