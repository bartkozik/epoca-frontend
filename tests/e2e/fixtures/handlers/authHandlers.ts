import type { ActorName } from '../../worlds';
import { createActorToken } from '../auth';
import type { MockHandler } from './types';

const PASSWORD = 'E2e-password-1!';

const credentials = (body: unknown): { email?: unknown; password?: unknown } =>
  body !== null && typeof body === 'object' ? body : {};

export const authHandlers: MockHandler[] = [
  {
    id: 'auth-login',
    method: 'POST',
    path: /^\/auth\/login$/,
    handle: (request, runtime) => {
      const { email, password } = credentials(request.body);
      const matchingActor = (
        Object.entries(runtime.state.actors) as [ActorName, (typeof runtime.state.actors)[ActorName]][]
      )
        .filter(([actorName]) => actorName !== 'anonymous')
        .find(([, actor]) => actor?.email === email);

      if (password !== PASSWORD || !matchingActor?.[1]) {
        return { status: 401, json: { message: 'Invalid credentials' } };
      }

      const actorName = matchingActor[0] as Exclude<ActorName, 'anonymous'>;
      runtime.setActor(actorName);

      return {
        status: 200,
        json: {
          accessToken: createActorToken(runtime.state, actorName),
          refreshToken: 'e2e-refresh-token',
        },
      };
    },
  },
  {
    id: 'auth-invalidate-refresh-token',
    method: 'DELETE',
    path: /^\/auth\/refresh-tokens\/e2e-device-0001$/,
    handle: () => ({ status: 204 }),
  },
];
