import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('env', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // `Object.assign` alone only overwrites keys present in `originalEnv` — it never deletes keys
    // a test added afterward (e.g. `VITE_API_BASE_URL` below), so those would otherwise leak into
    // later tests in this file. Delete anything not in the original snapshot first, then restore
    // the original values, to reproduce exactly the shape `import.meta.env` had before any test ran.
    for (const key of Object.keys(import.meta.env)) {
      if (!(key in originalEnv)) delete (import.meta.env as Record<string, unknown>)[key];
    }
    Object.assign(import.meta.env, originalEnv);

    // `window.env` is jsdom's shared `window`, so a test that sets it (below) would otherwise leak
    // into later tests that expect it to be absent. `env.ts`'s `fetchEnv` treats a falsy
    // `window['env']` the same as "not present" (`window['env'] ? window['env'][name] : undefined`),
    // so deleting the property reproduces a fresh page load's "not present" state exactly.
    delete (window as { env?: unknown }).env;
  });

  it('reads API_BASE_URL from VITE_API_BASE_URL', async () => {
    import.meta.env.VITE_API_BASE_URL = '/test-api';
    const { default: env } = await import('./env');
    expect(env.backendUrl).toBe('/test-api');
  });

  it('falls back to window.env when VITE_PUBLIC_URL is empty', async () => {
    import.meta.env.VITE_PUBLIC_URL = '';
    window.env = { PUBLIC_URL: '/teams/epoca' };
    const { default: env } = await import('./env');
    expect(env.publicUrl).toBe('/teams/epoca');
  });

  it('does not leak VITE_API_BASE_URL or window.env set by earlier tests', async () => {
    const { default: env } = await import('./env');
    expect(env.backendUrl).not.toBe('/test-api');
    expect(env.publicUrl).not.toBe('/teams/epoca');
  });
});
