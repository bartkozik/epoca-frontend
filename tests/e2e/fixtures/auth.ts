import type { SessionUser } from '@/core/models/session';
import type { BrowserContext } from '@playwright/test';
import type { ActorName, BuiltWorld } from '../worlds';
import type { WorldRuntime } from '../worlds/runtime';

export const isOwnerActor = (runtime: WorldRuntime): boolean =>
  runtime.actor !== 'anonymous' && Boolean(runtime.state.actors[runtime.actor]?.organizationRoles.includes('Owner'));

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

interface ActorTokenPayload {
  id: string;
  exp: number;
  isSuperAdmin: false;
  identities: Array<{
    id: string;
    type: 'MailAddress';
    value: string;
    main: true;
    deviceId: null;
  }>;
  roles: Array<{ organizationId: string; roles: readonly string[] }>;
  authedBy: [];
}

const createActorPayload = (world: BuiltWorld, actorName: Exclude<ActorName, 'anonymous'>): ActorTokenPayload => {
  const actor = world.actors[actorName];
  if (!actor || !world.organization) throw new Error(`Actor ${actorName} is unavailable in ${world.name}`);

  return {
    id: actor.userId,
    exp: Math.floor(new Date('2027-07-15T10:00:00.000Z').getTime() / 1000),
    isSuperAdmin: false,
    identities: [
      {
        id: `${actor.userId}-email`,
        type: 'MailAddress',
        value: actor.email,
        main: true,
        deviceId: null,
      },
    ],
    roles: [{ organizationId: world.organization.id, roles: actor.organizationRoles }],
    authedBy: [],
  };
};

export const createActorToken = (world: BuiltWorld, actorName: Exclude<ActorName, 'anonymous'>): string => {
  const payload = createActorPayload(world, actorName);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.${encode('e2e-signature')}`;
};

// The JWT payload (createActorPayload/createActorToken above) is the real wire format the
// backend actually sends -- `roles`. What a real browser's localStorage ends up holding is never
// that: saveSession (src/core/api/utils.ts) always persists the ALREADY-TRANSFORMED Session shape
// (`organizationGrants`, via sessionSchema's transform). installActorSession seeds localStorage
// directly, bypassing saveSession entirely, so it must produce that same transformed shape itself
// here -- otherwise a test reading the stored blob back would see a shape no real user's browser
// would ever actually contain.
interface ActorSessionUser extends Omit<ActorTokenPayload, 'roles'> {
  organizationGrants: Array<{ organizationId: string; roles: string[] }>;
}

// A real compile-time link to the actual domain type this fixture is meant to simulate: if
// SessionUser (src/core/models/session.ts) ever gains or loses a field, this assignment starts
// failing typecheck instead of ActorSessionUser silently drifting out of sync with it.
const _assertActorSessionUserMatchesSessionUser = null as unknown as ActorSessionUser satisfies SessionUser;
void _assertActorSessionUserMatchesSessionUser;

const createActorSessionUser = (world: BuiltWorld, actorName: Exclude<ActorName, 'anonymous'>): ActorSessionUser => {
  const { roles, ...rest } = createActorPayload(world, actorName);
  return {
    ...rest,
    organizationGrants: roles.map(({ organizationId, roles: grantRoles }) => ({
      organizationId,
      roles: [...grantRoles],
    })),
  };
};

export const installActorSession = async (
  context: BrowserContext,
  world: BuiltWorld,
  actorName: ActorName,
): Promise<void> => {
  const actorSession =
    actorName === 'anonymous'
      ? null
      : {
          token: createActorToken(world, actorName),
          user: createActorSessionUser(world, actorName),
        };
  const organizationId = actorName === 'anonymous' ? null : (world.organization?.id ?? null);

  await context.addInitScript(
    ({ session, organizationId, organizationSlug }) => {
      const suffix = window.location.hostname;
      const prefix = 'IteratorsEpoca__';
      const sessionSeedKey = `${prefix}e2e__actor_session_seeded`;
      const keys = {
        access: `${prefix}auth__access_tok_${suffix}`,
        device: `${prefix}auth__device_id_${suffix}`,
        refresh: `${prefix}auth__ref_tok_${suffix}`,
        organization: `${prefix}org__slug_${suffix}`,
        organizationId: `${prefix}org__id_${suffix}`,
        language: `${prefix}user__lang_${suffix}`,
      };

      if (sessionStorage.getItem(sessionSeedKey)) return;
      sessionStorage.setItem(sessionSeedKey, 'true');

      if (session === null) {
        localStorage.removeItem(keys.access);
        localStorage.setItem(keys.device, 'e2e-device-0001');
        localStorage.removeItem(keys.refresh);
        localStorage.removeItem(keys.organization);
        localStorage.removeItem(keys.organizationId);
        localStorage.removeItem(keys.language);
        return;
      }

      localStorage.setItem(keys.access, JSON.stringify(session));
      localStorage.setItem(keys.device, 'e2e-device-0001');
      localStorage.removeItem(keys.refresh);
      if (organizationSlug) localStorage.setItem(keys.organization, organizationSlug);
      if (organizationId) localStorage.setItem(keys.organizationId, organizationId);
      localStorage.setItem(keys.language, 'pl');
    },
    { session: actorSession, organizationId, organizationSlug: world.organization?.slug ?? null },
  );
};
