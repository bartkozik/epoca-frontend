import { z } from 'zod';

export type ReleasePhase = 'deploy' | 'rollback';
export interface ReleasePolicy {
  phase: ReleasePhase;
  frontendOrigin: string;
  apiBaseURL: string;
  organizationSlug: string;
  projectIds: readonly string[];
  runId?: string;
}

export const releaseRunId = (value: string): string => {
  if (!/^ct527-[a-z0-9][a-z0-9-]{5,100}$/.test(value)) throw new Error('Invalid CT-527 run identity');
  return value;
};

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const parseBackendSha = (value: unknown, expected: string): string => {
  const actual = z.object({ commitSha: shaSchema }).parse(value).commitSha;
  if (actual !== shaSchema.parse(expected)) throw new Error('Deployed backend SHA differs from expected commit');
  return actual;
};

const fixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureId: z.string().regex(/^ct527-[a-z0-9-]+$/),
    frontendOrigin: z.string().url(),
    apiBaseURL: z.string().url(),
    organizationId: z.string().min(1),
    organizationSlug: z.string().regex(/^[a-z0-9-]+$/),
    projectId: z.string().min(1),
    projectName: z.string().startsWith('E2E CT-527 compatibility'),
    workUnitId: z.string().min(1),
    description: z.string().startsWith('E2E CT-527 compatibility'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      }),
  })
  .strict();
export type CompatibilityFixture = z.infer<typeof fixtureSchema>;
export const parseCompatibilityFixture = (
  value: unknown,
  organizationId: string,
  slug: string,
  fixtureId: string,
): CompatibilityFixture => {
  const fixture = fixtureSchema.parse(value);
  if (
    fixture.organizationId !== organizationId ||
    fixture.organizationSlug !== slug ||
    fixture.fixtureId !== fixtureId
  ) {
    throw new Error('Compatibility fixture does not match the approved binding');
  }
  return fixture;
};

export const assertReleaseRequest = (
  policy: ReleasePolicy,
  requestURL: string,
  method: string,
  body?: unknown,
): void => {
  const url = new URL(requestURL);
  const api = new URL(policy.apiBaseURL);
  const apiPrefix = `${api.pathname.replace(/\/$/, '')}/`;
  if (url.username || url.password || !['https:'].includes(url.protocol))
    throw new Error('Forbidden release network target');
  if (url.origin !== api.origin || !url.pathname.startsWith(apiPrefix)) {
    if (url.origin === policy.frontendOrigin && !url.pathname.startsWith('/api/') && ['GET', 'HEAD'].includes(method))
      return;
    throw new Error('Release request is outside approved origins or API path');
  }
  const suffix = url.pathname.slice(apiPrefix.length - 1);
  const org = `/organizations/${encodeURIComponent(policy.organizationSlug)}`;
  // Login currently discovers SAML via this fixed legacy slug. Never follow the IdP redirect.
  if (method === 'GET' && suffix === '/organizations/iterators/saml/authn') return;
  if (['GET', 'HEAD'].includes(method)) {
    if (
      suffix === '/organizations' ||
      suffix === '/users' ||
      suffix === '/build-info' ||
      suffix === org ||
      suffix.startsWith(`${org}/`)
    )
      return;
    throw new Error('Release read is outside the dedicated organization');
  }
  if (method === 'POST' && ['/auth/login', '/auth/refresh-token'].includes(suffix)) return;
  if (
    method === 'POST' &&
    [
      `${org}/work-units/export`,
      `${org}/pivot-tables/work-units/query`,
      `${org}/pivot-tables/work-units/export`,
    ].includes(suffix)
  )
    return;
  if (policy.phase === 'deploy') {
    if (method === 'PATCH' && policy.projectIds.some((id) => suffix === `${org}/projects/${encodeURIComponent(id)}`))
      return;
    if (method === 'POST' && suffix === `${org}/work-units`) {
      const parsed = z.object({ projectId: z.string(), description: z.string() }).safeParse(body);
      if (
        parsed.success &&
        policy.runId &&
        policy.projectIds.includes(parsed.data.projectId) &&
        parsed.data.description.startsWith(`E2E ${policy.runId} `)
      )
        return;
    }
  }
  throw new Error('Unexpected release mutation is forbidden');
};
