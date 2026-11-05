import { z } from 'zod';

const demoSessionSchema = z.object({
  accessToken: z.string().min(1),
  organizationSlug: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export type DemoSession = z.infer<typeof demoSessionSchema>;

export async function requestDemoSession(
  action: 'resume' | 'start' | 'reset',
  signal?: AbortSignal,
): Promise<DemoSession | null> {
  const response = await fetch(`/api/demo/${action === 'reset' ? 'reset' : 'session'}`, {
    method: action === 'resume' ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (response.status === 401 && action === 'resume') return null;
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'The demo is busy. Please wait a minute before trying again.'
        : 'The demo is temporarily unavailable. Please try again.',
    );
  }
  return demoSessionSchema.parse(await response.json());
}
