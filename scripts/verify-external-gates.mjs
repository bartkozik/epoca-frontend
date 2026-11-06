import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertExactSha,
  assertSafeGitLabWebUrl,
  gitLabGet,
  gitLabGetAllPages,
  readGitLabArtifact,
  selectExactSuccessfulJob,
  selectExactSuccessfulPipeline,
  selectExternalGates,
  validateExternalEvidenceDocument,
  writeEvidenceAtomically,
} from './e2e/gate-evidence.mjs';
import { loadCoverageMap } from './e2e/load-coverage-map.mjs';

const testResultsRoot = fileURLToPath(new URL('../test-results', import.meta.url));
const defaultOutputPath = fileURLToPath(new URL('../test-results/external-gates.json', import.meta.url));

/** @param {NodeJS.ProcessEnv} env @param {string} name */
const requireEnv = (env, name) => {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value;
};

export const loadConfiguredExternalGates = () => selectExternalGates(loadCoverageMap().coverageMap);

/** @param {{gate: {evidence: import("./e2e/coverage-validator.mjs").GitlabGateEvidence}, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch}} options */
const verifyGitLabGate = async ({ gate, env, fetchImpl }) => {
  const apiBaseUrl = requireEnv(env, 'CI_API_V4_URL');
  const token = requireEnv(env, 'CI_JOB_TOKEN');
  const { projectId, shaEnv, job: jobName, artifact } = gate.evidence;
  const sha = assertExactSha(requireEnv(env, shaEnv), shaEnv);
  const pipelines = await gitLabGetAllPages({
    fetchImpl,
    apiBaseUrl,
    token,
    pathSegments: ['projects', projectId, 'pipelines'],
    search: { sha, status: 'success' },
    label: `${projectId} pipeline lookup`,
  });
  const pipeline = selectExactSuccessfulPipeline(pipelines, sha);
  const pipelineUrl = assertSafeGitLabWebUrl(apiBaseUrl, pipeline.web_url, `${projectId} pipeline URL`, {
    projectId,
    resource: 'pipelines',
    id: pipeline.id,
  });

  const jobs = await gitLabGetAllPages({
    fetchImpl,
    apiBaseUrl,
    token,
    pathSegments: ['projects', projectId, 'pipelines', pipeline.id, 'jobs'],
    search: { 'scope[]': 'success' },
    label: `${projectId} job lookup`,
  });
  const job = selectExactSuccessfulJob(jobs, jobName);
  const jobUrl = assertSafeGitLabWebUrl(apiBaseUrl, job.web_url, `${projectId} job URL`, {
    projectId,
    resource: 'jobs',
    id: job.id,
  });

  const artifactResponse = await gitLabGet({
    fetchImpl,
    apiBaseUrl,
    token,
    pathSegments: ['projects', projectId, 'jobs', job.id, 'artifacts', artifact],
  });
  const artifactBytes = await readGitLabArtifact(artifactResponse, artifact);
  return {
    provider: 'gitlab',
    projectId,
    sha,
    pipelineUrl,
    jobUrl,
    artifactName: artifact,
    artifactSha256: createHash('sha256').update(artifactBytes).digest('hex'),
  };
};

/** @param {ReturnType<typeof loadConfiguredExternalGates>} gates @param {NodeJS.ProcessEnv} env */
const preflightExternalGateEnvironment = (gates, env) => {
  for (const gate of gates) {
    assertExactSha(requireEnv(env, gate.evidence.shaEnv), gate.evidence.shaEnv);
    if (gate.evidence.provider !== 'gitlab') {
      throw new Error(`Unsupported external evidence provider: ${String(gate.evidence.provider)}`);
    }
    requireEnv(env, 'CI_API_V4_URL');
    requireEnv(env, 'CI_JOB_TOKEN');
  }
};

export const verifyExternalGates = async ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  outputPath = defaultOutputPath,
  allowedRoot = testResultsRoot,
} = {}) => {
  const gates = loadConfiguredExternalGates();
  preflightExternalGateEnvironment(gates, env);
  const evidence = [];

  for (const gate of gates) {
    evidence.push(await verifyGitLabGate({ gate, env, fetchImpl }));
  }

  const document = { schemaVersion: 1, gates: evidence };
  await writeEvidenceAtomically(outputPath, document, validateExternalEvidenceDocument, {
    allowedRoot,
  });
  return document;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  verifyExternalGates().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
