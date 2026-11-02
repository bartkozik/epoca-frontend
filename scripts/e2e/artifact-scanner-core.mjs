import { constants } from 'node:fs';
import { access, cp, mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * @typedef {{ maxFiles: number, maxEntries: number, maxDepth: number, maxPathBytes: number, maxFileBytes: number, maxTotalBytes: number }} ScanLimits
 */

/** @type {ScanLimits} */
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 10_000,
  maxEntries: 20_000,
  maxDepth: 64,
  maxPathBytes: 4_096,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
});
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_ENCODED_CANDIDATES = 10_000;
const MAX_DECODED_CANDIDATE_BYTES = 64 * 1024;
const MAX_TOTAL_DECODED_BYTES = 8 * 1024 * 1024;

const credentialEnvironmentKey = /(authorization|client_secret|credential|password|secret|token)$/i;

/**
 * @typedef {{ category: string, pattern: RegExp }} KnownPattern
 */

/** @type {readonly KnownPattern[]} */
const knownPatterns = Object.freeze([
  { category: 'credential-prefix', pattern: /epc_secret_v1_[A-Za-z0-9._~-]+/i },
  { category: 'credential-prefix', pattern: /\bBasic\s+[A-Za-z0-9+/]{2,}={0,2}(?=$|[^A-Za-z0-9+/=])/i },
  { category: 'credential-prefix', pattern: /\bBearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i },
  {
    category: 'credential-field',
    pattern:
      /(?:^|[^A-Za-z0-9])["']?(?:client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|password|authorization)["']?\s*[:=]/im,
  },
  { category: 'credential-prefix', pattern: /OAUTH_CLIENT[-_](?:SECRET|CREDENTIAL)[-_]SENTINEL/i },
  // Retain the legacy signature to quarantine artifacts produced before the naming migration.
  { category: 'credential-prefix', pattern: /CT[-_]?521[-_](?:SECRET|CREDENTIAL)[-_]SENTINEL/i },
]);

/**
 * @param {string} text
 * @returns {boolean}
 */
const containsKnownCredential = (text) =>
  knownPatterns.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

/**
 * @param {string} text
 * @returns {'scan-bound' | 'credential-prefix' | undefined}
 */
const inspectBase64KnownCredential = (text) => {
  let candidates = 0;
  let decodedBytes = 0;
  for (const match of text.matchAll(/[A-Za-z0-9+/_-]{16,87380}={0,2}/g)) {
    candidates += 1;
    if (candidates > MAX_ENCODED_CANDIDATES) return 'scan-bound';
    const normalized = match[0].replace(/-/g, '+').replace(/_/g, '/');
    if (normalized.length % 4 === 1) continue;
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const padding = padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0;
    const decodedLength = Math.floor((padded.length * 3) / 4) - padding;
    if (
      decodedLength > MAX_DECODED_CANDIDATE_BYTES ||
      decodedLength > MAX_TOTAL_DECODED_BYTES - decodedBytes
    ) {
      return 'scan-bound';
    }
    decodedBytes += decodedLength;
    const decoded = Buffer.from(padded, 'base64');
    if (decoded.length > 0 && containsKnownCredential(decoded.toString('utf8'))) return 'credential-prefix';
  }
  return undefined;
};

/**
 * @typedef {{ category: string, location: string }} Finding
 */

export class ArtifactScanError extends Error {
  /** @param {Finding[]} findings */
  constructor(findings) {
    const categories = [...new Set(findings.map(({ category }) => category))].sort();
    const locations = [...new Set(findings.map(({ location }) => location))].sort();
    super(`Artifact scan failed (${categories.join(', ')}) in ${locations.join(', ')}`);
    this.name = 'ArtifactScanError';
    /** @type {string[]} */
    this.categories = categories;
    /** @type {string[]} */
    this.locations = locations;
  }
}

export class TraversalAdapterError extends Error {
  /** @param {string} category */
  constructor(category) {
    super(category);
    /** @type {string} */
    this.category = category;
  }
}

/**
 * @param {import('node:fs').Stats} before
 * @param {import('node:fs').Stats} after
 * @returns {boolean}
 */
export const sameIdentityAndMetadata = (before, after) =>
  before.dev === after.dev &&
  before.ino === after.ino &&
  before.uid === after.uid &&
  before.gid === after.gid &&
  before.mode === after.mode &&
  before.size === after.size &&
  before.mtimeMs === after.mtimeMs &&
  before.ctimeMs === after.ctimeMs;

/**
 * @param {number} sourceIndex
 * @param {string} relativePath
 * @returns {string}
 */
const safeLocation = (sourceIndex, relativePath) =>
  `source-${sourceIndex + 1}:entry-${createHash('sha256').update(relativePath).digest('hex').slice(0, 12)}`;

/**
 * @param {string} target
 * @returns {Promise<boolean>}
 */
const exists = async (target) => {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return false;
    throw error;
  }
};

/**
 * @param {string} target
 * @returns {Promise<string>}
 */
const canonicalizePath = async (target) => {
  let cursor = path.resolve(target);
  /** @type {string[]} */
  const missing = [];
  for (;;) {
    try {
      return path.join(await realpath(cursor), ...missing);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error)?.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
};

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
const pathsOverlap = (left, right) => {
  const relative = path.relative(left, right);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

/**
 * @param {{ sources: string[], safeDirectory: string, quarantineDirectory: string }} options
 * @returns {Promise<void>}
 */
const validatePathRoles = async ({ sources, safeDirectory, quarantineDirectory }) => {
  if (sources.some((source) => source === '' || ['.', '..'].includes(path.basename(source)))) {
    throw new ArtifactScanError([{ category: 'path-contract', location: 'configuration:entry-000000000000' }]);
  }
  /** @type {string[]} */
  let canonical;
  try {
    canonical = await Promise.all([...sources, safeDirectory, quarantineDirectory].map(canonicalizePath));
  } catch {
    throw new ArtifactScanError([{ category: 'path-contract', location: 'configuration:entry-000000000000' }]);
  }
  for (let left = 0; left < canonical.length; left += 1) {
    for (let right = left + 1; right < canonical.length; right += 1) {
      if (pathsOverlap(canonical[left], canonical[right]) || pathsOverlap(canonical[right], canonical[left])) {
        throw new ArtifactScanError([{ category: 'path-contract', location: 'configuration:entry-000000000000' }]);
      }
    }
  }
};

/**
 * @param {string} secret
 * @returns {Array<[string, string]>}
 */
const representations = (secret) => {
  const percentEncoded = encodeURIComponent(secret);
  /** @type {Array<[string, string]>} */
  const values = [
    ['raw', secret],
    ['url-encoded', percentEncoded],
    ['lowercase-percent', percentEncoded.replace(/%[0-9A-F]{2}/g, (value) => value.toLowerCase())],
    ['form-url-encoded', new URLSearchParams({ value: secret }).toString().slice('value='.length)],
    ['base64', Buffer.from(secret).toString('base64')],
    ['base64url', Buffer.from(secret).toString('base64url')],
    ['json-escaped', JSON.stringify(secret).slice(1, -1)],
  ];
  /** @type {Set<string>} */
  const seen = new Set();
  return values.filter(([, value]) => value.length > 0 && !seen.has(value) && seen.add(value));
};

/**
 * @param {NodeJS.ProcessEnv} environment
 * @returns {string[]}
 */
const environmentSecrets = (environment) =>
  Object.entries(environment)
    .filter(([key, value]) => credentialEnvironmentKey.test(key) && typeof value === 'string' && value.length >= 8)
    .map(([, value]) => /** @type {string} */ (value));

/**
 * @param {string[]} sources
 * @param {string} quarantineDirectory
 * @returns {Promise<void>}
 */
const quarantineSources = async (sources, quarantineDirectory) => {
  await rm(quarantineDirectory, { recursive: true, force: true });
  await mkdir(quarantineDirectory, { recursive: true, mode: 0o700 });
  for (const [sourceIndex, source] of sources.entries()) {
    const destination = path.join(quarantineDirectory, `source-${sourceIndex + 1}`);
    try {
      await rename(source, destination);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error)?.code !== 'EXDEV') throw error;
      await cp(source, destination, { recursive: true, errorOnExist: true, force: false, dereference: false });
      await rm(source, { recursive: true, force: true });
    }
  }
};

/**
 * @typedef {{ category: string, bytes: Buffer }} Needle
 */

/**
 * @param {Buffer} bytes
 * @param {Needle[]} needles
 * @param {string} location
 * @param {Finding[]} findings
 * @returns {void}
 */
const scanBytes = (bytes, needles, location, findings) => {
  const text = bytes.toString('utf8');
  for (const needle of needles) {
    if (bytes.includes(needle.bytes)) findings.push({ category: needle.category, location });
  }
  for (const { category, pattern } of knownPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push({ category, location });
  }
  const encodedFinding = inspectBase64KnownCredential(text);
  if (encodedFinding) findings.push({ category: encodedFinding, location });
};

/**
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
const adapterCategory = (error, fallback = 'snapshot-failure') =>
  error instanceof TraversalAdapterError ? error.category : fallback;

/**
 * A traversal node, as produced by a {@link TraversalAdapter}. Adapters may attach extra
 * fields (e.g. a resolved path) for their own bookkeeping; this core module only ever reads
 * `.handle`.
 * @typedef {{ handle: import('node:fs/promises').FileHandle }} TraversalNode
 *
 * @typedef {{ sourceIndex: number, relativePath: string }} TraversalHookInfo
 *
 * @typedef {object} TraversalHooks
 * @property {(info: TraversalHookInfo) => Promise<void> | void} [onBeforeDirectoryRead]
 * @property {(info: TraversalHookInfo) => Promise<void> | void} [onFileOpened]
 *
 * @typedef {object} TraversalAdapter
 * @property {(source: string) => Promise<TraversalNode>} openRoot
 * @property {(parent: TraversalNode, name: string) => Promise<TraversalNode> | TraversalNode} openChild
 * @property {(node: TraversalNode) => AsyncIterable<string>} entries
 * @property {(node: TraversalNode, expected: import('node:fs').Stats) => Promise<import('node:fs').Stats>} assertBound
 * @property {(node: TraversalNode) => Promise<void>} close
 *
 * @typedef {object} SnapshotEntry
 * @property {string} sourceBasename
 * @property {string} snapshotDirectory
 *
 * @typedef {object} SnapshotResult
 * @property {SnapshotEntry[]} snapshots
 * @property {Map<string, string>} filesByPublishedPath
 * @property {number} filesScanned
 */

/**
 * @param {{
 *   sources: string[],
 *   snapshotRoot: string,
 *   limits: ScanLimits,
 *   needles: Needle[],
 *   findings: Finding[],
 *   traversalHooks: TraversalHooks | undefined,
 *   adapter: TraversalAdapter,
 * }} options
 * @returns {Promise<SnapshotResult>}
 */
const snapshotSources = async ({
  sources,
  snapshotRoot,
  limits,
  needles,
  findings,
  traversalHooks,
  adapter,
}) => {
  /** @type {SnapshotEntry[]} */
  const snapshots = [];
  /** @type {Map<string, string>} */
  const filesByPublishedPath = new Map();
  const counters = { entries: 0, files: 0, bytes: 0 };
  /** @type {Set<string>} */
  const basenames = new Set();

  for (const [sourceIndex, source] of sources.entries()) {
    const sourceBasename = path.basename(source);
    const rootLocation = safeLocation(sourceIndex, '.');
    if (Buffer.byteLength(path.resolve(source), 'utf8') > limits.maxPathBytes) {
      findings.push({ category: 'scan-bound', location: rootLocation });
      continue;
    }
    for (const component of path.resolve(source).split(path.sep).filter(Boolean)) {
      scanBytes(Buffer.from(component), needles, rootLocation, findings);
    }
    if (basenames.has(sourceBasename)) findings.push({ category: 'duplicate-source', location: rootLocation });
    basenames.add(sourceBasename);
    /** @type {TraversalNode} */
    let rootNode;
    try {
      rootNode = await adapter.openRoot(source);
    } catch (error) {
      findings.push({ category: adapterCategory(error), location: rootLocation });
      continue;
    }
    /** @type {import('node:fs').Stats} */
    let rootStatus;
    const snapshotDirectory = path.join(snapshotRoot, `source-${sourceIndex + 1}`);
    try {
      rootStatus = await rootNode.handle.stat();
      await mkdir(snapshotDirectory, { recursive: true, mode: 0o700 });
    } catch (error) {
      await adapter.close(rootNode);
      throw error;
    }
    snapshots.push({ sourceBasename, snapshotDirectory });

    /**
     * @param {TraversalNode} node
     * @param {string} relative
     * @returns {Promise<void>}
     */
    const visit = async (node, relative) => {
      const location = safeLocation(sourceIndex, relative);
      try {
        const components = relative === '.' ? [] : relative.split(path.sep);
        counters.entries += 1;
        if (
          counters.entries > limits.maxEntries ||
          components.length > limits.maxDepth ||
          Buffer.byteLength(relative === '.' ? '' : relative, 'utf8') > limits.maxPathBytes
        ) {
          findings.push({ category: 'scan-bound', location });
          return;
        }
        for (const component of components) scanBytes(Buffer.from(component), needles, location, findings);
        const status = await node.handle.stat();
        await adapter.assertBound(node, status);
        if (status.uid !== rootStatus.uid || status.gid !== rootStatus.gid) {
          findings.push({ category: 'ownership-mismatch', location });
          return;
        }
        const destination = relative === '.' ? snapshotDirectory : path.join(snapshotDirectory, relative);
        if (status.isDirectory()) {
          await traversalHooks?.onBeforeDirectoryRead?.({ sourceIndex, relativePath: relative });
          await adapter.assertBound(node, status);
          await mkdir(destination, { recursive: true, mode: 0o700 });
          /** @type {string[]} */
          const entries = [];
          for await (const entry of adapter.entries(node)) {
            if (entries.length >= limits.maxEntries - counters.entries) {
              findings.push({ category: 'scan-bound', location });
              return;
            }
            entries.push(entry);
          }
          entries.sort();
          await adapter.assertBound(node, status);
          for (const entry of entries) {
            await adapter.assertBound(node, status);
            /** @type {TraversalNode} */
            let child;
            try {
              child = await adapter.openChild(node, entry);
            } catch (error) {
              findings.push({ category: adapterCategory(error), location: safeLocation(sourceIndex, entry) });
              continue;
            }
            await visit(child, relative === '.' ? entry : path.join(relative, entry));
            await adapter.assertBound(node, status);
          }
          await adapter.assertBound(node, status);
          return;
        }
        if (!status.isFile()) {
          findings.push({ category: 'unsupported-file', location });
          return;
        }
        counters.files += 1;
        if (
          counters.files > limits.maxFiles ||
          status.size > limits.maxFileBytes ||
          status.size > limits.maxTotalBytes - counters.bytes
        ) {
          findings.push({ category: 'scan-bound', location });
          return;
        }
        await traversalHooks?.onFileOpened?.({ sourceIndex, relativePath: relative });
        const preReadStatus = await node.handle.stat();
        if (
          preReadStatus.size > limits.maxFileBytes ||
          preReadStatus.size > limits.maxTotalBytes - counters.bytes
        ) {
          findings.push({ category: 'scan-bound', location });
          return;
        }
        await adapter.assertBound(node, preReadStatus);
        if (!sameIdentityAndMetadata(status, preReadStatus)) {
          findings.push({ category: 'snapshot-race', location });
          return;
        }
        const bytes = Buffer.allocUnsafe(preReadStatus.size);
        let offset = 0;
        while (offset < preReadStatus.size) {
          const length = Math.min(READ_CHUNK_BYTES, preReadStatus.size - offset);
          const { bytesRead } = await node.handle.read(bytes, offset, length, offset);
          if (bytesRead === 0) break;
          offset += bytesRead;
        }
        const finalStatus = await node.handle.stat();
        await adapter.assertBound(node, finalStatus);
        if (offset !== preReadStatus.size || !sameIdentityAndMetadata(preReadStatus, finalStatus)) {
          findings.push({ category: 'snapshot-race', location });
          return;
        }
        counters.bytes += bytes.length;
        scanBytes(bytes, needles, location, findings);
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
        filesByPublishedPath.set(`${sourceBasename}/${relative.split(path.sep).join('/')}`, destination);
      } catch (error) {
        if (error instanceof TraversalAdapterError) {
          findings.push({ category: error.category, location });
          return;
        }
        throw error;
      } finally {
        await adapter.close(node);
      }
    };
    await visit(rootNode, '.');
  }
  return { snapshots, filesByPublishedPath, filesScanned: counters.files };
};

/**
 * @typedef {object} RunArtifactScanOptions
 * @property {string[]} sources
 * @property {string} safeDirectory
 * @property {string} quarantineDirectory
 * @property {string[]} [secrets]
 * @property {Partial<ScanLimits>} [limits]
 * @property {string[]} [publishFiles]
 * @property {() => Promise<void> | void} [onSnapshotReady]
 * @property {TraversalHooks} [traversalHooks]
 */

/**
 * @param {RunArtifactScanOptions} options
 * @param {() => TraversalAdapter} createAdapter
 * @returns {Promise<{ filesScanned: number, findings: number }>}
 */
export const runArtifactScan = async (
  {
    sources,
    safeDirectory,
    quarantineDirectory,
    secrets = environmentSecrets(process.env),
    limits = DEFAULT_LIMITS,
    publishFiles,
    onSnapshotReady,
    traversalHooks,
  },
  createAdapter
) => {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('At least one artifact source is required');
  if (!safeDirectory || !quarantineDirectory) throw new Error('Safe and quarantine directories are required');
  await validatePathRoles({ sources, safeDirectory, quarantineDirectory });
  /** @type {ScanLimits} */
  const normalizedLimits = { ...DEFAULT_LIMITS, ...limits };
  for (const [name, value] of /** @type {Array<[string, unknown]>} */ (Object.entries(normalizedLimits))) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Artifact scan limit ${name} must be positive`);
    }
  }
  const uniqueSecrets = [...new Set(secrets.filter((value) => typeof value === 'string' && value.length >= 1))];
  const needles = uniqueSecrets.flatMap(representations).map(([category, value]) => ({
    category,
    bytes: Buffer.from(value),
  }));
  await rm(safeDirectory, { recursive: true, force: true });
  const adapter = createAdapter();
  await mkdir(path.dirname(path.resolve(safeDirectory)), { recursive: true, mode: 0o700 });
  const temporaryRoot = await mkdtemp(path.join(path.dirname(path.resolve(safeDirectory)), '.artifact-scan-'));
  const snapshotRoot = path.join(temporaryRoot, 'snapshot');
  const safeBuild = path.join(temporaryRoot, 'safe');
  /** @type {Finding[]} */
  const findings = [];
  try {
    await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
    const inventory = await snapshotSources({
      sources,
      snapshotRoot,
      limits: normalizedLimits,
      needles,
      findings,
      traversalHooks,
      adapter,
    });
    await onSnapshotReady?.();
    if (findings.length > 0) throw new ArtifactScanError(findings);

    await mkdir(safeBuild, { recursive: true, mode: 0o700 });
    if (publishFiles !== undefined) {
      if (!Array.isArray(publishFiles) || publishFiles.length === 0) {
        throw new ArtifactScanError([{ category: 'publish-contract', location: 'publication:entry-000000000000' }]);
      }
      for (const [publishIndex, publishedPath] of [...new Set(publishFiles)].entries()) {
        const publishLocation = `publication:entry-${String(publishIndex + 1).padStart(12, '0')}`;
        if (
          typeof publishedPath !== 'string' ||
          !publishedPath ||
          publishedPath.includes('\\') ||
          path.posix.normalize(publishedPath) !== publishedPath ||
          publishedPath.startsWith('../') ||
          path.posix.isAbsolute(publishedPath)
        ) {
          throw new ArtifactScanError([{ category: 'publish-contract', location: publishLocation }]);
        }
        const snapshotFile = inventory.filesByPublishedPath.get(publishedPath);
        if (!snapshotFile) {
          throw new ArtifactScanError([{ category: 'publish-contract', location: publishLocation }]);
        }
        const destination = path.join(safeBuild, publishedPath);
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await cp(snapshotFile, destination, { errorOnExist: true, force: false, dereference: false });
      }
    } else {
      for (const snapshot of inventory.snapshots) {
        await cp(snapshot.snapshotDirectory, path.join(safeBuild, snapshot.sourceBasename), {
          recursive: true,
          errorOnExist: true,
          force: false,
          dereference: false,
        });
      }
    }
    await rename(safeBuild, safeDirectory);
    return { filesScanned: inventory.filesScanned, findings: 0 };
  } catch (error) {
    await rm(safeDirectory, { recursive: true, force: true });
    /** @type {string[]} */
    const existingSources = [];
    for (const source of sources) if (await exists(source)) existingSources.push(source);
    try {
      if (existingSources.length > 0) await quarantineSources(existingSources, quarantineDirectory);
    } catch {
      throw new ArtifactScanError([{ category: 'quarantine-failure', location: 'pipeline:entry-000000000000' }]);
    }
    if (error instanceof ArtifactScanError) throw error;
    throw new ArtifactScanError([{ category: 'snapshot-failure', location: 'pipeline:entry-000000000000' }]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};
