import { getRefreshedAccessToken, setRefreshAccessTokenHandler } from './tokenRefresh';

const deferred = (): { promise: Promise<string>; resolve: (value: string) => void } => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

it('shares a refresh only for the same token and handler', async () => {
  const first = deferred();
  const second = deferred();
  const handler = vi.fn((token: string) => (token === 'first' ? first.promise : second.promise));
  const unregister = setRefreshAccessTokenHandler(handler);

  const firstRequest = getRefreshedAccessToken('first');
  expect(getRefreshedAccessToken('first')).toBe(firstRequest);
  const secondRequest = getRefreshedAccessToken('second');
  expect(handler).toHaveBeenCalledTimes(2);

  first.resolve('first-access');
  second.resolve('second-access');
  await expect(firstRequest).resolves.toBe('first-access');
  await expect(secondRequest).resolves.toBe('second-access');
  unregister();
});

it('does not reuse a pending refresh after the handler changes', async () => {
  const pending = deferred();
  const unregisterOld = setRefreshAccessTokenHandler(() => pending.promise);
  const oldRequest = getRefreshedAccessToken('same');
  const newHandler = vi.fn().mockResolvedValue('new-access');
  const unregisterNew = setRefreshAccessTokenHandler(newHandler);

  await expect(getRefreshedAccessToken('same')).resolves.toBe('new-access');
  expect(newHandler).toHaveBeenCalledOnce();
  pending.resolve('old-access');
  await expect(oldRequest).resolves.toBe('old-access');
  unregisterOld();
  unregisterNew();
});
