import { constants } from 'node:fs';
import { open, opendir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ArtifactScanError,
  TraversalAdapterError,
  runArtifactScan,
  sameIdentityAndMetadata,
} from './artifact-scanner-core.mjs';

export { ArtifactScanError };

const openFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

const validateChildName = (name) => {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new TraversalAdapterError('snapshot-race');
  }
};

const closeDirectory = async (directory) => {
  await directory.close().catch((error) => {
    if (error?.code !== 'ERR_DIR_CLOSED') throw error;
  });
};

const openDescriptorNode = async (target) => {
  try {
    return { handle: await open(target, openFlags) };
  } catch (error) {
    if (error?.code === 'ELOOP') throw new TraversalAdapterError('symbolic-link');
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') throw new TraversalAdapterError('snapshot-race');
    throw error;
  }
};

const directoryEntries = async function* (target) {
  const directory = await opendir(target);
  try {
    let entry;
    while ((entry = await directory.read()) !== null) yield entry.name;
  } finally {
    await closeDirectory(directory);
  }
};

export const createLinuxDescriptorTraversalAdapter = () => {
  if (process.platform !== 'linux') {
    throw new Error('Secure artifact traversal requires Linux /proc/self/fd support');
  }
  const descriptorPath = (node) => `/proc/self/fd/${node.handle.fd}`;
  return {
    descriptorPath,
    async openRoot(source) {
      let current = await openDescriptorNode('/');
      try {
        for (const component of path.resolve(source).split(path.sep).filter(Boolean)) {
          validateChildName(component);
          const child = await openDescriptorNode(path.posix.join(descriptorPath(current), component));
          try {
            await current.handle.close();
          } catch (error) {
            await child.handle.close();
            throw error;
          }
          current = child;
        }
        return current;
      } catch (error) {
        await current.handle.close();
        throw error;
      }
    },
    openChild(parent, name) {
      validateChildName(name);
      return openDescriptorNode(path.posix.join(descriptorPath(parent), name));
    },
    entries: (node) => directoryEntries(descriptorPath(node)),
    async assertBound(node, expected) {
      const descriptorStatus = await node.handle.stat();
      const procStatus = await stat(descriptorPath(node));
      if (!sameIdentityAndMetadata(expected, descriptorStatus) || !sameIdentityAndMetadata(descriptorStatus, procStatus)) {
        throw new TraversalAdapterError('snapshot-race');
      }
      return descriptorStatus;
    },
    close: (node) => node.handle.close(),
  };
};

export const scanAndPublishArtifacts = (options) => runArtifactScan(options, createLinuxDescriptorTraversalAdapter);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const [safeDirectory, quarantineDirectory, ...argumentsAfterDirectories] = process.argv.slice(2);
  const publishFiles = argumentsAfterDirectories
    .filter((argument) => argument.startsWith('--publish='))
    .map((argument) => argument.slice('--publish='.length));
  const sources = argumentsAfterDirectories.filter((argument) => !argument.startsWith('--publish='));
  try {
    if (!safeDirectory || !quarantineDirectory || sources.length === 0) {
      throw new Error('Usage: artifact-scanner.mjs <safe-directory> <quarantine-directory> <source> [source...]');
    }
    const result = await scanAndPublishArtifacts({
      sources,
      safeDirectory,
      quarantineDirectory,
      ...(publishFiles.length === 0 ? {} : { publishFiles }),
    });
    console.log(`Artifact scan passed: ${result.filesScanned} files, 0 findings`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Artifact scan failed');
    process.exitCode = 1;
  }
}
