type Environment = NodeJS.ProcessEnv | Record<string, string | undefined>;

export interface OAuthClientDisposableBoundary {
  reviewId: string;
  organizationSlug: string;
}

const grepValues = (argv: readonly string[]): string[] => {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--grep' || argument === '-g') {
      values.push(argv[index + 1] ?? '');
      index += 1;
    } else if (argument.startsWith('--grep=')) {
      values.push(argument.slice('--grep='.length));
    }
  }
  return values;
};

export const isOAuthClientTargetedSelection = (
  argv: readonly string[] = process.argv,
  env: Environment = process.env
): boolean =>
  env.PLAYWRIGHT_LIVE_OAUTH_CLIENT_TARGETED === 'true' || grepValues(argv).some((value) => /oauth-client/i.test(value));

export const assertOAuthClientDisposableReviewEnvironment = (
  env: Environment = process.env
): OAuthClientDisposableBoundary => {
  if (env.PLAYWRIGHT_LIVE_OAUTH_CLIENT_DISPOSABLE_REVIEW !== 'true') {
    throw new Error('OAuth client live lifecycle requires an explicit disposable review environment');
  }
  const reviewId = env.PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ID ?? '';
  if (!/^oauth-client-review-[a-z0-9-]+$/.test(reviewId)) throw new Error('OAuth client disposable review identifier is invalid');
  const reviewOrganization = env.PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ORG_ID ?? '';
  const allowedOrganization = env.PLAYWRIGHT_LIVE_ALLOWED_ORG_ID ?? '';
  if (!reviewOrganization || reviewOrganization !== allowedOrganization) {
    throw new Error('OAuth client review organization is outside the exact allowed boundary');
  }
  const organizationSlug = env.PLAYWRIGHT_LIVE_ORG_SLUG ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(organizationSlug)) throw new Error('OAuth client review organization slug is invalid');
  const reviewHosts = (env.PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (reviewHosts.length === 0 || new Set(reviewHosts).size !== reviewHosts.length) {
    throw new Error('OAuth client disposable review host allowlist is invalid');
  }
  for (const value of [env.PLAYWRIGHT_LIVE_BASE_URL, env.PLAYWRIGHT_LIVE_API_BASE_URL]) {
    let url: URL;
    try {
      url = new URL(value ?? '');
    } catch {
      throw new Error('OAuth client disposable review host target is invalid');
    }
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
    const host = url.port ? `${hostname}:${url.port}` : hostname;
    const reviewIdBound = hostname.split('.').includes(reviewId);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !reviewHosts.includes(host) ||
      !reviewIdBound ||
      hostname === 'epoca-staging.company-5897fee414.example.invalid'
    ) {
      throw new Error('OAuth client disposable review host is outside the exact review allowlist');
    }
  }
  return { reviewId, organizationSlug };
};

export const assertOAuthClientTargetedSelection = (
  argv: readonly string[] = process.argv,
  env: Environment = process.env
): boolean => {
  const targeted = isOAuthClientTargetedSelection(argv, env);
  if (targeted) assertOAuthClientDisposableReviewEnvironment(env);
  return targeted;
};
