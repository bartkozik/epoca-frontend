import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import path from 'node:path';
import {
  TraversalAdapterError,
  runArtifactScan,
  sameIdentityAndMetadata,
} from './artifact-scanner-core.mjs';

const openFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

const validateChildName = (name) => {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new TraversalAdapterError('snapshot-race');
  }
};

const openPathNode = async (target) => {
  try {
    return { handle: await open(target, openFlags), path: target };
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
    await directory.close().catch((error) => {
      if (error?.code !== 'ERR_DIR_CLOSED') throw error;
    });
  }
};

const createControlledTestTraversalAdapter = () => ({
  openRoot: (source) => openPathNode(source),
  openChild(parent, name) {
    validateChildName(name);
    return openPathNode(path.join(parent.path, name));
  },
  entries: (node) => directoryEntries(node.path),
  async assertBound(node, expected) {
    const descriptorStatus = await node.handle.stat();
    const pathStatus = await lstat(node.path);
    if (pathStatus.isSymbolicLink()) throw new TraversalAdapterError('symbolic-link');
    if (!sameIdentityAndMetadata(expected, descriptorStatus) || !sameIdentityAndMetadata(descriptorStatus, pathStatus)) {
      throw new TraversalAdapterError('snapshot-race');
    }
    return descriptorStatus;
  },
  close: (node) => node.handle.close(),
});

export const scanAndPublishArtifactsForTest = (options) =>
  runArtifactScan(options, createControlledTestTraversalAdapter);
