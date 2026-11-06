import { parsePlaywrightInventory } from './coverage-inventory.mjs';

const PRIMARY_TAGS = new Set(['mr', 'full', 'live', 'local-proxy']);
const ALLOWED_TAGS = new Set([
  ...PRIMARY_TAGS,
  'visual',
  'technical',
  'oauth-client',
  'multi-search-sections',
  'multi-search-transfer',
  'multi-search-keyboard',
  'multi-search-mobile',
]);
/** @type {Record<string, {projects: Set<string>, primaryTags: Set<string>}>} */
const TIER_POLICIES = Object.freeze({
  mr: { projects: new Set(['mock-chromium']), primaryTags: new Set(['mr']) },
  full: {
    projects: new Set(['mock-chromium', 'mock-firefox', 'mock-webkit']),
    primaryTags: new Set(['mr', 'full']),
  },
  live: { projects: new Set(['live-chromium', 'invitation-live-chromium']), primaryTags: new Set(['live']) },
  'local-proxy': {
    projects: new Set(['local-proxy-chromium']),
    primaryTags: new Set(['local-proxy']),
  },
});

/** @param {string} tier @param {import("./coverage-validator.mjs").InventoryItem[]} inventory */
export const validateTierInventory = (tier, inventory) => {
  const policy = TIER_POLICIES[tier];
  if (policy === undefined) throw new Error(`Unknown E2E tier: ${tier}`);
  if (!Array.isArray(inventory) || inventory.length === 0) throw new Error(`${tier} inventory contains zero tests`);

  for (const entry of inventory) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${tier} inventory entry must be an object`);
    }
    if (!policy.projects.has(entry.projectName)) {
      throw new Error(`${tier} inventory has disallowed project: ${String(entry.projectName)}`);
    }
    if (!Array.isArray(entry.tags)) throw new Error(`${tier} inventory tags must be an array`);
    for (const tag of entry.tags) {
      if (!ALLOWED_TAGS.has(tag)) throw new Error(`${tier} inventory has unknown tag: ${String(tag)}`);
    }
    const primaryTags = entry.tags.filter((tag) => PRIMARY_TAGS.has(tag));
    if (primaryTags.length !== 1) {
      throw new Error(`${tier} inventory requires exactly one primary tag for ${entry.spec} :: ${entry.title}`);
    }
    if (!policy.primaryTags.has(primaryTags[0])) {
      throw new Error(`${tier} inventory has disallowed primary tag: ${primaryTags[0]}`);
    }
  }

  return {
    tier,
    count: inventory.length,
    projects: [...new Set(inventory.map(({ projectName }) => projectName))].sort(),
  };
};

/** @param {string} tier @param {import("node:child_process").SpawnSyncReturns<string>} result @param {{repositoryRoot?: string, timeoutMs?: number}} [options] */
export const validateTierRun = (tier, result, { repositoryRoot = process.cwd(), timeoutMs } = {}) => {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${tier} Playwright runner result must be an object`);
  }
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${tier} Playwright runner timed out after ${String(timeoutMs)} ms`);
  }
  if (result.error)
    throw new Error(`${tier} Playwright runner failed: ${result.error.message ?? String(result.error)}`);
  if (result.signal) throw new Error(`${tier} Playwright runner exited on ${result.signal}`);
  if (result.status !== 0) throw new Error(`${tier} Playwright runner exited with status ${String(result.status)}`);
  if (typeof result.stderr !== 'string' || result.stderr.trim() !== '') {
    throw new Error(`${tier} Playwright runner wrote to stderr: ${String(result.stderr)}`);
  }
  if (typeof result.stdout !== 'string') throw new Error(`${tier} Playwright runner stdout must be a string`);
  return validateTierInventory(tier, parsePlaywrightInventory(result.stdout, { repositoryRoot }));
};
