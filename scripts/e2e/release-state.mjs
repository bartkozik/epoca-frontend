import { lstatSync } from 'node:fs';
import path from 'node:path';

/** @param {string | undefined} value */
export function assertPrivateStateRoot(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('An absolute persistent private state root is required');
  const stat = lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error('Release state root must be a real private 0700 directory');
  return value;
}

/** @param {string} name @param {number} modifiedAt @param {number} now */
export function isExpiredReleaseRun(name, modifiedAt, now) {
  return (
    /^ct527-[a-z0-9][a-z0-9-]{5,100}-deploy$/.test(name) &&
    Number.isFinite(modifiedAt) &&
    now - modifiedAt >= 86_400_000
  );
}
