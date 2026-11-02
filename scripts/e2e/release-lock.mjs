import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('./release-lock.py', import.meta.url));

/** @param {string} lockPath @param {() => Promise<void>} cleanup @returns {Promise<boolean>} */
export async function withReleaseLock(lockPath, cleanup) {
  const holder = spawn('python3', [helper, lockPath], { stdio: ['pipe', 'pipe', 'ignore'] });
  let acquired = false;
  let releasing = false;
  let output = '';
  /** @type {(value: number | null) => void} */
  let resolveExit = () => {};
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const ready = new Promise((resolve, reject) => {
    holder.once('error', () => reject(new Error('Janitor kernel-lock helper is unavailable')));
    holder.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output === 'locked\n') {
        acquired = true;
        resolve(true);
      }
    });
    holder.once('exit', (code) => {
      resolveExit(code);
      if (acquired && !releasing) {
        // Never let a cleanup worker continue remote mutations after losing its lock.
        process.kill(process.pid, 'SIGKILL');
      }
      if (!acquired) {
        if (code === 75) resolve(false);
        else reject(new Error('Janitor kernel lock could not be acquired'));
      }
    });
  });
  try {
    if (!(await ready)) return false;
    await cleanup();
    return true;
  } finally {
    releasing = true;
    holder.stdin.end();
    if (holder.pid !== undefined) await exited;
  }
}
