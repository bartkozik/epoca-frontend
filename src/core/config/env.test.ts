import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('env', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of Object.keys(import.meta.env)) {
      if (!(key in originalEnv)) delete (import.meta.env as Record<string, unknown>)[key];
    }
    Object.assign(import.meta.env, originalEnv);

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
