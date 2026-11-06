import { expect, test } from '@playwright/test';
import { boundedFetch, withLifecycleDeadline } from './network';

test('every Node-side live fetch receives a bounded abort signal @mr @technical', async () => {
  let capturedSignal: AbortSignal | null | undefined;
  const fetcher = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    capturedSignal = init?.signal;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  await boundedFetch('https://staging.example.test/api', { method: 'GET' }, fetcher, 100);
  expect(capturedSignal).toBeInstanceOf(AbortSignal);
  expect(capturedSignal?.aborted).toBe(false);
});

test('a lifecycle deadline cancels stalled response-body work before guarded finalization returns @mr @technical', async () => {
  test.setTimeout(2_000);
  const events: string[] = [];
  let activeBodyWork = 0;

  const lifecycle = withLifecycleDeadline(
    async (signal) => {
      try {
        const response = await boundedFetch(
          'https://staging.example.test/api',
          { method: 'GET', signal },
          (_input: RequestInfo | URL, init?: RequestInit) => {
            init?.signal?.addEventListener('abort', () => events.push('fetch-signal-aborted'), { once: true });
            return Promise.resolve(
              new Response(
                new ReadableStream<Uint8Array>({
                  start() {
                    activeBodyWork += 1;
                    events.push('body-started');
                  },
                  cancel() {
                    events.push('body-cancel-started');
                    return new Promise<void>((resolve) => {
                      queueMicrotask(() => {
                        activeBodyWork -= 1;
                        events.push('body-cancel-finished');
                        resolve();
                      });
                    });
                  },
                }),
                { headers: { 'Content-Type': 'application/json' }, status: 200 }
              )
            );
          },
          1_000
        );
        events.push('bounded-fetch-returned');
        await response.text();
      } finally {
        events.push('finalization-started');
        await new Promise<void>((resolve) => {
          queueMicrotask(() => {
            events.push('finalization-finished');
            resolve();
          });
        });
      }
    },
    'body lifecycle',
    10
  );
  const startedAt = performance.now();

  await expect(lifecycle).rejects.toThrow(/deadline/i);

  expect(performance.now() - startedAt).toBeLessThan(500);
  expect(activeBodyWork).toBe(0);
  expect(events).toEqual([
    'body-started',
    'fetch-signal-aborted',
    'body-cancel-started',
    'body-cancel-finished',
    'finalization-started',
    'finalization-finished',
  ]);
});

test('bounded Node responses preserve status headers and exactly-once JSON and env bodies @mr @technical', async () => {
  for (const expected of [
    { body: '{"ready":true}', contentType: 'application/json', status: 201 },
    {
      body: "window.env = { API_BASE_URL: 'https://api-staging.example.test/api/v1' };",
      contentType: 'application/javascript',
      status: 200,
    },
  ]) {
    const source = new Response(expected.body, {
      headers: { 'Content-Type': expected.contentType, 'X-Live-Response': 'preserved' },
      status: expected.status,
    });
    const response = await boundedFetch(
      'https://staging.example.test/api',
      { method: 'GET' },
      () => Promise.resolve(source),
      100
    );

    expect(source.bodyUsed).toBe(true);
    expect(response).not.toBe(source);
    expect(response.status).toBe(expected.status);
    expect(response.headers.get('content-type')).toContain(expected.contentType);
    expect(response.headers.get('x-live-response')).toBe('preserved');
    expect(response.bodyUsed).toBe(false);
    await expect(response.text()).resolves.toBe(expected.body);
    expect(response.bodyUsed).toBe(true);
    await expect(response.text()).rejects.toThrow();
  }
});

test('a pre-aborted lifecycle signal prevents the Node fetch from starting @mr @technical', async () => {
  const controller = new AbortController();
  controller.abort(new DOMException('lifecycle deadline', 'AbortError'));
  let calls = 0;

  await expect(
    boundedFetch(
      'https://staging.example.test/api',
      { method: 'GET', signal: controller.signal },
      () => {
        calls += 1;
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
      100
    )
  ).rejects.toThrow(/lifecycle deadline/i);
  expect(calls).toBe(0);
});

test('the deadline aborts and awaits guarded finalization before returning @mr @technical', async () => {
  const events: string[] = [];
  const lifecycle = withLifecycleDeadline(
    async (signal) => {
      events.push('started');
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            events.push('aborted');
            queueMicrotask(() => {
              events.push('cleanup-finished');
              resolve();
            });
          },
          { once: true }
        );
      });
      events.push('settled');
    },
    'test lifecycle',
    10
  );

  await expect(lifecycle).rejects.toThrow(/deadline|timed out/i);
  expect(events).toEqual(['started', 'aborted', 'cleanup-finished', 'settled']);
});

test('a normal lifecycle receives a live signal and preserves its result @mr @technical', async () => {
  await expect(
    withLifecycleDeadline(
      (signal) => {
        expect(signal.aborted).toBe(false);
        return Promise.resolve('completed');
      },
      'normal lifecycle',
      100
    )
  ).resolves.toBe('completed');
});
