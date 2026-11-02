import { webcrypto } from 'node:crypto';
import { createGravatarUrl } from './gravatar';

describe('createGravatarUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hashes the trimmed lowercase email with SHA-256 and requests safe 404 fallback', async () => {
    expect(await createGravatarUrl(' Ada@Example.COM ')).toBe(
      'https://gravatar.com/avatar/b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72?s=96&r=g&d=404',
    );
  });

  it.each([undefined, '', 'Unknown', 'ada', 'ada@', 'ada @example.com'])(
    'ignores missing or malformed email %s',
    async (email) => {
      expect(await createGravatarUrl(email)).toBeUndefined();
    },
  );

  it('handles unavailable browser crypto', async () => {
    vi.stubGlobal('crypto', undefined);
    expect(await createGravatarUrl('ada@example.com')).toBeUndefined();
  });

  it('handles a browser crypto failure', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('Unavailable')) } });
    expect(await createGravatarUrl('ada@example.com')).toBeUndefined();
  });
});
