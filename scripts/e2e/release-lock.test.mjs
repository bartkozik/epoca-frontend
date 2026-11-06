import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { withReleaseLock } from './release-lock.mjs';

void test(
  'janitor kernel lock prevents overlap and releases after worker SIGKILL without unlinking',
  { timeout: 15_000 },
  async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ct527-lock-'));
    const lock = path.join(directory, 'run.lock');
    const moduleURL = new URL('./release-lock.mjs', import.meta.url).href;
    const source = `import { withReleaseLock } from ${JSON.stringify(moduleURL)}; await withReleaseLock(process.argv[1], async () => { process.stdout.write('entered\\n'); await new Promise(() => { setInterval(() => {}, 1000); }); });`;
    const worker = spawn(process.execPath, ['--input-type=module', '-e', source, lock], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    try {
      assert.ok(worker.stdout);
      await once(worker.stdout, 'data');
      let invocations = 0;
      const cleanup = () => {
        invocations += 1;
        return Promise.resolve();
      };
      assert.equal(await withReleaseLock(lock, cleanup), false);
      assert.equal(invocations, 0, 'a second janitor must not enter active cleanup');
      const stopped = once(worker, 'exit');
      worker.kill('SIGKILL');
      await stopped;
      assert.equal(existsSync(lock), true, 'lock inode remains after interruption');
      let acquired = false;
      for (let attempt = 0; attempt < 30 && !acquired; attempt += 1) {
        acquired = await withReleaseLock(lock, cleanup);
        if (!acquired) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(acquired, true, 'a killed worker cannot leave a permanent janitor lock');
      assert.equal(invocations, 1);
      assert.equal(await withReleaseLock(lock, cleanup), true);
      assert.equal(invocations, 2, 'normal completion also releases the same persistent lock inode');
    } finally {
      worker.kill('SIGKILL');
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
